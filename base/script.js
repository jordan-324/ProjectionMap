// Gesture Projection Mapper - minimal but functional
// Depends on MediaPipe Hands and Three.js included in index.html

// ============ CONFIG ============
const mediaSrc = null; // if null, we use the webcam stream or sample fallback
const useWebcamForTexture = true; // show live webcam inside the window by default
const maxHands = 2; // allow two hands
const smoothingFactor = 0.1; // 0-1, higher = smoother but more lag (0.1 = responsive)

// ============ DOM ============
const container = document.getElementById('container');
const helpText = document.getElementById('helpText');
const togglePerformanceBtn = document.getElementById('togglePerformance');
const menuToggle = document.getElementById('menuToggle');
const toggleIcon = document.getElementById('toggleIcon');
const controlsPanel = document.getElementById('controls');
const contextMenu = document.getElementById('contextMenu');
const deleteSegmentBtn = document.getElementById('deleteSegment');

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
    
    // Attach texture to shader material
    if (backgroundMesh && backgroundTexture) {
      backgroundMesh.material.uniforms.uTexture.value = backgroundTexture;
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

// Custom shader material for grayscale background
const bgVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const bgFragmentShader = `
  uniform sampler2D uTexture;
  varying vec2 vUv;
  void main() {
    vec4 color = texture2D(uTexture, vUv);
    // Convert to grayscale using luminance weights (standard RGB to grayscale conversion)
    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    gl_FragColor = vec4(vec3(gray), color.a);
  }
`;

const bgMat = new THREE.ShaderMaterial({
  uniforms: {
    uTexture: { value: bgPlaceholder }
  },
  vertexShader: bgVertexShader,
  fragmentShader: bgFragmentShader,
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
const defaultColor = 0xff0000; // red
const grabbedColor = 0x00ff00; // green when grabbed
const hoverColor = 0xff3333; // lighter red on hover

// Initialize arrays before using them
let originalSphereColors = []; // store original colors
let targetCornerPositions = []; // for smoothing

for (let i=0;i<4;i++){
  const sphereMat = new THREE.MeshBasicMaterial({ color: defaultColor });
  const s = new THREE.Mesh(sphereGeom, sphereMat);
  s.position.copy(cornerPositions[i]);
  s.renderOrder = 2; // render on top
  windowGroup.add(s); // Add to windowGroup so it scales/rotates with the mesh
  cornerSpheres.push(s);
  originalSphereColors.push(defaultColor);
  targetCornerPositions.push(cornerPositions[i].clone());
}

// A visible outline (thin lines) to better see the quad - uses LineLoop to connect all edges
const outlineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 }); // white
const lineGeom = new THREE.BufferGeometry();
// Initialize with 4 corners (will be updated dynamically)
const initialLinePos = new Float32Array([
  -0.8,  0.8, 0.0,  // TL
   0.8,  0.8, 0.0,  // TR
   0.8, -0.8, 0.0,  // BR
  -0.8, -0.8, 0.0   // BL
]);
lineGeom.setAttribute('position', new THREE.BufferAttribute(initialLinePos, 3));
const outline = new THREE.LineLoop(lineGeom, outlineMat); // LineLoop automatically connects last to first
outline.renderOrder = 2; // render on top
windowGroup.add(outline); // Add to windowGroup so it scales/rotates with the mesh

// ============ Interaction State ============
let mouseSelectedCorner = -1; // for mouse interaction
let isMouseDragging = false;
let depthOffset = 0; // for depth control with mouse wheel
let startDragZ = 0; // original z position when drag starts

// Hand gesture state
let leftHandPinching = false;
let leftScrollModeActive = false; // Pinch enables scroll mode for scale
let startHandY = 0; // Initial hand Y position when scroll mode starts
let startScale = 1.0;
let currentScale = 1.0;
let targetScale = 1.0; // For smooth interpolation
const scaleSmoothing = 0.15; // Smoothing factor for scale (lower = smoother, more lag)
const scaleSensitivity = 3.0; // How sensitive the Y-axis movement is for scaling

let rightHandPinching = false;
let rightScrollModeActive = false; // Pinch enables scroll mode for rotation
let startHandX = 0; // Initial hand X position when scroll mode starts
let startRotationY = 0;
let currentRotationY = 0;
let targetRotationY = 0;
const rotationSmoothing = 0.2; // Smoothing factor for rotation
const rotationSensitivity = 2.0; // How sensitive the X-axis movement is for rotation

// Note: targetCornerPositions and originalSphereColors are declared above with corner spheres

// convert normalized 0..1 hand coords (MediaPipe) to NDC (-1 .. 1)
// Mirror hand coords horizontally to match mirrored video view
function screenToNDC(xNorm, yNorm){
  const mirroredX = 1 - xNorm;
  return { x: mirroredX * 2 - 1, y: - (yNorm * 2 - 1) };
}

// Detect pinch gesture (thumb and index finger close together)
function getPinchDistance(landmarks) {
  if (!landmarks || landmarks.length < 21) return Infinity;
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  return Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y, thumbTip.z - indexTip.z);
}

function isPinching(landmarks, threshold = 0.05) {
  return getPinchDistance(landmarks) < threshold;
}

// move a corner given an ndc coordinate - supports depth control
const raycaster = new THREE.Raycaster();
const tmpVec = new THREE.Vector2();
function ndcToWorld(xNdc, yNdc, depthZ = 0){
  tmpVec.set(xNdc, yNdc);
  raycaster.setFromCamera(tmpVec, camera);
  // intersect with plane at specified depth (default z=0)
  const planeZ = new THREE.Plane(new THREE.Vector3(0,0,1), -depthZ);
  const pt = new THREE.Vector3();
  raycaster.ray.intersectPlane(planeZ, pt);
  return pt;
}

// Simple triangulation for polygon (fan from first vertex)
function updateGeometryForPolygon() {
  const numCorners = cornerPositions.length;
  if (numCorners < 3) return; // Need at least 3 corners
  
  // Update positions array
  const newPositions = new Float32Array(numCorners * 3);
  const newUVs = new Float32Array(numCorners * 2);

  // Standard UVs for the initial quad (free-transform style)
  // Order: TL, TR, BR, BL
  const standardUVs = [
    [0, 1], // TL
    [1, 1], // TR
    [1, 0], // BR
    [0, 0]  // BL
  ];

  // Compute bounds for any additional corners (when user adds segments)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < numCorners; i++) {
    minX = Math.min(minX, cornerPositions[i].x);
    maxX = Math.max(maxX, cornerPositions[i].x);
    minY = Math.min(minY, cornerPositions[i].y);
    maxY = Math.max(maxY, cornerPositions[i].y);
  }
  const rangeX = maxX - minX;
  const rangeY = maxY - minY;
  
  for (let i = 0; i < numCorners; i++) {
    newPositions[i*3+0] = cornerPositions[i].x;
    newPositions[i*3+1] = cornerPositions[i].y;
    newPositions[i*3+2] = cornerPositions[i].z;

    if (i < 4) {
      // Anchor the first 4 corners to fixed UVs for true free-transform warping
      newUVs[i*2+0] = standardUVs[i][0];
      newUVs[i*2+1] = standardUVs[i][1];
    } else if (rangeX > 0 && rangeY > 0) {
      // Map extra corners relative to current bounds so they also distort the texture
      newUVs[i*2+0] = (cornerPositions[i].x - minX) / rangeX;
      newUVs[i*2+1] = 1.0 - (cornerPositions[i].y - minY) / rangeY; // flip Y for texture space
    } else {
      // Fallback simple mapping
      newUVs[i*2+0] = (cornerPositions[i].x + 1) / 2;
      newUVs[i*2+1] = (cornerPositions[i].y + 1) / 2;
    }
  }
  
  // Create indices for triangulation (fan from vertex 0)
  const newIndices = [];
  for (let i = 1; i < numCorners - 1; i++) {
    newIndices.push(0, i, i + 1);
  }
  
  geometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(newUVs, 2));
  geometry.setIndex(newIndices);
  geometry.computeVertexNormals();
}

// update geometry attributes and helpers from cornerPositions
function applyCornerPositionsToGeometry(){
  const numCorners = cornerPositions.length;
  
  // Update sphere positions
  for (let i=0; i<numCorners; i++){
    if (cornerSpheres[i]) {
      cornerSpheres[i].position.copy(cornerPositions[i]);
    }
  }
  
  // Update mesh geometry
  updateGeometryForPolygon();
  
  // Update outline positions - LineLoop automatically connects last to first
  const outlinePositions = new Float32Array(numCorners * 3);
  for (let i=0; i<numCorners; i++){
    outlinePositions[i*3+0] = cornerPositions[i].x;
    outlinePositions[i*3+1] = cornerPositions[i].y;
    outlinePositions[i*3+2] = cornerPositions[i].z;
  }
  
  outline.geometry.setAttribute('position', new THREE.BufferAttribute(outlinePositions, 3));
  outline.geometry.attributes.position.needsUpdate = true;
}

// Add a new corner at the specified world position
function addCorner(worldPos) {
  const newPos = worldPos.clone();
  cornerPositions.push(newPos);
  targetCornerPositions.push(newPos.clone());
  
  // Create new sphere
  const sphereMat = new THREE.MeshBasicMaterial({ color: defaultColor });
  const s = new THREE.Mesh(sphereGeom, sphereMat);
  s.position.copy(newPos);
  s.renderOrder = 2;
  s.userData.cornerIndex = cornerPositions.length - 1; // Store index for deletion
  windowGroup.add(s); // Add to windowGroup so it scales/rotates with the mesh
  cornerSpheres.push(s);
  originalSphereColors.push(defaultColor);
  
  applyCornerPositionsToGeometry();
  console.log('Added corner at', newPos.x, newPos.y);
}

// Remove a corner by index
function removeCorner(index) {
  if (cornerPositions.length <= 3) {
    console.log('Cannot remove corner - need at least 3 corners');
    return;
  }
  
  // Remove from arrays
  cornerPositions.splice(index, 1);
  targetCornerPositions.splice(index, 1);
  originalSphereColors.splice(index, 1);
  
  // Remove sphere from windowGroup
  const sphere = cornerSpheres[index];
  windowGroup.remove(sphere);
  sphere.geometry.dispose();
  sphere.material.dispose();
  cornerSpheres.splice(index, 1);
  
  // Update userData indices for remaining spheres
  for (let i = index; i < cornerSpheres.length; i++) {
    cornerSpheres[i].userData.cornerIndex = i;
  }
  
  applyCornerPositionsToGeometry();
  console.log('Removed corner', index);
}

// init corners to a visible square (proper rectangle) - make it larger and more visible
// Order: TL -> TR -> BR -> BL (clockwise around perimeter)
const squareSize = 0.8; // increased from 0.5 to make it more visible
cornerPositions[0].set(-squareSize, squareSize, 0);   // TL
cornerPositions[1].set( squareSize, squareSize, 0);   // TR
cornerPositions[2].set( squareSize, -squareSize, 0);  // BR
cornerPositions[3].set(-squareSize, -squareSize, 0);  // BL
// Initialize target positions for smoothing
for (let i=0;i<4;i++){
  targetCornerPositions[i].copy(cornerPositions[i]);
}
applyCornerPositionsToGeometry();
console.log('Projection quad initialized with corners at ±', squareSize);

// ============ Media Loading via file input ============

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

let allHands = [];

hands.onResults((results) => {
  allHands = results.multiHandLandmarks || [];
  drawHandsOverlay(allHands);

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    // Release pinches if hands disappear
    if (leftHandPinching) {
      leftHandPinching = false;
    }
    if (rightHandPinching) {
      rightHandPinching = false;
    }
    helpText.innerText = performanceMode ? '' : 'No hands detected. Pinch with left hand to scale, right hand to rotate.';
    return;
  }

  // Separate left and right hands
  let leftHand = null;
  let rightHand = null;
  
  results.multiHandLandmarks.forEach((landmarks, idx) => {
    const handedness = results.multiHandedness?.[idx]?.label;
    if (handedness === 'Left') {
      leftHand = landmarks;
    } else if (handedness === 'Right') {
      rightHand = landmarks;
    }
  });

  // If only one hand detected, use it (MediaPipe may not always detect handedness correctly)
  if (!leftHand && !rightHand && results.multiHandLandmarks.length > 0) {
    // Default: first hand is left if only one detected
    leftHand = results.multiHandLandmarks[0];
  }

  // LEFT HAND: Pinch enables scroll mode, then Y-axis controls scale
  if (leftHand) {
    const leftPinching = isPinching(leftHand);
    
    // Get hand Y position (use wrist as reference point)
    const wrist = leftHand[0];
    const currentHandY = wrist.y;
    
    if (leftPinching && !leftHandPinching) {
      // Pinch detected - engage scroll mode
      leftHandPinching = true;
      leftScrollModeActive = true;
      startHandY = currentHandY; // Store initial hand Y position
      startScale = currentScale;
      targetScale = currentScale; // Sync target with current
    } else if (leftPinching && leftHandPinching && leftScrollModeActive) {
      // Continue in scroll mode - scale based on whole hand Y position
      // Calculate Y delta (in MediaPipe coords: 0 = top, 1 = bottom)
      // So moving hand up = smaller Y value, moving down = larger Y value
      const yDelta = currentHandY - startHandY;
      
      // Scale based on Y movement: 
      // Hand up (smaller Y, negative delta) = larger scale
      // Hand down (larger Y, positive delta) = smaller scale
      const scaleDelta = -yDelta * scaleSensitivity; // Invert because up should increase scale
      targetScale = startScale + scaleDelta;
      
      // Clamp scale to reasonable range
      targetScale = Math.max(0.1, Math.min(5.0, targetScale));
      
      // Target scale is set, smoothing will happen in render loop
    } else if (!leftPinching && leftHandPinching) {
      // Released pinch - exit scroll mode
      leftHandPinching = false;
      leftScrollModeActive = false;
      targetScale = currentScale; // Lock current scale
    }
  } else {
    // Left hand disappeared
    if (leftHandPinching || leftScrollModeActive) {
      leftHandPinching = false;
      leftScrollModeActive = false;
      targetScale = currentScale;
    }
  }

  // RIGHT HAND: Pinch enables scroll mode, then X-axis controls Y-axis rotation (left/right orientation)
  if (rightHand) {
    const rightPinching = isPinching(rightHand);
    
    // Get hand X position (use wrist as reference point)
    const wrist = rightHand[0];
    const currentHandX = wrist.x; // X position in normalized coordinates (0-1)
    
    if (rightPinching && !rightHandPinching) {
      // Pinch detected - engage scroll mode
      rightHandPinching = true;
      rightScrollModeActive = true;
      startHandX = currentHandX; // Store initial hand X position
      startRotationY = currentRotationY;
      targetRotationY = currentRotationY; // Sync target with current
    } else if (rightPinching && rightHandPinching && rightScrollModeActive) {
      // Continue in scroll mode - rotate based on X position
      // Calculate X delta (in MediaPipe coords: 0 = left, 1 = right)
      const xDelta = currentHandX - startHandX;
      
      // Rotate: X movement controls Y-axis rotation (left/right orientation)
      // Hand left (smaller X, negative delta) = rotate left (negative Y rotation)
      // Hand right (larger X, positive delta) = rotate right (positive Y rotation)
      const rotationDelta = xDelta * rotationSensitivity * Math.PI; // Scale to radians
      targetRotationY = startRotationY + rotationDelta;
      
      // Clamp rotation to reasonable range
      targetRotationY = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotationY));
      
      // Target rotation is set, smoothing will happen in render loop
    } else if (!rightPinching && rightHandPinching) {
      // Released pinch - exit scroll mode
      rightHandPinching = false;
      rightScrollModeActive = false;
      targetRotationY = currentRotationY; // Lock current rotation
    }
  } else {
    // Right hand disappeared
    if (rightHandPinching || rightScrollModeActive) {
      rightHandPinching = false;
      rightScrollModeActive = false;
      targetRotationY = currentRotationY;
    }
  }

  // Update help text
  if (!performanceMode) {
    if (leftHandPinching) {
      helpText.innerText = `Scaling: ${currentScale.toFixed(2)}x`;
    } else if (rightHandPinching) {
      helpText.innerText = `Rotating: ${(currentRotationY * 180 / Math.PI).toFixed(1)}°`;
    } else {
      helpText.innerText = 'Left hand: Pinch + Y-axis for scale. Right hand: Pinch + X-axis for rotation.';
    }
  }
});

// simple 2D overlay showing hand landmarks/lines
const handLineColor = '#ffffff'; // white for hand connections
const jointColor = '#ff0000'; // red for joints
function drawHandsOverlay(handsLm) {
  if (!overlayCtx) return;
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  handsLm.forEach((lm, idx) => {
    const mapX = (x) => (1 - x) * overlayCanvas.width; // flip horizontally to match mirrored video
    const mapY = (y) => y * overlayCanvas.height;
    // draw connections (subset) - WHITE
    const connections = [
      [0,1],[1,2],[2,3],[3,4],      // thumb
      [0,5],[5,6],[6,7],[7,8],      // index
      [5,9],[9,10],[10,11],[11,12], // middle
      [9,13],[13,14],[14,15],[15,16], // ring
      [13,17],[17,18],[18,19],[19,20], // pinky
      [0,17] // wrist to pinky base
    ];
    overlayCtx.lineWidth = 3;
    overlayCtx.strokeStyle = handLineColor; // white lines
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

    // Draw joints - RED
    overlayCtx.fillStyle = jointColor; // red joints
    lm.forEach((p) => {
      const x = mapX(p.x);
      const y = mapY(p.y);
      overlayCtx.beginPath();
      overlayCtx.arc(x, y, 5, 0, Math.PI * 2);
      overlayCtx.fill();
    });

    // label - white
    const wrist = lm[0];
    overlayCtx.font = '14px system-ui';
    overlayCtx.fillStyle = handLineColor; // white text
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
  
  // Smooth interpolation of corner positions (dynamic number of corners)
  for (let i=0; i<cornerPositions.length && i<targetCornerPositions.length; i++){
    cornerPositions[i].lerp(targetCornerPositions[i], smoothingFactor);
  }
  applyCornerPositionsToGeometry();
  
  // Smooth interpolation of scale for pinch gestures
  if (leftHandPinching && leftScrollModeActive) {
    // When actively pinching, use faster interpolation for responsiveness
    currentScale = currentScale + (targetScale - currentScale) * (1 - scaleSmoothing);
  } else {
    // When not pinching, smoothly settle to target
    currentScale = currentScale + (targetScale - currentScale) * 0.1;
  }
  
  // Smooth interpolation of rotation (Y-axis for left/right orientation)
  if (rightHandPinching && rightScrollModeActive) {
    // When actively rotating, use faster interpolation for responsiveness
    currentRotationY = currentRotationY + (targetRotationY - currentRotationY) * (1 - rotationSmoothing);
  } else {
    // When not rotating, smoothly settle to target
    currentRotationY = currentRotationY + (targetRotationY - currentRotationY) * 0.1;
  }
  
  // Apply scale and rotation to windowGroup (origami-like transformation)
  windowGroup.scale.set(currentScale, currentScale, currentScale);
  windowGroup.rotation.y = currentRotationY; // Y-axis rotation (left/right) from right hand X-axis movement
  
  // update video textures if they're videos (Three.VideoTexture auto-updates)
  if (videoTexture && videoTexture.image && videoTexture.image.readyState >= 2) {
    videoTexture.needsUpdate = true;
  }
  if (backgroundTexture && backgroundTexture.image) {
    if (backgroundTexture.image.readyState >= 2) {
      backgroundTexture.needsUpdate = true;
    }
    // Ensure background mesh has the texture (grayscale shader)
    if (backgroundMesh && backgroundTexture && backgroundMesh.material.uniforms) {
      backgroundMesh.material.uniforms.uTexture.value = backgroundTexture;
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
  
  for (let i = 0; i < cornerPositions.length; i++) {
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
    depthOffset = 0; // Reset depth offset when starting new drag
    startDragZ = targetCornerPositions[corner].z; // Store original z position
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
    // Use original z position + depth offset
    const currentZ = startDragZ + depthOffset;
    const worldPt = ndcToWorld(ndc.x, ndc.y, currentZ);
    targetCornerPositions[mouseSelectedCorner].copy(worldPt);
    targetCornerPositions[mouseSelectedCorner].z = currentZ;
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
          cornerSpheres[hoveredCorner].material.color.setHex(hoverColor); // lighter red
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

// Mouse wheel / trackpad two-finger scroll for depth control when dragging
// The 'wheel' event works for both mouse wheels and trackpad gestures
renderer.domElement.addEventListener('wheel', (e) => {
  if (isMouseDragging && mouseSelectedCorner >= 0) {
    e.preventDefault();
    
    // Detect trackpad vs mouse wheel
    // Trackpads: deltaMode === 0 (pixels), typically smaller, smoother deltas
    // Mouse wheels: deltaMode === 1 (lines) or 2 (pages), larger discrete jumps
    const isTrackpad = e.deltaMode === 0; // Pixel-based scrolling (trackpad)
    const isMouseWheel = e.deltaMode === 1 || e.deltaMode === 2; // Line/page-based (mouse)
    
    // Adjust sensitivity based on input type
    let depthDelta;
    if (isTrackpad) {
      // Trackpad: more sensitive, smooth scrolling
      depthDelta = e.deltaY * 0.002; // Trackpads have smaller pixel deltas
    } else {
      // Mouse wheel: less sensitive per event (but larger deltas)
      depthDelta = e.deltaY * 0.01; // Mouse wheels have larger deltas
    }
    
    depthOffset += depthDelta;
    // Clamp depth to reasonable range
    depthOffset = Math.max(-2, Math.min(2, depthOffset));
    
    // Update the corner position with new depth
    const ndc = mouseToNDC(e.clientX, e.clientY);
    const currentZ = startDragZ + depthOffset;
    const worldPt = ndcToWorld(ndc.x, ndc.y, currentZ);
    targetCornerPositions[mouseSelectedCorner].copy(worldPt);
    targetCornerPositions[mouseSelectedCorner].z = currentZ;
  }
}, { passive: false });

// ============ RIGHT-CLICK FUNCTIONALITY ============
let contextMenuCornerIndex = -1;

// Check if click is near window edge
function isNearWindowEdge(ndcX, ndcY, threshold = 0.85) {
  return Math.abs(ndcX) > threshold || Math.abs(ndcY) > threshold;
}

// Right-click handler - spawn segment on edge or show context menu
renderer.domElement.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const ndc = mouseToNDC(e.clientX, e.clientY);
  
  // Check if right-clicking on a corner
  const corner = findNearestCorner(ndc.x, ndc.y);
  if (corner >= 0) {
    // Show context menu for deleting
    contextMenuCornerIndex = corner;
    contextMenu.style.display = 'block';
    contextMenu.style.left = e.clientX + 'px';
    contextMenu.style.top = e.clientY + 'px';
    return;
  }
  
  // Check if clicking near window edge
  if (isNearWindowEdge(ndc.x, ndc.y)) {
    // Spawn new segment at edge
    const worldPt = ndcToWorld(ndc.x, ndc.y);
    addCorner(worldPt);
  } else {
    // Hide context menu if clicking elsewhere
    contextMenu.style.display = 'none';
  }
});

// Close context menu when clicking elsewhere
window.addEventListener('click', (e) => {
  if (contextMenu && !contextMenu.contains(e.target)) {
    contextMenu.style.display = 'none';
    contextMenuCornerIndex = -1;
  }
});

// Delete segment button
if (deleteSegmentBtn) {
  deleteSegmentBtn.addEventListener('click', () => {
    if (contextMenuCornerIndex >= 0) {
      removeCorner(contextMenuCornerIndex);
      contextMenu.style.display = 'none';
      contextMenuCornerIndex = -1;
    }
  });
}

// Touch support for mobile
renderer.domElement.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    const touch = e.touches[0];
    const ndc = mouseToNDC(touch.clientX, touch.clientY);
    const corner = findNearestCorner(ndc.x, ndc.y);
    
    if (corner >= 0) {
      mouseSelectedCorner = corner;
      isMouseDragging = true;
      depthOffset = 0;
      startDragZ = targetCornerPositions[corner].z;
      cornerSpheres[corner].material.color.setHex(grabbedColor);
      e.preventDefault();
    }
  }
});

renderer.domElement.addEventListener('touchmove', (e) => {
  if (isMouseDragging && mouseSelectedCorner >= 0 && e.touches.length === 1) {
    const touch = e.touches[0];
    const ndc = mouseToNDC(touch.clientX, touch.clientY);
    // Preserve z position (depth) when moving with touch
    const currentZ = startDragZ + depthOffset;
    const worldPt = ndcToWorld(ndc.x, ndc.y, currentZ);
    targetCornerPositions[mouseSelectedCorner].copy(worldPt);
    targetCornerPositions[mouseSelectedCorner].z = currentZ;
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
    // Open menu - animate + to X, swap colors
    toggleIcon.classList.remove('plus');
    toggleIcon.classList.add('x');
    menuToggle.classList.add('open'); // Button becomes white
    controlsPanel.classList.add('open');
  } else {
    // Close menu - animate X to +, swap colors back
    toggleIcon.classList.remove('x');
    toggleIcon.classList.add('plus');
    menuToggle.classList.remove('open'); // Button becomes red
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


// ============ NOTES / FUTURE IMPROVEMENTS ============
/*
  - Right now the corner movement moves corners in world plane z=0. You can change to move in depth too.
  - The scaling mapping is deliberately simple. You can replace it with a more natural "pinch -> move forward/back" mapping using additional landmarks (wrist depth or 3D z values).
  - Calibration: if you're projecting physically, you'll want to adjust the camera/in-world coordinate scale and maybe add a "snap-to-grid" or "nudge" UI for fine tuning.
  - Replace the quad mapping with a homography-warp shader for more advanced projector mapping (this simple geometry approach works for planar projection).
  - For multi-user or networked setups, add a backend and WebRTC / WebSockets.
  - Consider smoothing/filtering landmarks (low-pass) for stable control (especially for jitter).
*/

