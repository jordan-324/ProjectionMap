// Gesture Projection Mapper - minimal but functional
// Depends on MediaPipe Hands and Three.js included in index.html

// ============ CONFIG ============
const mediaSrc = null; // if null, we use the webcam stream or sample fallback
const useWebcamForTexture = true; // show live webcam inside the window by default
const maxHands = 2; // allow two hands
const pinchThreshold = 0.08; // was 0.05; higher = easier pinch detect
const cornerPickThreshold = 0.12; // was 0.08; higher = easier to grab corners

// ============ DOM ============
const container = document.getElementById('container');
const helpText = document.getElementById('helpText');
const togglePerformanceBtn = document.getElementById('togglePerformance');
const saveLayoutBtn = document.getElementById('saveLayout');
const loadBtn = document.getElementById('loadBtn');
const layoutFile = document.getElementById('layoutFile');
const mediaFileInput = document.getElementById('mediaFile');

let performanceMode = false;

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

// Small on-page preview to verify the webcam feed (slightly transparent, non-interactive)
camVideo.id = 'camPreview';
camVideo.width = 320;
camVideo.height = 180;
camVideo.style.cssText = 'position:fixed; bottom:12px; left:12px; width:240px; height:135px; opacity:0.4; z-index:50; pointer-events:none; background:#111;';
// Mirror the video element for a selfie-style preview
camVideo.style.transform = 'scaleX(-1)';

function attachVideoTexture() {
  if (videoTexture || !material) return;
  if (camVideo.videoWidth > 0 && camVideo.videoHeight > 0) {
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

    // also update background
    if (!backgroundTexture) {
      backgroundTexture = new THREE.VideoTexture(camVideo);
      backgroundTexture.minFilter = THREE.LinearFilter;
      backgroundTexture.magFilter = THREE.LinearFilter;
      backgroundTexture.format = THREE.RGBAFormat;
      backgroundTexture.wrapS = THREE.RepeatWrapping;
      backgroundTexture.repeat.x = -1;
      backgroundTexture.offset.x = 1;
    }
    if (backgroundMesh) {
      backgroundMesh.material.map = backgroundTexture;
      backgroundMesh.material.needsUpdate = true;
    }

    console.log('Webcam texture attached', camVideo.videoWidth, camVideo.videoHeight);
    helpText.innerText = 'Camera ready. Make a pinch to interact.';
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
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
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

// full-screen background plane (shows webcam)
const bgGeo = new THREE.PlaneGeometry(4, 3);
const bgPlaceholder = new THREE.DataTexture(new Uint8Array([10, 10, 10, 255]), 1, 1, THREE.RGBAFormat);
bgPlaceholder.needsUpdate = true;
const bgMat = new THREE.MeshBasicMaterial({ map: bgPlaceholder, depthWrite: false });
backgroundMesh = new THREE.Mesh(bgGeo, bgMat);
backgroundMesh.position.set(0, 0, -0.6); // behind the overlay quad
scene.add(backgroundMesh);

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

const material = new THREE.MeshBasicMaterial({ map: placeholderTexture, toneMapped: false });
const mesh = new THREE.Mesh(geometry, material);
windowGroup.add(mesh);

// Helpers: corner markers (small spheres) and lines between them
const cornerSpheres = [];
const cornerPositions = [0,1,2,3].map(i => new THREE.Vector3(positions[i*3+0], positions[i*3+1], positions[i*3+2]));
const sphereGeom = new THREE.SphereGeometry(0.02, 12, 10);
const sphereMat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
for (let i=0;i<4;i++){
  const s = new THREE.Mesh(sphereGeom, sphereMat);
  s.position.copy(cornerPositions[i]);
  scene.add(s);
  cornerSpheres.push(s);
}

// A visible outline (thin lines) to better see the quad
const outlineMat = new THREE.LineBasicMaterial({ color: 0x00ffcc });
const lineGeom = new THREE.BufferGeometry();
const linePos = new Float32Array([0,0,0, 0,0,0, 0,0,0, 0,0,0, 0,0,0]); // 5 points looped
lineGeom.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
const outline = new THREE.Line(lineGeom, outlineMat);
scene.add(outline);

// ============ Interaction State ============
let selectedCorner = -1;
let isPinching = false;
let pinchStartDist = null;
let startScale = 1.0;
let currentScale = 1.0;

// convert normalized 0..1 hand coords (MediaPipe) to NDC (-1 .. 1)
// Mirror hand coords horizontally to match mirrored video view
function screenToNDC(xNorm, yNorm){
  const mirroredX = 1 - xNorm;
  return { x: mirroredX * 2 - 1, y: - (yNorm * 2 - 1) };
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

// init corners to a visible rectangle
cornerPositions[0].set(-0.6, 0.35, 0);
cornerPositions[1].set( 0.6, 0.35, 0);
cornerPositions[2].set(-0.6,-0.35, 0);
cornerPositions[3].set( 0.6,-0.35, 0);
applyCornerPositionsToGeometry();

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
    isPinching = false;
    helpText.innerText = performanceMode ? '' : 'No hands detected. Hold up your hand to control the scene.';
    return;
  }
  lastHand = results.multiHandLandmarks[0];

  // index tip (8) and thumb tip (4)
  const indexTip = lastHand[8];
  const thumbTip = lastHand[4];
  const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);

  // choose a small threshold for pinching (tuned empirically)
  const PINCH_THRESHOLD = pinchThreshold;

  // if pinching -> either scale whole window or move a corner if near one
  if (pinchDist < PINCH_THRESHOLD) {
    // entering pinch
    if (!isPinching) {
      isPinching = true;
      pinchStartDist = pinchDist;
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
        helpText.innerText = `Corner ${selectedCorner} selected`;
      } else {
        selectedCorner = -1; // scale instead
        helpText.innerText = 'Pinch (no corner) — scaling';
      }
    } else {
      // already pinching - update action
      // compute scale change if not editing corner
      if (selectedCorner === -1) {
        // map pinch distance difference to scale. Since pinchDist is tiny (0..~0.08), use vertical movement of index fingertip instead for scaling
        // Use index y relative to start (we store startScale above)
        const ndcIndex = screenToNDC(indexTip.x, indexTip.y);
        // simpler mapping: use pinchDist delta
        const scaleFactor = 1 + (pinchStartDist - pinchDist) * 6; // tuned multiplier
        currentScale = Math.max(0.1, startScale * scaleFactor);
        windowGroup.scale.set(currentScale, currentScale, currentScale);
      } else {
        // move selected corner to current index fingertip position
        const ndc = screenToNDC(indexTip.x, indexTip.y);
        const worldPt = ndcToWorld(ndc.x, ndc.y);
        cornerPositions[selectedCorner].copy(worldPt);
        applyCornerPositionsToGeometry();
      }
    }
  } else {
    // not pinching
    if (isPinching) {
      // released pinch
      isPinching = false;
      selectedCorner = -1;
      helpText.innerText = performanceMode ? '' : 'Pinch released.';
    } else {
      // idle: optionally show a cursor or pointing indicator (not implemented)
      helpText.innerText = performanceMode ? '' : 'Ready. Pinch to interact.';
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
  // update video texture if it's a video (Three.VideoTexture auto-updates)
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
});

// ============ UI Controls ============
togglePerformanceBtn.addEventListener('click', () => {
  performanceMode = !performanceMode;
  if (performanceMode) {
    // hide helpers: spheres and outline
    cornerSpheres.forEach(s => s.visible = false);
    outline.visible = false;
    document.getElementById('controls').style.display = 'none';
    helpText.innerText = '';
  } else {
    cornerSpheres.forEach(s => s.visible = true);
    outline.visible = true;
    document.getElementById('controls').style.display = '';
    helpText.innerText = 'Exited Performance Mode';
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

