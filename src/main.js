import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GEL_SHAPES, SoftCylinder, isBodyGrabHeight, wrapDeg } from "./physics/SoftCylinder.js";
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
const quickPose = document.querySelector("#quickPose");
const quickReset = document.querySelector("#quickReset");
const quickFix = document.querySelector("#quickFix");
const axisToggle = document.querySelector("#axisToggle");
const axisPad = document.querySelector("#axisPad");
const axisXEl = document.querySelector("#axisX");
const axisYEl = document.querySelector("#axisY");
const axisZEl = document.querySelector("#axisZ");
const axisZeroEl = document.querySelector("#axisZero");
const fullResetEl = document.querySelector("#fullReset");
const hudEl = document.querySelector("#hud");
const hudToggle = document.querySelector("#hudToggle");
const hudBar = hudEl.querySelector(".hud-bar");
const editQuickEl = document.querySelector("#editQuick");
const compactHud = window.matchMedia(
  "(max-width: 640px), (max-width: 920px) and (pointer: coarse)"
);

function isPhoneHud() {
  return compactHud.matches;
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
hudToggle.addEventListener("pointerdown", (event) => {
  guardUi(event);
  toggleHud(event);
});
hudBar.addEventListener("pointerdown", (event) => {
  if (event.target.closest("#hudToggle") || event.target.closest("input,button,label")) return;
  guardUi(event);
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
renderer.toneMappingExposure = 1.14;
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

const hemi = new THREE.HemisphereLight(0xc4dcff, 0x1a140e, 0.62);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff4e6, 1.48);
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
const fill = new THREE.DirectionalLight(0x7ec8ff, 0.38);
fill.position.set(-2.2, 1.4, -1.8);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xb8ecff, 0.32);
rim.position.set(-0.6, 1.1, 2.6);
scene.add(rim);

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
  heightSegs: 11,
  rings: 3,
  softness: 0.55,
  damping: 0.26,
  gravity: -7.2,
});

let gelGeom = createGelGeometry({ radialSegs: 48, heightSegs: 40, rimSegs: 4, caps: "rims" });
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
let currentTool = "sculpt";

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
const _hitN = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _cross = new THREE.Vector3();
const _com = new THREE.Vector3();
const _radial = new THREE.Vector3();
const _sculptLast = new THREE.Vector3();
let uiGuardUntil = 0;
let sculpting = false;
let sculptYNorm = 0.5;

function guardUi(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
  }
  uiGuardUntil = performance.now() + 450;
}

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

function hitCylCoord(hit, component, fallback) {
  const attr = gelGeom.getAttribute("restCyl");
  const face = hit.face;
  if (!face || !attr) return fallback;
  const bary = hit.barycoord;
  if (!bary) return fallback;
  const getter = component === 2 ? "getZ" : component === 1 ? "getY" : "getX";
  return (
    attr[getter](face.a) * bary.x +
    attr[getter](face.b) * bary.y +
    attr[getter](face.c) * bary.z
  );
}

function hitWallNorm(hit) {
  return hitCylCoord(hit, 0, 1);
}

function hitYNorm(hit, fallback) {
  return hitCylCoord(hit, 2, fallback);
}

function isFrontHit(hit) {
  if (!hit.face) return true;
  _hitN.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
  return _hitN.dot(raycaster.ray.direction) < -0.04;
}

function rayThroughCavity() {
  if (soft.shape === "sphere") return false;
  _axis.set(soft.orientR[1], soft.orientR[4], soft.orientR[7]);
  if (_axis.lengthSq() < 1e-8) _axis.set(0, 1, 0);
  _axis.normalize();
  _com.set(soft.restCom[0], soft.restCom[1], soft.restCom[2]);
  const ray = raycaster.ray;
  _cross.crossVectors(ray.direction, _axis);
  const den = _cross.length();
  const hole = soft.radius * soft.innerRatio * 0.9;
  if (den < 1e-5) {
    _hitN.subVectors(ray.origin, _com).cross(_axis);
    return _hitN.length() < hole;
  }
  _hitN.subVectors(ray.origin, _com);
  return Math.abs(_hitN.dot(_cross)) / den < hole;
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
    hit.barycoord = bary;
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
    const yFromRest = (restHit.y - soft.floorY) / soft.height;
    return {
      x: restHit.x,
      y: restHit.y,
      z: restHit.z,
      yNorm: hitYNorm(hit, yFromRest),
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
  const throughHole = !editMode && rayThroughCavity();
  const meshHits = raycaster.intersectObject(gel, false);
  let innerFallback = null;
  for (let i = 0; i < meshHits.length; i++) {
    const hit = meshHits[i];
    if (!isFrontHit(hit)) continue;
    const rest = restFromHit(hit);
    if (carveSet.contains(rest.x, rest.y, rest.z)) continue;
    const wall = hitWallNorm(hit);
    if (throughHole && wall < 0.45) continue;
    if (wall < 0.45) {
      if (!innerFallback) innerFallback = { point: hit.point, rest, hit };
      continue;
    }
    return { point: hit.point, rest, hit };
  }
  if (innerFallback && !throughHole) return innerFallback;
  if (throughHole) return null;
  const ray = raycaster.ray;
  let best = 0.12;
  let found = null;
  const { pos, A, H } = soft;
  for (const r of [soft.outerRing(), 0]) {
    for (let h = 0; h < H; h++) {
      for (let a = 0; a < A; a++) {
        const i = soft.ringIndex(r, h, a);
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

function sculptBrush() {
  const t = Number(toolSizeEl.value) / 100;
  return 0.07 + t * 0.3;
}

function gelAxisY(out) {
  out.set(soft.orientR[1], soft.orientR[4], soft.orientR[7]);
  if (out.lengthSq() < 1e-8) out.set(0, 1, 0);
  return out.normalize();
}

function restRadial(rest, out) {
  gelAxisY(_axis);
  _com.set(soft.restCom[0], soft.restCom[1], soft.restCom[2]);
  out.set(rest.x - _com.x, rest.y - _com.y, rest.z - _com.z);
  out.addScaledVector(_axis, -out.dot(_axis));
  if (out.lengthSq() < 1e-8) {
    camera.getWorldDirection(camDir);
    out.crossVectors(_axis, camDir);
    if (out.lengthSq() < 1e-8) out.set(1, 0, 0);
  }
  return out.normalize();
}

function updatePreview(rest) {
  hidePreviews();
  if (!editMode || !rest || currentTool === "sculpt") return;
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
  if (currentTool === "sculpt") return;
  const r = toolRadius();
  let op = null;
  if (currentTool === "hole") op = makeHoleOp(rest, true, r);
  else if (currentTool === "carve") op = makeSphereOp(rest, r);
  else op = makeSliceOp(rest, r, soft.radius);
  carveSet.push(op);
  carveSet.applyToSoft(soft);
  meshDirty = true;
}

function beginSculpt(info) {
  sculpting = true;
  interacting = true;
  meshDirty = true;
  controls.enabled = false;
  sculptYNorm = info.rest.yNorm;
  restRadial(info.rest, _radial);
  hitPoint.copy(info.point);
  camera.getWorldDirection(camDir);
  grabPlane.setFromNormalAndCoplanarPoint(camDir, info.point);
  _sculptLast.copy(info.point);
  canvas.style.cursor = "ew-resize";
}

function moveSculpt() {
  camera.getWorldDirection(camDir);
  grabPlane.normal.copy(camDir);
  if (!raycaster.ray.intersectPlane(grabPlane, planeHit)) return;
  const delta = _pick.copy(planeHit).sub(_sculptLast).dot(_radial);
  _sculptLast.copy(planeHit);
  if (Math.abs(delta) < 1e-5) return;
  if (soft.sculptRadius(sculptYNorm, delta * 0.92, sculptBrush())) {
    meshDirty = true;
  }
}

function beginInteract(event) {
  if (performance.now() < uiGuardUntil) return;
  if (event.target && event.target !== canvas) return;
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
    if (currentTool === "sculpt") {
      beginSculpt(info);
      return;
    }
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
  const body = isBodyGrabHeight(info.rest.yNorm);
  soft.grabParticle(idx, p.x, p.y, p.z, body);
  if (body) {
    fingerMesh.visible = false;
  } else {
    soft.attachFinger(p.x, p.y, p.z, 0.11);
    fingerMesh.position.copy(p);
    fingerMesh.scale.setScalar(0.11);
    fingerMesh.visible = true;
  }
}

function moveInteract(event) {
  if (sculpting) {
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    moveSculpt();
    return;
  }
  if (!interacting) return;
  setPointer(event);
  raycaster.setFromCamera(pointer, camera);
  camera.getWorldDirection(camDir);
  grabPlane.normal.copy(camDir);
  if (raycaster.ray.intersectPlane(grabPlane, planeHit)) {
    soft.moveGrab(planeHit.x, planeHit.y, planeHit.z);
    if (soft.fingerActive) {
      soft.moveFinger(planeHit.x, planeHit.y, planeHit.z);
      fingerMesh.position.copy(planeHit);
    }
  }
}

function endInteract() {
  if (sculpting) {
    sculpting = false;
    interacting = false;
    controls.enabled = true;
    canvas.style.cursor = editMode
      ? currentTool === "sculpt"
        ? "ew-resize"
        : "crosshair"
      : "default";
    return;
  }
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
    canvas.style.cursor = !info ? "default" : currentTool === "sculpt" ? "ew-resize" : "crosshair";
    updatePreview(info ? info.rest : null);
  } else {
    hidePreviews();
    canvas.style.cursor = info ? "grab" : "default";
  }
});

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
  return "rims";
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
    heightSegs: 40,
    rimSegs: 4,
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

function formatDeg(value) {
  const n = wrapDeg(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function syncAxisInputs() {
  axisXEl.value = formatDeg(soft.orientDeg.x);
  axisYEl.value = formatDeg(soft.orientDeg.y);
  axisZEl.value = formatDeg(soft.orientDeg.z);
}

function applyOrientChange(mapped) {
  if (carveSet.ops.length) {
    carveSet.reorient(soft, mapped.prevR, mapped.prevLift, mapped.nextR, mapped.nextLift);
    carveSet.applyToSoft(soft);
  }
  syncAxisInputs();
  meshDirty = true;
}

function setAxisValues(x, y, z) {
  applyOrientChange(soft.setOrientation(x, y, z));
}

function doReset() {
  soft.reset();
  meshDirty = true;
}

function doFullReset() {
  pinEl.checked = false;
  carveSet.clear();
  soft.fullReset();
  rebuildGelVisual();
  focusCameraForShape();
  shapeOut.textContent = GEL_SHAPES[soft.shape] || "圆柱";
  document.querySelectorAll("[data-shape]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.shape === soft.shape);
  });
  syncAxisInputs();
  meshDirty = true;
}

document.querySelector("#reset").addEventListener("click", doReset);
fullResetEl.addEventListener("click", doFullReset);
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
  soft.mapByOrient(pokeAt[0], pokeAt[1], pokeAt[2], soft.orientR, soft.orientLift, pokeAt);
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
  editQuickEl.hidden = !on;
  if (on) {
    soft.reset();
    meshDirty = true;
    hintEl.textContent = "胶已固定。塑形像拉坯：左右拖改这一圈粗细。打洞 / 切削 / 裁切仍可用。";
    canvas.style.cursor = currentTool === "sculpt" ? "ew-resize" : "crosshair";
  } else {
    hidePreviews();
    hintEl.textContent = "复位只回正。重置清空形态、方向和雕刻。捏中部搬整根胶，捏两端可揉。点方向展开 XYZ。";
    canvas.style.cursor = "default";
    soft.sleeping = false;
    meshDirty = true;
  }
}

function refreshToolSizeLabel() {
  const v = Number(toolSizeEl.value);
  const size = v < 30 ? "小" : v < 65 ? "中" : "大";
  toolSizeOut.textContent = currentTool === "sculpt" ? `笔触 ${size}` : size;
}

modeSimEl.addEventListener("pointerdown", (event) => {
  guardUi(event);
  setEditMode(false);
});
modeEditEl.addEventListener("pointerdown", (event) => {
  guardUi(event);
  setEditMode(true);
});
document.querySelector("#quickBar").addEventListener("pointerdown", (event) => {
  guardUi(event);
});
quickPose.addEventListener("pointerdown", (event) => {
  guardUi(event);
  doReset();
});
quickReset.addEventListener("pointerdown", (event) => {
  guardUi(event);
  doFullReset();
});
quickFix.addEventListener("pointerdown", (event) => {
  guardUi(event);
  setEditMode(!editMode);
});

function setAxisPadOpen(open) {
  axisPad.hidden = !open;
  axisToggle.setAttribute("aria-expanded", open ? "true" : "false");
  axisToggle.classList.toggle("active", open);
}

axisToggle.addEventListener("pointerdown", (event) => {
  guardUi(event);
  setAxisPadOpen(axisPad.hidden);
});

function readAxisInputs() {
  setAxisValues(axisXEl.value, axisYEl.value, axisZEl.value);
}

[axisXEl, axisYEl, axisZEl].forEach((el) => {
  el.addEventListener("change", readAxisInputs);
  el.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      readAxisInputs();
      el.blur();
    }
  });
});

let axisHoldTimer = 0;
let axisHoldRepeat = 0;

function stopAxisHold() {
  window.clearTimeout(axisHoldTimer);
  window.clearInterval(axisHoldRepeat);
  axisHoldTimer = 0;
  axisHoldRepeat = 0;
}

function stepAxis(axis, delta) {
  applyOrientChange(soft.nudgeOrientation(axis, delta));
}

document.querySelectorAll(".axis-step").forEach((btn) => {
  const axis = btn.dataset.axis;
  const delta = Number(btn.dataset.delta);
  btn.addEventListener("pointerdown", (event) => {
    guardUi(event);
    btn.setPointerCapture(event.pointerId);
    stepAxis(axis, delta);
    stopAxisHold();
    axisHoldTimer = window.setTimeout(() => {
      axisHoldRepeat = window.setInterval(() => stepAxis(axis, delta), 70);
    }, 380);
  });
  btn.addEventListener("pointerup", stopAxisHold);
  btn.addEventListener("pointercancel", stopAxisHold);
  btn.addEventListener("lostpointercapture", stopAxisHold);
});

axisZeroEl.addEventListener("pointerdown", (event) => {
  guardUi(event);
  soft.setOrientationZero();
  syncAxisInputs();
  axisZeroEl.textContent = "已设为零点";
  window.setTimeout(() => {
    axisZeroEl.textContent = "设为零点";
  }, 900);
});

syncAxisInputs();
toolSizeEl.addEventListener("input", () => {
  refreshToolSizeLabel();
});
refreshToolSizeLabel();
document.querySelectorAll("[data-tool]").forEach((btn) => {
  btn.addEventListener("pointerdown", (event) => {
    guardUi(event);
    currentTool = btn.dataset.tool;
    document.querySelectorAll("[data-tool]").forEach((b) => {
      b.classList.toggle("active", b.dataset.tool === currentTool);
    });
    refreshToolSizeLabel();
    hidePreviews();
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
