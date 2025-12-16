// Gesture Projection Mapper - minimal but functional
// Depends on MediaPipe Hands and Three.js included in index.html

// ============ CONFIG ============
const mediaSrc = null; // if null, we use the webcam stream or sample fallback
const useWebcamForTexture = true; // show live webcam inside the window by default
const maxHands = 2; // allow two hands
const cornerPickThreshold = 0.2; // higher = easier to grab corners
const smoothingFactor = 0.1; // 0-1, higher = smoother but more lag (0.1 = responsive)

// ============ DOM ============
const container = document.getElementById('container');
const helpText = document.getElementById('helpText');
const togglePerformanceBtn = document.getElementById('togglePerformance');
const saveLayoutBtn = document.getElementById('saveLayout');
const loadBtn = document.getElementById('loadBtn');
const layoutFile = document.getElementById('layoutFile');
const mediaFileInput = document.getElementById('mediaFile');
const menuToggle = document.getElementById('menuToggle');
const toggleIcon = document.getElementById('toggleIcon');
const controlsPanel = document.getElementById('controls');

let performanceMode = false;
let camPreviewVisible = true; // track preview visibility

// ============ VIDEO / MEDIA SETUP ============
const camVideo = document.createElement('video');
camVideo.autoplay = true;
camVideo.muted = true;
camVideo.playsInline = true;
camVideo.style.display = 'none';
document.body.appendChild(camVideo);

// A separate displayMedia (the one mapped into the quad). By default we'll use camVideo as texture.
let mediaElement = camVideo; // can be swapped to a <video> or <img> from file input
let videoTexture = null;
let backgroundTexture = null;
let backgroundMesh = null;
let overlayCanvas = null;
let overlayCtx = null;

// Video element is hidden - only used for texture, no preview
camVideo.style.display = 'none';

function attachVideoTexture() {
  if (camVideo.videoWidth > 0 && camVideo.videoHeight > 0) {
    // Create/update overlay texture (for the projection quad)
    if (!videoTexture && material) {
      videoTexture = new THREE.VideoTexture(camVideo);
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.format = THREE.RGBAFormat;
      // mirror texture
      videoTexture.wrapS = THREE.RepeatWrapping;
      videoTexture.repeat.x = -1;
      videoTexture.offset.x = 1;
      material.map = videoTexture;
      material.needsUpdate = true;
    }

    // Create/update background texture (for full-screen background)
    if (!backgroundTexture) {
      backgroundTexture = new THREE.VideoTexture(camVideo);
      backgroundTexture.minFilter = THREE.LinearFilter;
      backgroundTexture.magFilter = THREE.LinearFilter;
      backgroundTexture.format = THREE.RGBAFormat;
      // Mirror texture horizontally
      backgroundTexture.wrapS = THREE.RepeatWrapping;
      backgroundTexture.repeat.x = -1;
      backgroundTexture.offset.x = 1;
      console.log('Background texture created');
    }
    
    // SIMPLIFIED: Just attach the texture directly
    if (backgroundMesh && backgroundTexture) {
      backgroundMesh.material.map = backgroundTexture;
      backgroundMesh.material.needsUpdate = true;
      console.log('✓ Background texture attached! Video:', camVideo.videoWidth, 'x', camVideo.videoHeight);
    }

    console.log('Webcam texture attached', camVideo.videoWidth, camVideo.videoHeight);
    helpText.innerText = 'Camera ready. Close hand (fist) near corner to grab.';
  }
}

// Initialize camera
async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    helpText.innerText = 'Camera API not available in this browser.';
    console.error('getUserMedia not available');
    return;
  }

  try {
    console.log('Requesting webcam…');
    const s = await navigator.mediaDevices.getUserMedia({ video: { width:1280, height:720 }, audio:false });
    camVideo.srcObject = s;
    camVideo.onplaying = attachVideoTexture;
    camVideo.onloadeddata = attachVideoTexture;
    await camVideo.play();
    attachVideoTexture();
  } catch (e) {
    let msg = 'Camera access denied or not available.';
    if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') msg = 'Camera permission denied. Allow access and reload.';
    if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') msg = 'No camera found. Connect a camera.';
    helpText.innerText = msg;
    console.error('getUserMedia error:', e);
  }
}
startCamera();

// ============ THREE.JS SETUP ============
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // alpha: true to see background mesh
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setClearColor(0x000000, 0); // transparent so we see the background mesh
container.appendChild(renderer.domElement);

// 2D overlay for hand visualization
overlayCanvas = document.createElement('canvas');
overlayCanvas.width = window.innerWidth;
overlayCanvas.height = window.innerHeight;
overlayCanvas.style.cssText = 'position:absolute; inset:0; z-index:15; pointer-events:none;';
overlayCtx = overlayCanvas.getContext('2d');
container.appendChild(overlayCanvas);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 2);
scene.add(camera);

// simple ambient
const light = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(light);

// full-screen background plane (shows webcam) - SIMPLIFIED
// Use a large fixed size that will definitely fill the screen - ZOOMED OUT
const bgSize = 15; // increased from 10 to zoom out the background
const bgGeo = new THREE.PlaneGeometry(bgSize, bgSize);
const bgPlaceholder = new THREE.DataTexture(new Uint8Array([50, 50, 50, 255]), 1, 1, THREE.RGBAFormat);
bgPlaceholder.needsUpdate = true;
const bgMat = new THREE.MeshBasicMaterial({ 
  map: bgPlaceholder, 
  depthWrite: false,
  depthTest: false,
  side: THREE.DoubleSide
});
backgroundMesh = new THREE.Mesh(bgGeo, bgMat);
backgroundMesh.position.set(0, 0, -1.5); // behind everything
backgroundMesh.renderOrder = -999;
scene.add(backgroundMesh);
console.log('Background mesh created - simple approach, size:', bgSize, 'x', bgSize);

// a parent group for the projection window so we can scale/rotate as a whole (overlay)
const windowGroup = new THREE.Group();
scene.add(windowGroup);

// Create a quad (custom geometry with 4 vertices so corners are editable)
const geometry = new THREE.BufferGeometry();
// positions of four vertices (will be updated)
const positions = new Float32Array([
  -0.5,  0.5, 0.0,  // TL 0
   0.5,  0.5, 0.0,  // TR 1
  -0.5, -0.5, 0.0,  // BL 2
   0.5, -0.5, 0.0   // BR 3
]);
// indices for two triangles: 0,1,2 and 2,1,3
const indices = new Uint16Array([0,1,2, 2,1,3]);

// UVs mapping for texture
const uvs = new Float32Array([
  0,1,
  1,1,
  0,0,
  1,0
]);

geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
geometry.setIndex(new THREE.BufferAttribute(indices, 1));
geometry.computeVertexNormals();

// Placeholder texture until webcam is ready
const placeholderTexture = new THREE.DataTexture(new Uint8Array([30, 30, 30, 255]), 1, 1, THREE.RGBAFormat);
placeholderTexture.needsUpdate = true;

const material = new THREE.MeshBasicMaterial({ map: placeholderTexture, toneMapped: false, side: THREE.DoubleSide });
const mesh = new THREE.Mesh(geometry, material);
mesh.renderOrder = 1; // render after background
windowGroup.add(mesh);

// Helpers: corner markers (small spheres) and lines between them
const cornerSpheres = [];
const cornerPositions = [0,1,2,3].map(i => new THREE.Vector3(positions[i*3+0], positions[i*3+1], positions[i*3+2]));
const sphereGeom = new THREE.SphereGeometry(0.04, 12, 10); // larger for easier grabbing/hover
const defaultColor = 0xff8800; // orange
const grabbedColor = 0x00ff00; // green when grabbed

// Initialize arrays before using them
let originalSphereColors = []; // store original colors
let targetCornerPositions = []; // for smoothing

for (let i=0;i<4;i++){
  const sphereMat = new THREE.MeshBasicMaterial({ color: defaultColor });
  const s = new THREE.Mesh(sphereGeom, sphereMat);
  s.position.copy(cornerPositions[i]);
  s.renderOrder = 2; // render on top
  scene.add(s);
  cornerSpheres.push(s);
  originalSphereColors.push(defaultColor);
  targetCornerPositions.push(cornerPositions[i].clone());
}

// A visible outline (thin lines) to better see the quad
const outlineMat = new THREE.LineBasicMaterial({ color: 0x00ffcc, linewidth: 2 });
const lineGeom = new THREE.BufferGeometry();
const linePos = new Float32Array([0,0,0, 0,0,0, 0,0,0, 0,0,0, 0,0,0]); // 5 points looped
lineGeom.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
const outline = new THREE.Line(lineGeom, outlineMat);
outline.renderOrder = 2; // render on top
scene.add(outline);

// ============ Interaction State ============
let selectedCorner = -1;
let isGrabbing = false; // changed from isPinching
let startScale = 1.0;
let currentScale = 1.0;
let mouseSelectedCorner = -1; // for mouse interaction
let isMouseDragging = false;
// Note: targetCornerPositions and originalSphereColors are declared above with corner spheres

// convert normalized 0..1 hand coords (MediaPipe) to NDC (-1 .. 1)
// Mirror hand coords horizontally to match mirrored video view
function screenToNDC(xNorm, yNorm){
  const mirroredX = 1 - xNorm;
  return { x: mirroredX * 2 - 1, y: - (yNorm * 2 - 1) };
}

// Detect if hand is closed (fist) - checks if fingertips are close to palm
function isHandClosed(landmarks) {
  if (!landmarks || landmarks.length < 21) return false;
  
  const wrist = landmarks[0];
  const palmCenter = landmarks[9]; // middle finger base
  
  // Check distances from fingertips to palm/wrist
  const fingertips = [
    landmarks[4],  // thumb tip
    landmarks[8],   // index tip
    landmarks[12],  // middle tip
    landmarks[16],  // ring tip
    landmarks[20]   // pinky tip
  ];
  
  let closedCount = 0;
  const threshold = 0.18; // looser threshold for easier grab detection
  
  fingertips.forEach(tip => {
    const distToPalm = Math.hypot(tip.x - palmCenter.x, tip.y - palmCenter.y);
    const distToWrist = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
    if (distToPalm < threshold || distToWrist < threshold) {
      closedCount++;
    }
  });
  
  // If 2+ fingers are closed, consider it a fist (more permissive)
  return closedCount >= 2;
}

// move a corner given an ndc coordinate (casts a ray from camera into z=0 plane)
const raycaster = new THREE.Raycaster();
const tmpVec = new THREE.Vector2();
function ndcToWorld(xNdc, yNdc){
  tmpVec.set(xNdc, yNdc);
  raycaster.setFromCamera(tmpVec, camera);
  // intersect with z=0 plane
  const planeZ = new THREE.Plane(new THREE.Vector3(0,0,1), 0);
  const pt = new THREE.Vector3();
  raycaster.ray.intersectPlane(planeZ, pt);
  return pt;
}

// update geometry attributes and helpers from cornerPositions
function applyCornerPositionsToGeometry(){
  for (let i=0;i<4;i++){
    positions[i*3+0] = cornerPositions[i].x;
    positions[i*3+1] = cornerPositions[i].y;
    positions[i*3+2] = cornerPositions[i].z;
    cornerSpheres[i].position.copy(cornerPositions[i]);
  }
  geometry.attributes.position.needsUpdate = true;

  // update outline positions (loop)
  const arr = outline.geometry.attributes.position.array;
  for (let i=0;i<4;i++){
    arr[i*3+0] = cornerPositions[i].x;
    arr[i*3+1] = cornerPositions[i].y;
    arr[i*3+2] = cornerPositions[i].z;
  }
  // repeat first at end
  arr[12] = cornerPositions[0].x; arr[13] = cornerPositions[0].y; arr[14] = cornerPositions[0].z;
  outline.geometry.attributes.position.needsUpdate = true;
  geometry.computeVertexNormals();
}

// init corners to a visible square (proper rectangle) - make it larger and more visible
const squareSize = 0.8; // increased from 0.5 to make it more visible
cornerPositions[0].set(-squareSize, squareSize, 0);   // TL
cornerPositions[1].set( squareSize, squareSize, 0);   // TR
cornerPositions[2].set(-squareSize, -squareSize, 0); // BL
cornerPositions[3].set( squareSize, -squareSize, 0);  // BR
// Initialize target positions for smoothing
for (let i=0;i<4;i++){
  targetCornerPositions[i].copy(cornerPositions[i]);
}
applyCornerPositionsToGeometry();
console.log('Projection quad initialized with corners at ±', squareSize);

// ============ Media Loading via file input ============
mediaFileInput.addEventListener('change', (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  if (f.type.startsWith('image/')) {
    const img = document.createElement('img');
    img.src = url;
    img.onload = () => {
      // swap mediaElement to image, but Three.VideoTexture expects video; instead use THREE.Texture on image
      const tex = new THREE.Texture(img);
      tex.needsUpdate = true;
      material.map = tex;
      material.needsUpdate = true;
      helpText.innerText = 'Image loaded. Map corners and go to Performance Mode.';
    };
  } else if (f.type.startsWith('video/')) {
    const vid = document.createElement('video');
    vid.src = url;
    vid.muted = true;
    vid.loop = true;
    vid.autoplay = true;
    vid.playsInline = true;
    vid.style.display = 'none';
    document.body.appendChild(vid);
    vid.onloadeddata = () => {
      vid.play();
      const tex = new THREE.VideoTexture(vid);
      tex.minFilter = THREE.LinearFilter;
      material.map = tex;
      material.needsUpdate = true;
      helpText.innerText = 'Video loaded. Map corners and go to Performance Mode.';
    };
  }
});

// ============ MEDIA PIPE (Hands) SETUP ============
const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: maxHands,
  modelComplexity: 1,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6
});

let lastHand = null;
let allHands = [];

hands.onResults((results) => {
  allHands = results.multiHandLandmarks || [];
  drawHandsOverlay(allHands);

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    lastHand = null;
    // Release if hand disappears
    if (isGrabbing) {
      isGrabbing = false;
      if (selectedCorner >= 0) {
        cornerSpheres[selectedCorner].material.color.setHex(originalSphereColors[selectedCorner]);
      }
      selectedCorner = -1;
    }
    helpText.innerText = performanceMode ? '' : 'No hands detected. Hold up your hand to control the scene.';
    return;
  }
  lastHand = results.multiHandLandmarks[0];

  // Check if hand is closed (fist)
  const handClosed = isHandClosed(lastHand);
  const indexTip = lastHand[8]; // index fingertip for position

  if (handClosed) {
    // Hand is closed (fist) - grab or hold
    if (!isGrabbing) {
      // Just closed hand - try to grab a corner
      isGrabbing = true;
      startScale = currentScale;
      
      // attempt to select a corner if the index fingertip is near any corner (in screen NDC)
      const ndc = screenToNDC(indexTip.x, indexTip.y);
      // project corners to NDC by projecting their world pos into screen
      let picked = -1;
      let minD = 999;
      for (let i=0;i<4;i++){
        const cp = cornerPositions[i].clone();
        cp.project(camera);
        const dx = cp.x - ndc.x;
        const dy = cp.y - ndc.y;
        const d = Math.hypot(dx,dy);
        if (d < minD) { minD = d; picked = i; }
      }
      // threshold to pick
      if (minD < cornerPickThreshold) {
        selectedCorner = picked;
        // Change color to indicate grabbing
        cornerSpheres[selectedCorner].material.color.setHex(grabbedColor);
        helpText.innerText = `Corner ${selectedCorner} grabbed (close hand to hold)`;
      } else {
        selectedCorner = -1; // scale instead
        helpText.innerText = 'Fist (no corner) — scaling';
      }
    } else {
      // Already grabbing - update position or scale
      if (selectedCorner >= 0) {
        // Move selected corner smoothly to current index fingertip position
        const ndc = screenToNDC(indexTip.x, indexTip.y);
        const worldPt = ndcToWorld(ndc.x, ndc.y);
        targetCornerPositions[selectedCorner].copy(worldPt);
      } else {
        // No corner selected: do nothing (disable hand-based scaling)
      }
    }
  } else {
    // Hand is open - release
    if (isGrabbing) {
      isGrabbing = false;
      if (selectedCorner >= 0) {
        // Restore original color
        cornerSpheres[selectedCorner].material.color.setHex(originalSphereColors[selectedCorner]);
        helpText.innerText = performanceMode ? '' : 'Corner released (open hand)';
      } else {
        helpText.innerText = performanceMode ? '' : 'Released.';
      }
      selectedCorner = -1;
    } else {
      // idle
      helpText.innerText = performanceMode ? '' : 'Ready. Close hand (fist) near corner to grab.';
    }
  }
});

// simple 2D overlay showing hand landmarks/lines
const handColors = ['#00e0ff', '#ff7a00'];
function drawHandsOverlay(handsLm) {
  if (!overlayCtx) return;
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  handsLm.forEach((lm, idx) => {
    const color = handColors[idx % handColors.length];
    const mapX = (x) => (1 - x) * overlayCanvas.width; // flip horizontally to match mirrored video
    const mapY = (y) => y * overlayCanvas.height;
    // draw connections (subset)
    const connections = [
      [0,1],[1,2],[2,3],[3,4],      // thumb
      [0,5],[5,6],[6,7],[7,8],      // index
      [5,9],[9,10],[10,11],[11,12], // middle
      [9,13],[13,14],[14,15],[15,16], // ring
      [13,17],[17,18],[18,19],[19,20], // pinky
      [0,17] // wrist to pinky base
    ];
    overlayCtx.lineWidth = 3;
    overlayCtx.strokeStyle = color;
    overlayCtx.fillStyle = color;
    overlayCtx.globalAlpha = 0.9;

    overlayCtx.beginPath();
    connections.forEach(([a,b], i) => {
      const ax = mapX(lm[a].x);
      const ay = mapY(lm[a].y);
      const bx = mapX(lm[b].x);
      const by = mapY(lm[b].y);
      overlayCtx.moveTo(ax, ay);
      overlayCtx.lineTo(bx, by);
    });
    overlayCtx.stroke();

    lm.forEach((p) => {
      const x = mapX(p.x);
      const y = mapY(p.y);
      overlayCtx.beginPath();
      overlayCtx.arc(x, y, 5, 0, Math.PI * 2);
      overlayCtx.fill();
    });

    // label
    const wrist = lm[0];
    overlayCtx.font = '14px system-ui';
    overlayCtx.fillStyle = color;
    overlayCtx.fillText(`Hand ${idx+1}`, mapX(wrist.x) + 8, mapY(wrist.y) - 8);
  });
}

// camera_utils for feeding video frames to hands
const cameraFeed = new Camera(camVideo, {
  onFrame: async () => {
    await hands.send({ image: camVideo });
  },
  width: 1280,
  height: 720
});
cameraFeed.start();

// ============ RENDER LOOP ============
function animate(){
  requestAnimationFrame(animate);
  
  // Smooth interpolation of corner positions
  for (let i=0;i<4;i++){
    cornerPositions[i].lerp(targetCornerPositions[i], smoothingFactor);
  }
  applyCornerPositionsToGeometry();
  
  // update video textures if they're videos (Three.VideoTexture auto-updates)
  if (videoTexture && videoTexture.image && videoTexture.image.readyState >= 2) {
    videoTexture.needsUpdate = true;
  }
  if (backgroundTexture && backgroundTexture.image) {
    if (backgroundTexture.image.readyState >= 2) {
      backgroundTexture.needsUpdate = true;
    }
    // Ensure background mesh has the texture
    if (backgroundMesh && backgroundMesh.material.map !== backgroundTexture) {
      backgroundMesh.material.map = backgroundTexture;
      backgroundMesh.material.needsUpdate = true;
    }
  }
  // render
  renderer.render(scene, camera);
}
animate();

// handle window resize
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  overlayCanvas.width = window.innerWidth;
  overlayCanvas.height = window.innerHeight;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  
  // Background size is fixed - no need to resize on window resize
});

// ============ MOUSE INTERACTION ============
// Convert mouse coordinates to NDC
function mouseToNDC(mouseX, mouseY) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((mouseX - rect.left) / rect.width) * 2 - 1;
  const y = -((mouseY - rect.top) / rect.height) * 2 + 1;
  return { x, y };
}

// Find nearest corner to mouse position
function findNearestCorner(ndcX, ndcY) {
  let nearest = -1;
  let minDist = Infinity;
  const pickThreshold = 0.15; // NDC units, more generous for easier grabbing
  
  for (let i = 0; i < 4; i++) {
    const cp = cornerPositions[i].clone();
    cp.project(camera);
    const dx = cp.x - ndcX;
    const dy = cp.y - ndcY;
    const dist = Math.hypot(dx, dy);
    if (dist < minDist && dist < pickThreshold) {
      minDist = dist;
      nearest = i;
    }
  }
  return nearest;
}

// Mouse down - select corner (works even under UI overlays)
function handleMouseDown(e) {
  // Check if clicking on a UI button - if so, don't interfere
  const target = e.target;
  if (target.tagName === 'BUTTON' || target.closest('.ui')) {
    return; // Let UI handle the click
  }
  
  const ndc = mouseToNDC(e.clientX, e.clientY);
  const corner = findNearestCorner(ndc.x, ndc.y);
  
  if (corner >= 0) {
    mouseSelectedCorner = corner;
    isMouseDragging = true;
    // Change color to indicate selection
    cornerSpheres[corner].material.color.setHex(grabbedColor);
    e.preventDefault();
    e.stopPropagation();
  }
}

renderer.domElement.addEventListener('mousedown', handleMouseDown);
window.addEventListener('mousedown', handleMouseDown, true); // Capture phase to catch events before UI

// Mouse move - drag corner or show hover (works even under UI overlays)
let hoveredCorner = -1;
function handleMouseMove(e) {
  const ndc = mouseToNDC(e.clientX, e.clientY);
  
  if (isMouseDragging && mouseSelectedCorner >= 0) {
    // Dragging - always work even if over UI
    const worldPt = ndcToWorld(ndc.x, ndc.y);
    targetCornerPositions[mouseSelectedCorner].copy(worldPt);
    e.preventDefault();
    e.stopPropagation();
  } else {
    // Hover detection - only if not over UI
    const target = e.target;
    if (!target.closest('.ui') && target !== helpText) {
      const corner = findNearestCorner(ndc.x, ndc.y);
      if (corner !== hoveredCorner) {
        // Reset previous hover
        if (hoveredCorner >= 0 && hoveredCorner !== mouseSelectedCorner) {
          cornerSpheres[hoveredCorner].material.color.setHex(originalSphereColors[hoveredCorner]);
        }
        // Set new hover
        hoveredCorner = corner;
        if (hoveredCorner >= 0 && hoveredCorner !== mouseSelectedCorner) {
          // Lighten the color on hover
          cornerSpheres[hoveredCorner].material.color.setHex(0xffaa00); // lighter orange
        }
      }
    }
  }
}

renderer.domElement.addEventListener('mousemove', handleMouseMove);
window.addEventListener('mousemove', handleMouseMove, true); // Capture phase

// Mouse up - release corner (works even under UI overlays)
function handleMouseUp(e) {
  if (isMouseDragging && mouseSelectedCorner >= 0) {
    // Restore original color
    cornerSpheres[mouseSelectedCorner].material.color.setHex(originalSphereColors[mouseSelectedCorner]);
    mouseSelectedCorner = -1;
    isMouseDragging = false;
    hoveredCorner = -1;
    e.preventDefault();
    e.stopPropagation();
  }
}

renderer.domElement.addEventListener('mouseup', handleMouseUp);
window.addEventListener('mouseup', handleMouseUp, true); // Capture phase

// Mouse leave - release if dragging
function handleMouseLeave(e) {
  if (isMouseDragging && mouseSelectedCorner >= 0) {
    cornerSpheres[mouseSelectedCorner].material.color.setHex(originalSphereColors[mouseSelectedCorner]);
    mouseSelectedCorner = -1;
    isMouseDragging = false;
  }
  // Reset hover
  if (hoveredCorner >= 0) {
    cornerSpheres[hoveredCorner].material.color.setHex(originalSphereColors[hoveredCorner]);
    hoveredCorner = -1;
  }
}

renderer.domElement.addEventListener('mouseleave', handleMouseLeave);

// Touch support for mobile
renderer.domElement.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    const touch = e.touches[0];
    const ndc = mouseToNDC(touch.clientX, touch.clientY);
    const corner = findNearestCorner(ndc.x, ndc.y);
    
    if (corner >= 0) {
      mouseSelectedCorner = corner;
      isMouseDragging = true;
      cornerSpheres[corner].material.color.setHex(grabbedColor);
      e.preventDefault();
    }
  }
});

renderer.domElement.addEventListener('touchmove', (e) => {
  if (isMouseDragging && mouseSelectedCorner >= 0 && e.touches.length === 1) {
    const touch = e.touches[0];
    const ndc = mouseToNDC(touch.clientX, touch.clientY);
    const worldPt = ndcToWorld(ndc.x, ndc.y);
    targetCornerPositions[mouseSelectedCorner].copy(worldPt);
    e.preventDefault();
  }
});

renderer.domElement.addEventListener('touchend', (e) => {
  if (isMouseDragging && mouseSelectedCorner >= 0) {
    cornerSpheres[mouseSelectedCorner].material.color.setHex(originalSphereColors[mouseSelectedCorner]);
    mouseSelectedCorner = -1;
    isMouseDragging = false;
    e.preventDefault();
  }
});

// ============ UI Controls ============
function enterPerformanceMode() {
  performanceMode = true;
  // Hide all UI elements
  cornerSpheres.forEach(s => s.visible = false);
  outline.visible = false;
  if (backgroundMesh) backgroundMesh.visible = false; // Hide webcam background
  controlsPanel.classList.remove('open'); // Close menu if open
  menuToggle.style.display = 'none'; // Hide toggle button
  overlayCanvas.style.display = 'none'; // Hide hand tracking overlay
  helpText.style.display = 'none'; // Hide help text
  
  // Make entire page black - only media window visible
  document.body.style.backgroundColor = '#000000';
  renderer.setClearColor(0x000000, 1); // Solid black background
  
  // Hide preview video element
  if (camVideo) camVideo.style.display = 'none';
  
  console.log('Performance Mode: ON - Only media window visible');
}

function exitPerformanceMode() {
  performanceMode = false;
  // Show all UI elements
  cornerSpheres.forEach(s => s.visible = true);
  outline.visible = true;
  if (backgroundMesh) backgroundMesh.visible = true; // Show webcam background
  menuToggle.style.display = 'flex'; // Show toggle button
  overlayCanvas.style.display = 'block'; // Show hand tracking overlay
  helpText.style.display = ''; // Show help text
  
  // Restore transparent background so webcam shows
  document.body.style.backgroundColor = '';
  renderer.setClearColor(0x000000, 0); // Transparent so background mesh shows
  
  // Show preview video element
  if (camVideo) camVideo.style.display = 'none'; // Keep hidden (it's just for texture)
  
  helpText.innerText = 'Exited Performance Mode';
  console.log('Performance Mode: OFF');
}

// Menu toggle button
let menuOpen = false;
menuToggle.addEventListener('click', (e) => {
  e.stopPropagation(); // Prevent corner dragging when clicking toggle
  menuOpen = !menuOpen;
  
  if (menuOpen) {
    // Open menu - animate + to X
    toggleIcon.classList.remove('plus');
    toggleIcon.classList.add('x');
    controlsPanel.classList.add('open');
  } else {
    // Close menu - animate X to +
    toggleIcon.classList.remove('x');
    toggleIcon.classList.add('plus');
    controlsPanel.classList.remove('open');
  }
});

togglePerformanceBtn.addEventListener('click', () => {
  if (performanceMode) {
    exitPerformanceMode();
  } else {
    enterPerformanceMode();
  }
});

// Escape key exits performance mode (works from anywhere)
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'Esc') {
    if (performanceMode) {
      exitPerformanceMode();
      e.preventDefault();
    }
  }
});

// Save layout -> JSON
saveLayoutBtn.addEventListener('click', () => {
  const layout = {
    corners: cornerPositions.map(p => ({ x: p.x, y: p.y, z: p.z })),
    scale: currentScale
  };
  const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'layout.json'; a.click();
  URL.revokeObjectURL(url);
});

// load layout file
loadBtn.addEventListener('click', () => layoutFile.click());
layoutFile.addEventListener('change', (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const layout = JSON.parse(reader.result);
      if (layout.corners && layout.corners.length === 4) {
        for (let i=0;i<4;i++){
          cornerPositions[i].set(layout.corners[i].x, layout.corners[i].y, layout.corners[i].z);
        }
        currentScale = layout.scale || 1.0;
        windowGroup.scale.set(currentScale, currentScale, currentScale);
        applyCornerPositionsToGeometry();
        helpText.innerText = 'Layout loaded';
      } else {
        helpText.innerText = 'Invalid layout file';
      }
    } catch (err) {
      helpText.innerText = 'Error reading layout file';
    }
  };
  reader.readAsText(file);
});

// simple helper to swap to a different media source (file)
mediaFileInput.addEventListener('change', (e) => {
  // handled above; this listener just clarifies that it's set up
});

// ============ NOTES / FUTURE IMPROVEMENTS ============
/*
  - Right now the corner movement moves corners in world plane z=0. You can change to move in depth too.
  - The scaling mapping is deliberately simple. You can replace it with a more natural "pinch -> move forward/back" mapping using additional landmarks (wrist depth or 3D z values).
  - Calibration: if you're projecting physically, you'll want to adjust the camera/in-world coordinate scale and maybe add a "snap-to-grid" or "nudge" UI for fine tuning.
  - Replace the quad mapping with a homography-warp shader for more advanced projector mapping (this simple geometry approach works for planar projection).
  - For multi-user or networked setups, add a backend and WebRTC / WebSockets.
  - Consider smoothing/filtering landmarks (low-pass) for stable control (especially for jitter).
*/

