// Paper Webcam Prototype
// Three.js + MediaPipe Hands
// Pinch to scale, Fist to rotate

// ============ THREE.JS SETUP ============
const container = document.getElementById('container');
const info = document.getElementById('status');

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

// Camera
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 0, 3);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// ============ WEBCAM SETUP ============
let videoTexture = null;
let videoElement = null;

async function initWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 }
    });
    
    videoElement = document.createElement('video');
    videoElement.srcObject = stream;
    videoElement.autoplay = true;
    videoElement.muted = true;
    videoElement.playsInline = true;
    videoElement.style.display = 'none';
    document.body.appendChild(videoElement);
    
    // Wait for video to be ready
    await new Promise((resolve) => {
      videoElement.onloadedmetadata = () => {
        videoTexture = new THREE.VideoTexture(videoElement);
        videoTexture.minFilter = THREE.LinearFilter;
        videoTexture.magFilter = THREE.LinearFilter;
        resolve();
      };
    });
    
    info.textContent = 'Webcam ready. Show your hand.';
    createPaper();
  } catch (error) {
    console.error('Webcam error:', error);
    info.textContent = 'Webcam access denied.';
  }
}

// ============ PAPER PLANE SETUP ============
let paperMesh = null;

function createPaper() {
  if (!videoTexture) return;
  
  // Highly subdivided plane (like paper)
  const segments = 32; // High subdivision for smooth deformation
  const geometry = new THREE.PlaneGeometry(2, 2, segments, segments);
  
  // Material with webcam texture
  const material = new THREE.MeshStandardMaterial({
    map: videoTexture,
    side: THREE.DoubleSide, // Double-sided like paper
    roughness: 0.8,
    metalness: 0.1
  });
  
  paperMesh = new THREE.Mesh(geometry, material);
  scene.add(paperMesh);
  
  // Soft lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
  directionalLight.position.set(2, 2, 2);
  scene.add(directionalLight);
}

// ============ MEDIAPIPE HANDS SETUP ============
const hands = new Hands({
  locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
  }
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7
});

// ============ HAND TRACKING STATE ============
let isPinching = false;
let currentPinchDistance = 0;
let targetScale = 1.0;
let currentScale = 1.0;

let targetRotation = new THREE.Euler(0, 0, 0);
let currentRotation = new THREE.Euler(0, 0, 0);

// Smoothing factors
const scaleSmoothing = 0.15;
const rotationSmoothing = 0.2;

// ============ PINCH DETECTION ============
function getPinchDistance(landmarks) {
  if (!landmarks || landmarks.length < 21) return Infinity;
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  // 3D distance
  return Math.hypot(
    thumbTip.x - indexTip.x,
    thumbTip.y - indexTip.y,
    thumbTip.z - indexTip.z
  );
}

function detectPinch(landmarks, threshold = 0.08) {
  const distance = getPinchDistance(landmarks);
  return distance < threshold;
}

// ============ ROTATION FROM PALM ORIENTATION ============
function computePalmRotation(landmarks) {
  if (!landmarks || landmarks.length < 21) return null;
  
  // Key points for palm orientation
  const wrist = landmarks[0];
  const indexMCP = landmarks[5];  // Index finger MCP (base)
  const pinkyMCP = landmarks[17]; // Pinky MCP (base)
  const middleMCP = landmarks[9]; // Middle MCP (for better normal calculation)
  
  // Create vectors from wrist to finger bases
  const v1 = new THREE.Vector3(
    indexMCP.x - wrist.x,
    indexMCP.y - wrist.y,
    indexMCP.z - wrist.z
  );
  const v2 = new THREE.Vector3(
    pinkyMCP.x - wrist.x,
    pinkyMCP.y - wrist.y,
    pinkyMCP.z - wrist.z
  );
  
  // Compute palm normal using cross product
  const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();
  
  // If normal is invalid (zero length), use alternative calculation
  if (normal.length() < 0.01) {
    const v3 = new THREE.Vector3(
      middleMCP.x - wrist.x,
      middleMCP.y - wrist.y,
      middleMCP.z - wrist.z
    );
    normal.crossVectors(v1, v3).normalize();
  }
  
  // Convert normal to yaw (Y-axis) and pitch (X-axis) rotations
  // Yaw: rotation around Y axis (left/right tilt of palm)
  const yaw = Math.atan2(normal.x, normal.z);
  
  // Pitch: rotation around X axis (up/down tilt of palm)
  const pitch = Math.asin(-normal.y);
  
  return { yaw, pitch };
}

// ============ MEDIAPIPE RESULTS HANDLER ============
hands.onResults((results) => {
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    isPinching = false;
    window._startPinchDistance = null;
    window._startFistRotation = null;
    return;
  }
  
  const landmarks = results.multiHandLandmarks[0];
  const pinching = detectPinch(landmarks);
  
  if (pinching) {
    // PINCH MODE: Scale based on finger distance
    isPinching = true;
    const pinchDistance = getPinchDistance(landmarks);
    
    // Store initial pinch distance on first pinch
    if (!window._startPinchDistance) {
      window._startPinchDistance = pinchDistance;
      window._startScale = currentScale;
    }
    
    // Calculate scale ratio: open fingers (larger distance) = larger scale
    const distanceRatio = pinchDistance / window._startPinchDistance;
    targetScale = window._startScale * distanceRatio;
    
    // Clamp scale to reasonable range
    targetScale = Math.max(0.3, Math.min(2.5, targetScale));
    
  } else {
    // FIST MODE: Rotate based on palm orientation
    isPinching = false;
    window._startPinchDistance = null; // Reset pinch reference
    
    const rotation = computePalmRotation(landmarks);
    
    if (rotation) {
      // Store initial rotation on first fist
      if (!window._startFistRotation) {
        window._startFistRotation = { yaw: rotation.yaw, pitch: rotation.pitch };
        window._startRotationY = currentRotation.y;
        window._startRotationX = currentRotation.x;
      }
      
      // Calculate relative rotation from start
      const yawDelta = rotation.yaw - window._startFistRotation.yaw;
      const pitchDelta = rotation.pitch - window._startFistRotation.pitch;
      
      // Apply yaw and pitch with sensitivity scaling
      targetRotation.y = window._startRotationY + yawDelta * 2.0; // Y-axis rotation (yaw)
      targetRotation.x = window._startRotationX + pitchDelta * 2.0; // X-axis rotation (pitch)
    } else {
      window._startFistRotation = null; // Reset if hand lost
    }
  }
});

// ============ CAMERA FEED ============
let cameraFeed = null;

function startCameraFeed() {
  if (!videoElement) return;
  
  cameraFeed = new Camera(videoElement, {
    onFrame: async () => {
      if (videoElement && videoElement.readyState >= 2) {
        await hands.send({ image: videoElement });
      }
    },
    width: 1280,
    height: 720
  });
  
  cameraFeed.start();
}

// ============ ANIMATION LOOP ============
function animate() {
  requestAnimationFrame(animate);
  
  // Update video texture
  if (videoTexture) {
    videoTexture.needsUpdate = true;
  }
  
  // Smooth scale interpolation
  currentScale = currentScale + (targetScale - currentScale) * (1 - scaleSmoothing);
  
  // Smooth rotation interpolation
  currentRotation.y = currentRotation.y + (targetRotation.y - currentRotation.y) * (1 - rotationSmoothing);
  currentRotation.x = currentRotation.x + (targetRotation.x - currentRotation.x) * (1 - rotationSmoothing);
  
  // Apply transformations to paper mesh
  if (paperMesh) {
    paperMesh.scale.set(currentScale, currentScale, currentScale);
    paperMesh.rotation.y = currentRotation.y;
    paperMesh.rotation.x = currentRotation.x;
  }
  
  renderer.render(scene, camera);
}

// ============ INITIALIZATION ============
initWebcam().then(() => {
  if (videoElement) {
    startCameraFeed();
  }
  animate();
});

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

