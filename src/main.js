import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { SoftCylinder } from "./physics/SoftCylinder.js";
import {
  DEFAULT_GEL_COLOR,
  applyGelColor,
  createGelGeometry,
  createGelMaterial,
  deformGelGeometry,
} from "./render/gelMesh.js";

const canvas = document.querySelector("#c");
const statsEl = document.querySelector("#stats");
const softnessEl = document.querySelector("#softness");
const softnessOut = document.querySelector("#softnessOut");
const dampingEl = document.querySelector("#damping");
const dampingOut = document.querySelector("#dampingOut");
const gravityEl = document.querySelector("#gravity");
const gravityOut = document.querySelector("#gravityOut");
const pinEl = document.querySelector("#pinBottom");
const colorEl = document.querySelector("#gelColor");
const colorOut = document.querySelector("#gelColorOut");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e14);
scene.fog = new THREE.Fog(0x0b0e14, 8, 18);

const camera = new THREE.PerspectiveCamera(
  38,
  window.innerWidth / window.innerHeight,
  0.08,
  40
);
camera.position.set(1.55, 1.35, 2.15);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.target.set(0, 0.78, 0);
controls.minDistance = 1.1;
controls.maxDistance = 6;
controls.maxPolarAngle = Math.PI * 0.49;

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const hemi = new THREE.HemisphereLight(0xb9d7ff, 0x1a140e, 0.55);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff4e6, 1.35);
key.position.set(2.4, 4.2, 1.6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 12;
key.shadow.camera.left = -2.5;
key.shadow.camera.right = 2.5;
key.shadow.camera.top = 2.5;
key.shadow.camera.bottom = -2.5;
key.shadow.bias = -0.0004;
scene.add(key);
const fill = new THREE.DirectionalLight(0x7ec8ff, 0.35);
fill.position.set(-2.2, 1.4, -1.8);
scene.add(fill);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(4.5, 72),
  new THREE.MeshStandardMaterial({
    color: 0x141820,
    metalness: 0.35,
    roughness: 0.42,
    envMapIntensity: 0.55,
  })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const pedestal = new THREE.Mesh(
  new THREE.CylinderGeometry(0.62, 0.68, 0.06, 64),
  new THREE.MeshStandardMaterial({
    color: 0x2a313c,
    metalness: 0.55,
    roughness: 0.28,
  })
);
pedestal.position.y = 0.03;
pedestal.receiveShadow = true;
scene.add(pedestal);

const soft = new SoftCylinder({
  radius: 0.36,
  height: 1.42,
  radialSegs: 8,
  heightSegs: 10,
  rings: 3,
  softness: 0.55,
  damping: 0.22,
  gravity: -7.2,
});

const gelGeom = createGelGeometry({ radialSegs: 48, heightSegs: 36, capRings: 8 });
deformGelGeometry(gelGeom, soft);
const gelMat = createGelMaterial();
const gel = new THREE.Mesh(gelGeom, gelMat);
gel.castShadow = true;
gel.receiveShadow = true;
scene.add(gel);

const fingerMesh = new THREE.Mesh(
  new THREE.SphereGeometry(1, 32, 24),
  new THREE.MeshPhysicalMaterial({
    color: 0xf2fbff,
    roughness: 0.18,
    transmission: 0.35,
    thickness: 0.4,
    transparent: true,
    opacity: 0.55,
    metalness: 0,
  })
);
fingerMesh.visible = false;
fingerMesh.castShadow = true;
scene.add(fingerMesh);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const grabPlane = new THREE.Plane();
const hitPoint = new THREE.Vector3();
const planeHit = new THREE.Vector3();
const camDir = new THREE.Vector3();
const _pick = new THREE.Vector3();
const _closest = new THREE.Vector3();

let interacting = false;
let meshDirty = true;
let frames = 0;
let fps = 0;
let fpsAccum = 0;
let last = performance.now();

function setPointer(event) {
  const src = event.touches ? event.touches[0] : event;
  if (!src) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((src.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((src.clientY - rect.top) / rect.height) * 2 + 1;
}

function pickGel() {
  const meshHits = raycaster.intersectObject(gel, false);
  if (meshHits.length) return meshHits[0].point;
  const ray = raycaster.ray;
  let best = 0.12;
  let found = false;
  const { pos, A, H, rings } = soft;
  for (let h = 0; h < H; h++) {
    for (let a = 0; a < A; a++) {
      const i = soft.ringIndex(rings, h, a);
      _pick.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      const d = ray.distanceToPoint(_pick);
      if (d < best) {
        best = d;
        ray.closestPointToPoint(_pick, _closest);
        hitPoint.copy(_closest);
        found = true;
      }
    }
  }
  return found ? hitPoint : null;
}

function beginInteract(event) {
  if (event.isPrimary === false) return;
  if (event.button != null && event.button !== 0) return;
  if (event.touches && event.touches.length > 1) return;
  setPointer(event);
  raycaster.setFromCamera(pointer, camera);
  const p = pickGel();
  if (!p) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  interacting = true;
  meshDirty = true;
  controls.enabled = false;
  canvas.style.cursor = "grabbing";
  hitPoint.copy(p);
  camera.getWorldDirection(camDir);
  grabPlane.setFromNormalAndCoplanarPoint(camDir, p);
  const idx = soft.closestParticle(p.x, p.y, p.z, true);
  soft.grabParticle(idx, p.x, p.y, p.z);
  soft.attachFinger(p.x, p.y, p.z, 0.135);
  fingerMesh.position.copy(p);
  fingerMesh.scale.setScalar(0.135);
  fingerMesh.visible = true;
}

function moveInteract(event) {
  if (!interacting) return;
  setPointer(event);
  raycaster.setFromCamera(pointer, camera);
  camera.getWorldDirection(camDir);
  grabPlane.normal.copy(camDir);
  if (raycaster.ray.intersectPlane(grabPlane, planeHit)) {
    soft.moveGrab(planeHit.x, planeHit.y, planeHit.z);
    soft.moveFinger(planeHit.x, planeHit.y, planeHit.z);
    fingerMesh.position.copy(planeHit);
  }
}

function endInteract() {
  if (!interacting) return;
  interacting = false;
  controls.enabled = true;
  soft.releaseFinger();
  fingerMesh.visible = false;
  canvas.style.cursor = "default";
}

canvas.addEventListener("pointerdown", beginInteract, { capture: true });
window.addEventListener("pointermove", moveInteract);
window.addEventListener("pointerup", endInteract);
window.addEventListener("pointercancel", endInteract);
canvas.addEventListener("pointermove", (event) => {
  if (interacting) return;
  setPointer(event);
  raycaster.setFromCamera(pointer, camera);
  canvas.style.cursor = pickGel() ? "grab" : "default";
});
canvas.addEventListener(
  "touchstart",
  (e) => {
    if (e.touches.length === 1) beginInteract(e);
  },
  { capture: true, passive: false }
);
window.addEventListener("touchmove", moveInteract, { passive: false });
window.addEventListener("touchend", endInteract);
window.addEventListener("touchcancel", endInteract);

function softnessLabel(percent) {
  if (percent <= 28) return "硬胶";
  if (percent <= 70) return "中等";
  return "超软";
}

function applySoftness(percent) {
  const s = Number(percent) / 100;
  softnessEl.value = String(percent);
  softnessOut.textContent = `${softnessLabel(percent)} ${Math.round(percent)}%`;
  soft.setSoftness(s);
  document.querySelectorAll("[data-soft]").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.soft) === Number(percent));
  });
}

softnessEl.addEventListener("input", () => applySoftness(softnessEl.value));
dampingEl.addEventListener("input", () => {
  const d = Number(dampingEl.value) / 100;
  dampingOut.textContent = `${Math.round(d * 100)}%`;
  soft.setDamping(d);
});
gravityEl.addEventListener("input", () => {
  const g = Number(gravityEl.value) / 10;
  gravityOut.textContent = g.toFixed(1);
  soft.setGravity(-g);
});
pinEl.addEventListener("change", () => soft.setPinBottom(pinEl.checked));
document.querySelector("#reset").addEventListener("click", () => {
  soft.reset();
  meshDirty = true;
});
document.querySelector("#drop").addEventListener("click", () => {
  pinEl.checked = false;
  soft.setPinBottom(false);
  soft.drop(1.05);
  meshDirty = true;
});
document.querySelector("#poke").addEventListener("click", () => {
  const mid = soft.closestParticle(
    soft.radius,
    soft.height * 0.62 + soft.floorY,
    0,
    true
  );
  const o = mid * 3;
  soft.vel[o] += 3.4;
  soft.vel[o + 2] += 0.35;
  soft.sleeping = false;
  meshDirty = true;
});
document.querySelectorAll("[data-soft]").forEach((btn) => {
  btn.addEventListener("click", () => applySoftness(btn.dataset.soft));
});
applySoftness(55);

function normalizeHex(value) {
  const hex = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toLowerCase();
  return DEFAULT_GEL_COLOR;
}

function applyColor(hex) {
  const value = normalizeHex(hex);
  colorEl.value = value;
  colorOut.textContent = value.toUpperCase();
  applyGelColor(gelMat, value);
  document.querySelectorAll("#swatches [data-color]").forEach((btn) => {
    btn.classList.toggle("active", normalizeHex(btn.dataset.color) === value);
  });
}

colorEl.addEventListener("input", () => applyColor(colorEl.value));
document.querySelectorAll("#swatches [data-color]").forEach((btn) => {
  btn.addEventListener("click", () => applyColor(btn.dataset.color));
});
applyColor(DEFAULT_GEL_COLOR);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function tick(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  soft.step(dt);
  if (!soft.sleeping || interacting || meshDirty) {
    deformGelGeometry(gelGeom, soft, { normals: frames % 2 === 0 || interacting });
    gelGeom.computeBoundingSphere();
    meshDirty = !soft.sleeping;
  }
  controls.update();
  renderer.render(scene, camera);

  frames += 1;
  fpsAccum += dt;
  if (fpsAccum >= 0.4) {
    fps = Math.round(frames / fpsAccum);
    frames = 0;
    fpsAccum = 0;
    statsEl.textContent = `${fps} FPS · ${soft.count} 质点 · ${soft.distI.length} 距离约束 · ${soft.tetI.length} 体积单元`;
  }
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
