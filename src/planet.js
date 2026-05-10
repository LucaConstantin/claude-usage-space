// ═══════════════════════════════════════════════
// Exploding Planet Scene
// purple_planet.glb: Planet + 2 cloud layers
// When settings opens: planet appears, rotates, UI fades
// When settings closes: planet fades, UI returns
// ═══════════════════════════════════════════════

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let scene, camera, renderer;
let planetCanvas = null;
let animFrameId = null;
let isActive = false;
let loaded = false;
let showProgress = 0; // 0 = hidden, 1 = fully visible
let targetShow = 0;
let rotationAngle = 0;

// The 3 model parts
let planetMesh = null;
let clouds0Mesh = null;
let clouds1Mesh = null;
let planetGroup = null;
let sunLight = null;
let rimLight = null;
let ambientLight = null;
let currentTint = { r: 0.53, g: 0.33, b: 0.8 }; // default purple
let targetTint = { r: 0.53, g: 0.33, b: 0.8 };

function initScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 0, 6);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ canvas: planetCanvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // Subtle space lighting
  ambientLight = new THREE.AmbientLight(0x333344, 0.6);
  scene.add(ambientLight);

  // Main sun light
  sunLight = new THREE.DirectionalLight(0xffeedd, 1.5);
  sunLight.position.set(5, 3, 4);
  scene.add(sunLight);

  // Rim light (tinted by music)
  rimLight = new THREE.DirectionalLight(0x8855cc, 0.6);
  rimLight.position.set(-4, -1, -3);
  scene.add(rimLight);

  // Fill
  const fillLight = new THREE.DirectionalLight(0x334466, 0.3);
  fillLight.position.set(0, -3, 2);
  scene.add(fillLight);

  planetGroup = new THREE.Group();
  scene.add(planetGroup);
}

async function loadModel() {
  if (loaded) return;
  try {
    const loader = new GLTFLoader();
    const gltf = await new Promise((resolve, reject) => {
      loader.load('../purple_planet.glb', resolve, undefined, reject);
    });

    const model = gltf.scene;

    // Find the 3 meshes by traversing
    model.traverse((child) => {
      if (!child.isMesh) return;
      const name = child.name || '';
      if (name.includes('Planet')) planetMesh = child;
      else if (name.includes('Clouds_0')) clouds0Mesh = child;
      else if (name.includes('Clouds_1')) clouds1Mesh = child;
    });

    // Compute size from planet mesh for proper scaling
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 3.5 / maxDim;

    // Center the model
    const center = box.getCenter(new THREE.Vector3());

    // Add entire model as one group - keeps all transforms intact
    model.position.sub(center);
    model.scale.setScalar(scale);
    planetGroup.add(model);

    loaded = true;
  } catch (e) {
    console.error('[Planet] Load failed:', e);
  }
}

function animate() {
  if (!isActive && showProgress < 0.001) return;
  animFrameId = requestAnimationFrame(animate);

  // Smooth show/hide transition
  const diff = targetShow - showProgress;
  if (Math.abs(diff) > 0.001) {
    showProgress += diff * 0.045;
  } else {
    showProgress = targetShow;
  }

  // Stop rendering when fully hidden
  if (showProgress < 0.001 && targetShow === 0) {
    isActive = false;
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
    planetCanvas.style.display = 'none';
    planetCanvas.style.opacity = '0';
    return;
  }

  // Rotation
  rotationAngle += 0.002;

  // Planet rotates slowly
  if (planetGroup) {
    planetGroup.rotation.y = rotationAngle;
    // Slight tilt
    planetGroup.rotation.x = 0.15 + Math.sin(rotationAngle * 0.3) * 0.05;
  }

  // Clouds rotate at slightly different speeds for parallax
  if (clouds0Mesh) {
    clouds0Mesh.rotation.y = rotationAngle * 0.15; // relative to parent
  }
  if (clouds1Mesh) {
    clouds1Mesh.rotation.y = -rotationAngle * 0.1;
  }

  // Camera distance scales with font size - planet stays proportional to text
  const fontScale = (parseInt(localStorage.getItem('fontSize')) || 100) / 100;
  const baseZ = 12 - fontScale * 3; // font 50%→10.5, 100%→9, 135%→7.95, 200%→6
  camera.position.z = baseZ - showProgress * 0.3 + Math.sin(Date.now() * 0.0008) * 0.15;

  // Tint planet by music theme color - lights + material emissive
  const tc = window.themeColor;
  if (tc && tc.r !== undefined) {
    targetTint.r = tc.r / 255;
    targetTint.g = tc.g / 255;
    targetTint.b = tc.b / 255;
  } else {
    targetTint.r = 0.53; targetTint.g = 0.33; targetTint.b = 0.8;
  }
  currentTint.r += (targetTint.r - currentTint.r) * 0.02;
  currentTint.g += (targetTint.g - currentTint.g) * 0.02;
  currentTint.b += (targetTint.b - currentTint.b) * 0.02;

  // Tint lights
  if (rimLight) rimLight.color.setRGB(currentTint.r, currentTint.g, currentTint.b);
  if (sunLight) sunLight.color.setRGB(
    0.7 + currentTint.r * 0.3,
    0.7 + currentTint.g * 0.3,
    0.7 + currentTint.b * 0.3
  );
  if (ambientLight) ambientLight.color.setRGB(
    currentTint.r * 0.4 + 0.1,
    currentTint.g * 0.4 + 0.1,
    currentTint.b * 0.4 + 0.15
  );

  // Tint planet mesh material emissive for visible color shift
  const tintColor = new THREE.Color(currentTint.r, currentTint.g, currentTint.b);
  if (planetMesh && planetMesh.material) {
    planetMesh.material.emissive = tintColor;
    planetMesh.material.emissiveIntensity = 0.15;
  }
  if (clouds0Mesh && clouds0Mesh.material) {
    clouds0Mesh.material.emissive = tintColor;
    clouds0Mesh.material.emissiveIntensity = 0.1;
  }
  if (clouds1Mesh && clouds1Mesh.material) {
    clouds1Mesh.material.emissive = tintColor;
    clouds1Mesh.material.emissiveIntensity = 0.08;
  }

  // Canvas opacity
  planetCanvas.style.opacity = showProgress.toFixed(3);

  renderer.render(scene, camera);
}

function handleResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ── Public API ──
window.PlanetScene = {
  async init() {
    planetCanvas = document.getElementById('planetCanvas');
    if (!planetCanvas) return;
    initScene();
    await loadModel();
    window.addEventListener('resize', handleResize);
  },

  show() {
    if (!loaded || !planetCanvas) return;
    isActive = true;
    targetShow = 1;
    planetCanvas.style.display = 'block';
    if (!animFrameId) animate();

    // Fade out UI content (keep music widget visible)
    const usageCenter = document.querySelector('.usage-center');
    if (usageCenter) usageCenter.style.transition = 'opacity 0.6s ease';
    if (usageCenter) usageCenter.style.opacity = '0';
  },

  hide() {
    targetShow = 0;

    // Fade UI content back in
    const usageCenter = document.querySelector('.usage-center');
    if (usageCenter) {
      usageCenter.style.transition = 'opacity 0.8s ease 0.3s';
      usageCenter.style.opacity = '1';
    }
  },

  get isActive() { return isActive; }
};

// Auto-init (module scripts are deferred)
window.PlanetScene.init();
