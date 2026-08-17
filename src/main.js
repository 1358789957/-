import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GEL_SHAPES, SoftCylinder } from "./physics/SoftCylinder.js";
import {
  DEFAULT_GEL_COLOR,
  applyGelColor,
  attachCarveShader,
  createGelGeometry,
  createGelMaterial,
  deformGelGeometry,
  visualRadialSegs,
} from "./render/gelMesh.js";
import {
  CarveSet,
  makeHoleOp,
  makeSliceOp,
  makeSphereOp,
} from "./edit/CarveSet.js";

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
const shapeOut = document.querySelector("#shapeOut");
const hintEl = document.querySelector("#hint");
const modeSimEl = document.querySelector("#modeSim");
const modeEditEl = document.querySelector("#modeEdit");
const editPanelEl = document.querySelector("#editPanel");
const toolSizeEl = document.querySelector("#toolSize");
const toolSizeOut = document.querySelector("#toolSizeOut");
const quickReset = document.querySelector("#quickReset");
const quickFix = document.querySelector("#quickFix");
const hudEl = document.querySelector("#hud");
const hudToggle = document.querySelector("#hudToggle");
const hudBar = hudEl.querySelector(".hud-bar");
const compactHud = window.matchMedia("(max-width: 920px), (max-height: 720px)");

function isPhoneHud() {
  return compactHud.matches || window.matchMedia("(pointer: coarse)").matches;
}

function setHudCollapsed(collapsed) {
  hudEl.classList.toggle("collapsed", collapsed);
  hudToggle.textContent = collapsed ? "设置" : "收起";
  hudToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
}

function toggleHud(event) {
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
  }
  setHudCollapsed(!hudEl.classList.contains("collapsed"));
}

setHudCollapsed(isPhoneHud());
hudToggle.addEventListener("pointerdown", toggleHud);
hudBar.addEventListener("pointerdown", (event) => {
  if (event.target.closest("#hudToggle") || event.target.closest("input,button,label")) return;
  toggleHud(event);
});
compactHud.addEventListener("change", () => {
  if (isPhoneHud()) setHudCollapsed(true);
});

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

let gelGeom = createGelGeometry({ radialSegs: 48, heightSegs: 36, capRings: 8 });
deformGelGeometry(gelGeom, soft);
const gelMat = createGelMaterial();
const gel = new THREE.Mesh(gelGeom, gelMat);
gel.castShadow = true;
gel.receiveShadow = true;
scene.add(gel);

const carveSet = new CarveSet();
attachCarveShader(gelMat, carveSet, soft);

const previewHole = new THREE.Mesh(
  new THREE.CylinderGeometry(1, 1, 2.4, 28, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0x7ad4ff,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
);
const previewSphere = new THREE.Mesh(
  new THREE.SphereGeometry(1, 28, 20),
  new THREE.MeshBasicMaterial({
    color: 0xffc56e,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  })
);
const previewSlice = new THREE.Mesh(
  new THREE.PlaneGeometry(1.6, 1.7),
  new THREE.MeshBasicMaterial({
    color: 0xff8a7a,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
);
previewHole.visible = false;
previewSphere.visible = false;
previewSlice.visible = false;
scene.add(previewHole, previewSphere, previewSlice);

let editMode = false;
let currentTool = "hole";

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
const _restA = new THREE.Vector3();
const _restB = new THREE.Vector3();
const _restC = new THREE.Vector3();
const restHit = new THREE.Vector3();

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

function restFromHit(hit) {
  const attr = gelGeom.getAttribute("restPos");
  const face = hit.face;
  let bary = hit.barycoord;
  if (face && !bary) {
    const pos = gelGeom.attributes.position;
    _restA.fromBufferAttribute(pos, face.a);
    _restB.fromBufferAttribute(pos, face.b);
    _restC.fromBufferAttribute(pos, face.c);
    bary = new THREE.Vector3();
    THREE.Triangle.getBarycoord(hit.point, _restA, _restB, _restC, bary);
  }
  if (face && bary && attr) {
    _restA.fromBufferAttribute(attr, face.a);
    _restB.fromBufferAttribute(attr, face.b);
    _restC.fromBufferAttribute(attr, face.c);
    restHit
      .set(0, 0, 0)
      .addScaledVector(_restA, bary.x)
      .addScaledVector(_restB, bary.y)
      .addScaledVector(_restC, bary.z);
    return {
      x: restHit.x,
      y: restHit.y,
      z: restHit.z,
      yNorm: (restHit.y - soft.floorY) / soft.height,
    };
  }
  const i = soft.closestParticle(hit.point.x, hit.point.y, hit.point.z, false);
  const o = i * 3;
  return {
    x: soft.rest[o],
    y: soft.rest[o + 1],
    z: soft.rest[o + 2],
    yNorm: (soft.rest[o + 1] - soft.floorY) / soft.height,
  };
}

function pickGelInfo() {
  const meshHits = raycaster.intersectObject(gel, false);
  for (let i = 0; i < meshHits.length; i++) {
    const hit = meshHits[i];
    const rest = restFromHit(hit);
    if (carveSet.contains(rest.x, rest.y, rest.z)) continue;
    return { point: hit.point, rest, hit };
  }
  const ray = raycaster.ray;
  let best = 0.12;
  let found = null;
  const { pos, A, H, rings } = soft;
  for (let h = 0; h < H; h++) {
    for (let a = 0; a < A; a++) {
      const i = soft.ringIndex(rings, h, a);
      if (soft.carved[i]) continue;
      _pick.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      const d = ray.distanceToPoint(_pick);
      if (d < best) {
        best = d;
        ray.closestPointToPoint(_pick, _closest);
        hitPoint.copy(_closest);
        const o = i * 3;
        found = {
          point: hitPoint,
          rest: {
            x: soft.rest[o],
            y: soft.rest[o + 1],
            z: soft.rest[o + 2],
            yNorm: (soft.rest[o + 1] - soft.floorY) / soft.height,
          },
        };
      }
    }
  }
  return found;
}

function pickGel() {
  const info = pickGelInfo();
  return info ? info.point : null;
}

function toolRadius() {
  const t = Number(toolSizeEl.value) / 100;
  if (currentTool === "hole") return 0.032 + t * 0.12;
  if (currentTool === "carve") return 0.05 + t * 0.16;
  return 0.07 + t * 0.26;
}

function hidePreviews() {
  previewHole.visible = false;
  previewSphere.visible = false;
  previewSlice.visible = false;
}

function updatePreview(rest) {
  hidePreviews();
  if (!editMode || !rest) return;
  const r = toolRadius();
  if (currentTool === "hole") {
    const op = makeHoleOp(rest, true, r);
    previewHole.visible = true;
    previewHole.position.set(op.ox, op.oy, op.oz);
    previewHole.scale.set(r, 1, r);
    previewHole.quaternion.setFromUnitVectors(
      _restA.set(0, 1, 0),
      _restB.set(op.dx, op.dy, op.dz)
    );
  } else if (currentTool === "carve") {
    previewSphere.visible = true;
    previewSphere.position.set(rest.x, rest.y, rest.z);
    previewSphere.scale.setScalar(r);
  } else {
    const op = makeSliceOp(rest, r, soft.radius);
    previewSlice.visible = true;
    previewSlice.position.set(op.dx * op.offset, 0.77, op.dz * op.offset);
    previewSlice.lookAt(previewSlice.position.x + op.dx, 0.77, previewSlice.position.z + op.dz);
  }
}

function applyTool(rest) {
  const r = toolRadius();
  let op = null;
  if (currentTool === "hole") op = makeHoleOp(rest, true, r);
  else if (currentTool === "carve") op = makeSphereOp(rest, r);
  else op = makeSliceOp(rest, r, soft.radius);
  carveSet.push(op);
  carveSet.applyToSoft(soft);
  meshDirty = true;
}

function beginInteract(event) {
  if (event.isPrimary === false) return;
  if (event.button != null && event.button !== 0) return;
  if (event.touches && event.touches.length > 1) return;
  setPointer(event);
  raycaster.setFromCamera(pointer, camera);
  const info = pickGelInfo();
  if (!info) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (editMode) {
    applyTool(info.rest);
    updatePreview(info.rest);
    return;
  }
  const p = info.point;
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
  const info = pickGelInfo();
  if (editMode) {
    canvas.style.cursor = info ? "crosshair" : "default";
    updatePreview(info ? info.rest : null);
  } else {
    hidePreviews();
    canvas.style.cursor = info ? "grab" : "default";
  }
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
function gelCapsFor(shape) {
  if (shape === "sphere") return "none";
  if (shape === "grip") return "bottom";
  return "both";
}

function focusCameraForShape() {
  const y =
    soft.shape === "sphere"
      ? soft.floorY + soft.sphereRadius()
      : soft.floorY + soft.height * 0.52;
  controls.target.set(0, y, 0);
}

function rebuildGelVisual() {
  const next = createGelGeometry({
    radialSegs: visualRadialSegs(soft.shape),
    heightSegs: 36,
    capRings: 8,
    caps: gelCapsFor(soft.shape),
  });
  deformGelGeometry(next, soft);
  gel.geometry.dispose();
  gel.geometry = next;
  gelGeom = next;
}

function applyShape(name) {
  if (!soft.setShape(name)) return;
  carveSet.clear();
  soft.clearCarved();
  rebuildGelVisual();
  focusCameraForShape();
  shapeOut.textContent = GEL_SHAPES[soft.shape] || "圆柱";
  document.querySelectorAll("[data-shape]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.shape === soft.shape);
  });
  meshDirty = true;
}

function doReset() {
  soft.reset();
  meshDirty = true;
}

document.querySelector("#reset").addEventListener("click", doReset);
document.querySelector("#drop").addEventListener("click", () => {
  if (editMode) return;
  pinEl.checked = false;
  soft.setPinBottom(false);
  soft.drop(1.05);
  meshDirty = true;
});
document.querySelectorAll("[data-shape]").forEach((btn) => {
  btn.addEventListener("click", () => applyShape(btn.dataset.shape));
});

document.querySelector("#poke").addEventListener("click", () => {
  if (editMode) return;
  const pokeAt = soft.placeRest(1, 0, 0.58, new Float32Array(3));
  const mid = soft.closestParticle(pokeAt[0], pokeAt[1], pokeAt[2], true);
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

function setEditMode(on) {
  editMode = on;
  modeSimEl.classList.toggle("active", !on);
  modeEditEl.classList.toggle("active", on);
  quickFix.classList.toggle("active", on);
  editPanelEl.hidden = !on;
  if (on) {
    soft.reset();
    meshDirty = true;
    hintEl.textContent = "胶已固定在当前形态。点在胶上打洞、切削或裁切。重置只回正姿态。";
    canvas.style.cursor = "crosshair";
    if (isPhoneHud()) setHudCollapsed(false);
  } else {
    hidePreviews();
    hintEl.textContent = "拖拽揉捏表面，空白处旋转视角。重置只回正姿态，不改形态和雕刻。";
    canvas.style.cursor = "default";
    soft.sleeping = false;
    meshDirty = true;
  }
}

function refreshToolSizeLabel() {
  const v = Number(toolSizeEl.value);
  toolSizeOut.textContent = v < 30 ? "小" : v < 65 ? "中" : "大";
}

modeSimEl.addEventListener("click", () => setEditMode(false));
modeEditEl.addEventListener("click", () => setEditMode(true));
document.querySelector("#quickBar").addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});
quickReset.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  doReset();
});
quickFix.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  setEditMode(!editMode);
});
toolSizeEl.addEventListener("input", () => {
  refreshToolSizeLabel();
});
refreshToolSizeLabel();
document.querySelectorAll("[data-tool]").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentTool = btn.dataset.tool;
    document.querySelectorAll("[data-tool]").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });
  });
});
document.querySelector("#undoCarve").addEventListener("click", () => {
  carveSet.undo();
  carveSet.applyToSoft(soft);
  meshDirty = true;
});
document.querySelector("#clearCarve").addEventListener("click", () => {
  carveSet.clear();
  soft.clearCarved();
  meshDirty = true;
});

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
  if (!editMode) soft.step(dt);
  if (meshDirty || interacting || (!editMode && !soft.sleeping)) {
    deformGelGeometry(gelGeom, soft, { normals: frames % 2 === 0 || interacting || editMode });
    gelGeom.computeBoundingSphere();
    meshDirty = editMode ? false : !soft.sleeping;
  }
  controls.update();
  renderer.render(scene, camera);

  frames += 1;
  fpsAccum += dt;
  if (fpsAccum >= 0.4) {
    fps = Math.round(frames / fpsAccum);
    frames = 0;
    fpsAccum = 0;
    const carved = soft.carvedCount();
    statsEl.textContent = `${fps} FPS · ${soft.count - carved}/${soft.count} 质点 · ${carveSet.ops.length} 处雕刻`;
  }
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
