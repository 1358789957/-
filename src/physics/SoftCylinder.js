/**
 * XPBD soft gel on a structured lattice (center column + concentric rings).
 * Rest positions can be a cylinder, sphere, prism, or grip. Constraints are
 * distance, tetrahedral volume, floor contact, and an optional finger.
 * reset() only snaps pose back to the current rest form.
 */

export const GEL_SHAPES = {
  cylinder: "圆柱",
  sphere: "圆珠",
  prism: "棱柱",
  grip: "握柄",
};

const TWO_PI = Math.PI * 2;

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / Math.max(1e-8, e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function wrapDeg(v) {
  const d = ((((Number(v) || 0) + 180) % 360) + 360) % 360 - 180;
  return d === -180 ? 180 : d;
}

function mulMat3(a, b, out) {
  const r0 = a[0] * b[0] + a[1] * b[3] + a[2] * b[6];
  const r1 = a[0] * b[1] + a[1] * b[4] + a[2] * b[7];
  const r2 = a[0] * b[2] + a[1] * b[5] + a[2] * b[8];
  const r3 = a[3] * b[0] + a[4] * b[3] + a[5] * b[6];
  const r4 = a[3] * b[1] + a[4] * b[4] + a[5] * b[7];
  const r5 = a[3] * b[2] + a[4] * b[5] + a[5] * b[8];
  const r6 = a[6] * b[0] + a[7] * b[3] + a[8] * b[6];
  const r7 = a[6] * b[1] + a[7] * b[4] + a[8] * b[7];
  const r8 = a[6] * b[2] + a[7] * b[5] + a[8] * b[8];
  out[0] = r0;
  out[1] = r1;
  out[2] = r2;
  out[3] = r3;
  out[4] = r4;
  out[5] = r5;
  out[6] = r6;
  out[7] = r7;
  out[8] = r8;
}

function eulerXyz(xDeg, yDeg, zDeg, out) {
  const x = (xDeg * Math.PI) / 180;
  const y = (yDeg * Math.PI) / 180;
  const z = (zDeg * Math.PI) / 180;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  const rx = _tmpRx;
  const ry = _tmpRy;
  const rz = _tmpRz;
  rx[0] = 1;
  rx[1] = 0;
  rx[2] = 0;
  rx[3] = 0;
  rx[4] = cx;
  rx[5] = -sx;
  rx[6] = 0;
  rx[7] = sx;
  rx[8] = cx;
  ry[0] = cy;
  ry[1] = 0;
  ry[2] = sy;
  ry[3] = 0;
  ry[4] = 1;
  ry[5] = 0;
  ry[6] = -sy;
  ry[7] = 0;
  ry[8] = cy;
  rz[0] = cz;
  rz[1] = -sz;
  rz[2] = 0;
  rz[3] = sz;
  rz[4] = cz;
  rz[5] = 0;
  rz[6] = 0;
  rz[7] = 0;
  rz[8] = 1;
  mulMat3(ry, rx, _tmpE);
  mulMat3(rz, _tmpE, out);
}

const _tmpRx = new Float32Array(9);
const _tmpRy = new Float32Array(9);
const _tmpRz = new Float32Array(9);
const _tmpE = new Float32Array(9);
const _tmpM = new Float32Array(9);

const _invT = new Float32Array(9);
const _tmp3 = new Float32Array(9);

function invert3(m, out) {
  const a00 = m[0];
  const a01 = m[1];
  const a02 = m[2];
  const a10 = m[3];
  const a11 = m[4];
  const a12 = m[5];
  const a20 = m[6];
  const a21 = m[7];
  const a22 = m[8];
  const b01 = a22 * a11 - a12 * a21;
  const b11 = -a22 * a10 + a12 * a20;
  const b21 = a21 * a10 - a11 * a20;
  const det = a00 * b01 + a01 * b11 + a02 * b21;
  if (Math.abs(det) < 1e-10) {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 1;
    out[5] = 0;
    out[6] = 0;
    out[7] = 0;
    out[8] = 1;
    return false;
  }
  const inv = 1 / det;
  out[0] = b01 * inv;
  out[1] = (-a22 * a01 + a02 * a21) * inv;
  out[2] = (a12 * a01 - a02 * a11) * inv;
  out[3] = b11 * inv;
  out[4] = (a22 * a00 - a02 * a20) * inv;
  out[5] = (-a12 * a00 + a02 * a10) * inv;
  out[6] = b21 * inv;
  out[7] = (-a21 * a00 + a01 * a20) * inv;
  out[8] = (a11 * a00 - a01 * a10) * inv;
  return true;
}

function polarRotation(A, R) {
  let nrm = 0;
  for (let i = 0; i < 9; i++) nrm += A[i] * A[i];
  nrm = Math.sqrt(nrm);
  const invN = nrm > 1e-10 ? 1 / nrm : 1;
  for (let i = 0; i < 9; i++) R[i] = A[i] * invN;
  R[0] += 1e-5;
  R[4] += 1e-5;
  R[8] += 1e-5;
  for (let iter = 0; iter < 16; iter++) {
    if (!invert3(R, _tmp3)) break;
    _invT[0] = _tmp3[0];
    _invT[1] = _tmp3[3];
    _invT[2] = _tmp3[6];
    _invT[3] = _tmp3[1];
    _invT[4] = _tmp3[4];
    _invT[5] = _tmp3[7];
    _invT[6] = _tmp3[2];
    _invT[7] = _tmp3[5];
    _invT[8] = _tmp3[8];
    for (let k = 0; k < 9; k++) R[k] = 0.5 * (R[k] + _invT[k]);
  }

  let x0 = R[0];
  let x1 = R[3];
  let x2 = R[6];
  let xl = Math.hypot(x0, x1, x2) || 1;
  x0 /= xl;
  x1 /= xl;
  x2 /= xl;
  let y0 = R[1];
  let y1 = R[4];
  let y2 = R[7];
  const xd = x0 * y0 + x1 * y1 + x2 * y2;
  y0 -= x0 * xd;
  y1 -= x1 * xd;
  y2 -= x2 * xd;
  let yl = Math.hypot(y0, y1, y2) || 1;
  y0 /= yl;
  y1 /= yl;
  y2 /= yl;
  const z0 = x1 * y2 - x2 * y1;
  const z1 = x2 * y0 - x0 * y2;
  const z2 = x0 * y1 - x1 * y0;
  R[0] = x0;
  R[1] = y0;
  R[2] = z0;
  R[3] = x1;
  R[4] = y1;
  R[5] = z1;
  R[6] = x2;
  R[7] = y2;
  R[8] = z2;

  const det =
    R[0] * (R[4] * R[8] - R[5] * R[7]) -
    R[1] * (R[3] * R[8] - R[5] * R[6]) +
    R[2] * (R[3] * R[7] - R[4] * R[6]);
  if (det < 0) {
    R[2] = -R[2];
    R[5] = -R[5];
    R[8] = -R[8];
  }
}

function blendRotation(prev, next) {
  const axisDot =
    prev[0] * next[0] + prev[4] * next[4] + prev[8] * next[8];
  if (axisDot >= 0.12) return;
  for (let i = 0; i < 9; i++) next[i] = prev[i] * 0.6 + next[i] * 0.4;
}

function tetVolume(pos, i, j, k, l) {
  const ix = i * 3;
  const jx = j * 3;
  const kx = k * 3;
  const lx = l * 3;
  const ax = pos[jx] - pos[ix];
  const ay = pos[jx + 1] - pos[ix + 1];
  const az = pos[jx + 2] - pos[ix + 2];
  const bx = pos[kx] - pos[ix];
  const by = pos[kx + 1] - pos[ix + 1];
  const bz = pos[kx + 2] - pos[ix + 2];
  const cx = pos[lx] - pos[ix];
  const cy = pos[lx + 1] - pos[ix + 1];
  const cz = pos[lx + 2] - pos[ix + 2];
  return (
    (ax * (by * cz - bz * cy) +
      ay * (bz * cx - bx * cz) +
      az * (bx * cy - by * cx)) /
    6
  );
}

export class SoftCylinder {
  constructor({
    radius = 0.36,
    height = 1.42,
    radialSegs = 8,
    heightSegs = 10,
    rings = 3,
    softness = 0.55,
    damping = 0.22,
    gravity = -7.2,
  } = {}) {
    this.radius = radius;
    this.height = height;
    this.A = radialSegs;
    this.heightSegs = heightSegs;
    this.H = heightSegs + 1;
    this.rings = rings;
    this.softness = softness;
    this.damping = damping;
    this.gravity = gravity;
    this.floorY = 0.06;
    this.baseStick = 0.42;
    this.particleRadius = 0.016;
    this.substeps = 3;
    this.iterations = 6;
    this.volumeBoost = 1.0;
    this.pinBottom = false;
    this.shape = "cylinder";
    this.restGeneration = 0;
    this.orientDeg = { x: 0, y: 0, z: 0 };
    this.zeroR = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    this.orientR = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    this.orientLift = 0;
    this.rest0Com = new Float32Array(3);

    this.fingerActive = false;
    this.finger = { x: 0, y: 0, z: 0, radius: 0.14 };
    this.grabIndex = -1;
    this.grabX = 0;
    this.grabY = 0;
    this.grabZ = 0;

    this._buildParticles();
    this._buildConstraints();
    this._applyMaterialParams();

    this.kinetic = 0;
    this.sleeping = false;
    this.sleepThreshold = 4e-5;
  }

  centerIndex(h) {
    return h;
  }

  ringIndex(r, h, a) {
    const A = this.A;
    const H = this.H;
    return H + (r - 1) * H * A + h * A + ((a % A) + A) % A;
  }

  indexAt(r, h, a) {
    if (r <= 0) return this.centerIndex(h);
    return this.ringIndex(r, h, a);
  }

  _buildParticles() {
    const { A, H, rings, radius, height } = this;
    const count = H + rings * H * A;
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.prev = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.rest = new Float32Array(count * 3);
    this.rest0 = new Float32Array(count * 3);
    this.invMass = new Float32Array(count);
    this.mass = new Float32Array(count);
    this.carved = new Uint8Array(count);

    const volume = Math.PI * radius * radius * height;
    const density = 1.15;
    const m = (density * volume) / count;

    for (let h = 0; h < H; h++) {
      this.mass[this.centerIndex(h)] = m * 1.15;
      this.invMass[this.centerIndex(h)] = 1 / this.mass[this.centerIndex(h)];
      for (let r = 1; r <= rings; r++) {
        for (let a = 0; a < A; a++) {
          const i = this.ringIndex(r, h, a);
          const ringMass = r === rings ? m * 0.9 : m;
          this.mass[i] = ringMass;
          this.invMass[i] = 1 / ringMass;
        }
      }
    }

    this._applyRestShape();
    this.pos.set(this.rest);
    this.prev.set(this.rest);
  }

  sphereRadius() {
    return Math.min(this.radius * 1.45, this.height * 0.48);
  }

  placeRest(rNorm, theta, yNorm, out) {
    const R = this.radius;
    const H = this.height;
    const y0 = this.floorY;
    const rn = clamp(rNorm, 0, 1);
    const yn = clamp(yNorm, 0, 1);

    if (this.shape === "sphere") {
      const Rs = this.sphereRadius();
      const phi = yn * Math.PI;
      const ring = Rs * Math.sin(phi) * rn;
      out[0] = Math.cos(theta) * ring;
      out[1] = y0 + Rs * (1 - Math.cos(phi));
      out[2] = Math.sin(theta) * ring;
      return out;
    }

    if (this.shape === "prism") {
      const n = this.A;
      const half = Math.PI / n;
      const local = ((theta % TWO_PI) + TWO_PI) % TWO_PI;
      const sector = local % (2 * half);
      const faceR = (R * Math.cos(half)) / Math.max(0.18, Math.cos(sector - half));
      const rr = rn * faceR;
      out[0] = Math.cos(theta) * rr;
      out[1] = y0 + yn * H;
      out[2] = Math.sin(theta) * rr;
      return out;
    }

    if (this.shape === "grip") {
      const y = y0 + yn * H;
      const Rb = R * 0.6;
      const cy = y0 + H - Rb;
      let shaft;
      if (yn < 0.1) {
        shaft = R * lerp(0.46, 0.42, yn / 0.1);
      } else if (yn < 0.56) {
        const t = (yn - 0.1) / 0.46;
        shaft = R * (0.42 + 0.08 * Math.sin(t * Math.PI));
      } else {
        shaft = R * lerp(0.42, 0.38, clamp((yn - 0.56) / 0.16, 0, 1));
      }
      const dy = y - cy;
      const bulb = dy * dy <= Rb * Rb ? Math.sqrt(Rb * Rb - dy * dy) : 0;
      const rad = lerp(shaft, bulb, smoothstep(cy - Rb, cy - Rb * 0.18, y));
      out[0] = Math.cos(theta) * rad * rn;
      out[1] = y;
      out[2] = Math.sin(theta) * rad * rn;
      return out;
    }

    const rr = rn * R;
    out[0] = Math.cos(theta) * rr;
    out[1] = y0 + yn * H;
    out[2] = Math.sin(theta) * rr;
    return out;
  }

  _applyRestShape() {
    const { A, H, rings } = this;
    const tmp = this._placeTmp || (this._placeTmp = new Float32Array(3));
    for (let h = 0; h < H; h++) {
      const yNorm = h / (H - 1);
      this.placeRest(0, 0, yNorm, tmp);
      const ci = this.centerIndex(h) * 3;
      this.rest0[ci] = tmp[0];
      this.rest0[ci + 1] = tmp[1];
      this.rest0[ci + 2] = tmp[2];
      for (let r = 1; r <= rings; r++) {
        const rNorm = r / rings;
        for (let a = 0; a < A; a++) {
          const theta = (a / A) * TWO_PI;
          this.placeRest(rNorm, theta, yNorm, tmp);
          const o = this.ringIndex(r, h, a) * 3;
          this.rest0[o] = tmp[0];
          this.rest0[o + 1] = tmp[1];
          this.rest0[o + 2] = tmp[2];
        }
      }
    }
    this._computeComAll(this.rest0, this.rest0Com);
    this._applyOrientation({ snap: false, rebuild: !!this.qRest });
  }

  _computeComAll(src, out) {
    let x = 0;
    let y = 0;
    let z = 0;
    let w = 0;
    for (let i = 0; i < this.count; i++) {
      const m = this.mass[i];
      const o = i * 3;
      x += src[o] * m;
      y += src[o + 1] * m;
      z += src[o + 2] * m;
      w += m;
    }
    const inv = w > 0 ? 1 / w : 0;
    out[0] = x * inv;
    out[1] = y * inv;
    out[2] = z * inv;
  }

  _composeOrientR(out) {
    eulerXyz(this.orientDeg.x, this.orientDeg.y, this.orientDeg.z, _tmpE);
    mulMat3(this.zeroR, _tmpE, out);
  }

  _applyOrientation({ snap = true, rebuild = true } = {}) {
    this._composeOrientR(this.orientR);
    const R = this.orientR;
    const cx = this.rest0Com[0];
    const cy = this.rest0Com[1];
    const cz = this.rest0Com[2];
    const { rest0, rest, count } = this;
    let minY = Infinity;
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      const qx = rest0[o] - cx;
      const qy = rest0[o + 1] - cy;
      const qz = rest0[o + 2] - cz;
      rest[o] = R[0] * qx + R[1] * qy + R[2] * qz + cx;
      rest[o + 1] = R[3] * qx + R[4] * qy + R[5] * qz + cy;
      rest[o + 2] = R[6] * qx + R[7] * qy + R[8] * qz + cz;
      if (rest[o + 1] < minY) minY = rest[o + 1];
    }
    const lift = this.floorY - minY;
    this.orientLift = lift;
    if (Math.abs(lift) > 1e-8) {
      for (let i = 0; i < count; i++) rest[i * 3 + 1] += lift;
    }
    this.restGeneration += 1;
    if (rebuild && this.qRest) this._rebuildShapeRest();
    if (snap && this.lastR) this.reset();
  }

  mapByOrient(x, y, z, R, lift, out) {
    const cx = this.rest0Com[0];
    const cy = this.rest0Com[1];
    const cz = this.rest0Com[2];
    const qx = x - cx;
    const qy = y - cy;
    const qz = z - cz;
    out[0] = R[0] * qx + R[1] * qy + R[2] * qz + cx;
    out[1] = R[3] * qx + R[4] * qy + R[5] * qz + cy + lift;
    out[2] = R[6] * qx + R[7] * qy + R[8] * qz + cz;
    return out;
  }

  unmapByOrient(x, y, z, R, lift, out) {
    const cx = this.rest0Com[0];
    const cy = this.rest0Com[1];
    const cz = this.rest0Com[2];
    const px = x - cx;
    const py = y - lift - cy;
    const pz = z - cz;
    out[0] = R[0] * px + R[3] * py + R[6] * pz + cx;
    out[1] = R[1] * px + R[4] * py + R[7] * pz + cy;
    out[2] = R[2] * px + R[5] * py + R[8] * pz + cz;
    return out;
  }

  rotateByOrient(dx, dy, dz, R, out) {
    out[0] = R[0] * dx + R[1] * dy + R[2] * dz;
    out[1] = R[3] * dx + R[4] * dy + R[5] * dz;
    out[2] = R[6] * dx + R[7] * dy + R[8] * dz;
    return out;
  }

  unrotateByOrient(dx, dy, dz, R, out) {
    out[0] = R[0] * dx + R[3] * dy + R[6] * dz;
    out[1] = R[1] * dx + R[4] * dy + R[7] * dz;
    out[2] = R[2] * dx + R[5] * dy + R[8] * dz;
    return out;
  }

  setOrientation(x, y, z) {
    const prevR = this._prevOrientR || (this._prevOrientR = new Float32Array(9));
    prevR.set(this.orientR);
    const prevLift = this.orientLift;
    this.orientDeg.x = wrapDeg(x);
    this.orientDeg.y = wrapDeg(y);
    this.orientDeg.z = wrapDeg(z);
    this._applyOrientation({ snap: true, rebuild: true });
    return { prevR, prevLift, nextR: this.orientR, nextLift: this.orientLift };
  }

  nudgeOrientation(axis, delta) {
    const next = { ...this.orientDeg };
    next[axis] = wrapDeg(next[axis] + delta);
    return this.setOrientation(next.x, next.y, next.z);
  }

  setOrientationZero() {
    this._composeOrientR(_tmpM);
    this.zeroR.set(_tmpM);
    this.orientDeg.x = 0;
    this.orientDeg.y = 0;
    this.orientDeg.z = 0;
    this._composeOrientR(this.orientR);
  }

  _refreshConstraintRests() {
    const { rest, distI, distJ, distRest } = this;
    for (let n = 0; n < distI.length; n++) {
      const i = distI[n] * 3;
      const j = distJ[n] * 3;
      distRest[n] = Math.hypot(
        rest[i] - rest[j],
        rest[i + 1] - rest[j + 1],
        rest[i + 2] - rest[j + 2]
      );
    }
    for (let n = 0; n < this.tetI.length; n++) {
      let v0 = tetVolume(
        this.rest,
        this.tetI[n],
        this.tetJ[n],
        this.tetK[n],
        this.tetL[n]
      );
      if (v0 < 0) {
        const tmp = this.tetK[n];
        this.tetK[n] = this.tetL[n];
        this.tetL[n] = tmp;
        v0 = -v0;
      }
      this.tetRest[n] = v0 * this.volumeBoost;
    }
  }

  setShape(name) {
    const next = GEL_SHAPES[name] ? name : "cylinder";
    if (next === this.shape) return false;
    this.shape = next;
    this._applyRestShape();
    this._refreshConstraintRests();
    this._rebuildShapeRest();
    this.reset();
    return true;
  }

  _addDistance(i, j, kind) {
    if (i === j || i < 0 || j < 0) return;
    const key = i < j ? i * 100000 + j : j * 100000 + i;
    if (this._distSeen.has(key)) return;
    this._distSeen.add(key);
    const o = i * 3;
    const p = j * 3;
    const dx = this.rest[o] - this.rest[p];
    const dy = this.rest[o + 1] - this.rest[p + 1];
    const dz = this.rest[o + 2] - this.rest[p + 2];
    const rest = Math.hypot(dx, dy, dz);
    if (rest < 1e-6) return;
    this.distI.push(i);
    this.distJ.push(j);
    this.distRest.push(rest);
    this.distKind.push(kind);
    this.distLambda.push(0);
    this.distComp.push(0);
  }

  _addTet(i, j, k, l) {
    let v0 = tetVolume(this.rest, i, j, k, l);
    if (Math.abs(v0) < 1e-8) return;
    if (v0 < 0) {
      const tmp = k;
      k = l;
      l = tmp;
      v0 = -v0;
    }
    this.tetI.push(i);
    this.tetJ.push(j);
    this.tetK.push(k);
    this.tetL.push(l);
    this.tetRest.push(v0 * this.volumeBoost);
    this.tetLambda.push(0);
    this.tetComp.push(0);
  }

  _splitHex(c000, c100, c010, c110, c001, c101, c011, c111) {
    this._addTet(c000, c100, c110, c101);
    this._addTet(c000, c110, c010, c011);
    this._addTet(c000, c101, c011, c001);
    this._addTet(c000, c110, c011, c101);
    this._addTet(c110, c101, c011, c111);
  }

  _buildConstraints() {
    const { A, H, rings } = this;
    this.distI = [];
    this.distJ = [];
    this.distRest = [];
    this.distKind = [];
    this.distLambda = [];
    this.distComp = [];
    this.tetI = [];
    this.tetJ = [];
    this.tetK = [];
    this.tetL = [];
    this.tetRest = [];
    this.tetLambda = [];
    this.tetComp = [];
    this._distSeen = new Set();

    const STRUCT = 0;
    const SHEAR = 1;
    const BEND = 2;

    for (let h = 0; h < H; h++) {
      for (let r = 1; r <= rings; r++) {
        for (let a = 0; a < A; a++) {
          const i = this.ringIndex(r, h, a);
          this._addDistance(i, this.ringIndex(r, h, a + 1), STRUCT);
          if (h + 1 < H) {
            this._addDistance(i, this.ringIndex(r, h + 1, a), STRUCT);
            this._addDistance(i, this.ringIndex(r, h + 1, a + 1), SHEAR);
            this._addDistance(i, this.ringIndex(r, h + 1, a - 1), SHEAR);
          }
          if (r + 1 <= rings) {
            this._addDistance(i, this.ringIndex(r + 1, h, a), STRUCT);
            this._addDistance(i, this.ringIndex(r + 1, h, a + 1), SHEAR);
          } else if (h + 2 < H) {
            this._addDistance(i, this.ringIndex(r, h + 2, a), BEND);
          }
          if (r === 1) {
            this._addDistance(i, this.centerIndex(h), STRUCT);
            if (h + 1 < H) {
              this._addDistance(i, this.centerIndex(h + 1), SHEAR);
            }
          }
        }
      }
      if (h + 1 < H) {
        this._addDistance(this.centerIndex(h), this.centerIndex(h + 1), STRUCT);
      }
    }

    for (let h = 0; h < H - 1; h++) {
      for (let a = 0; a < A; a++) {
        const a1 = a + 1;
        this._addTet(
          this.centerIndex(h),
          this.ringIndex(1, h, a),
          this.ringIndex(1, h, a1),
          this.centerIndex(h + 1)
        );
        this._addTet(
          this.centerIndex(h + 1),
          this.ringIndex(1, h, a),
          this.ringIndex(1, h, a1),
          this.ringIndex(1, h + 1, a)
        );
        this._addTet(
          this.centerIndex(h + 1),
          this.ringIndex(1, h, a1),
          this.ringIndex(1, h + 1, a),
          this.ringIndex(1, h + 1, a1)
        );

        for (let r = 1; r < rings; r++) {
          this._splitHex(
            this.ringIndex(r, h, a),
            this.ringIndex(r + 1, h, a),
            this.ringIndex(r, h, a1),
            this.ringIndex(r + 1, h, a1),
            this.ringIndex(r, h + 1, a),
            this.ringIndex(r + 1, h + 1, a),
            this.ringIndex(r, h + 1, a1),
            this.ringIndex(r + 1, h + 1, a1)
          );
        }
      }
    }

    this.distI = new Uint16Array(this.distI);
    this.distJ = new Uint16Array(this.distJ);
    this.distRest = new Float32Array(this.distRest);
    this.distKind = new Uint8Array(this.distKind);
    this.distLambda = new Float32Array(this.distLambda);
    this.distComp = new Float32Array(this.distComp);
    this.tetI = new Uint16Array(this.tetI);
    this.tetJ = new Uint16Array(this.tetJ);
    this.tetK = new Uint16Array(this.tetK);
    this.tetL = new Uint16Array(this.tetL);
    this.tetRest = new Float32Array(this.tetRest);
    this.tetLambda = new Float32Array(this.tetLambda);
    this.tetComp = new Float32Array(this.tetComp);
    this._distSeen = null;

    this.com = new Float32Array(3);
    this.restCom = new Float32Array(3);
    this.qRest = new Float32Array(this.count * 3);
    this.Amat = new Float32Array(9);
    this.Rmat = new Float32Array(9);
    this.lastR = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    this.upright = 1;
    this._rebuildShapeRest();
  }

  _rebuildShapeRest() {
    this._computeCom(this.rest, this.restCom);
    const { rest, restCom, qRest, count } = this;
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      qRest[o] = rest[o] - restCom[0];
      qRest[o + 1] = rest[o + 1] - restCom[1];
      qRest[o + 2] = rest[o + 2] - restCom[2];
    }
    this.lastR.set([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  }

  _applyMaterialParams() {
    const s = clamp(this.softness, 0, 1);
    const structural = lerp(8e-6, 0.014, Math.pow(s, 1.35));
    const shear = structural * lerp(1.45, 2.2, s);
    const bend = structural * lerp(3.2, 5.5, s);
    const volume = lerp(8e-7, 2.2e-4, Math.pow(s, 1.55));
    this.shapeStiffness = lerp(0.62, 0.32, s);

    const kindComp = [structural, shear, bend];
    for (let i = 0; i < this.distComp.length; i++) {
      this.distComp[i] = kindComp[this.distKind[i]];
    }
    for (let i = 0; i < this.tetComp.length; i++) {
      this.tetComp[i] = volume;
    }

    this.iterations = s > 0.8 ? 5 : s > 0.45 ? 6 : 8;
    this.substeps = s > 0.75 ? 4 : 3;
  }

  setSoftness(value) {
    this.softness = clamp(value, 0, 1);
    this._applyMaterialParams();
    this.sleeping = false;
  }

  setDamping(value) {
    this.damping = clamp(value, 0.02, 0.95);
    this.sleeping = false;
  }

  setGravity(value) {
    this.gravity = value;
    this.sleeping = false;
  }

  setPinBottom(pin) {
    this.pinBottom = pin;
    const H = this.H;
    const A = this.A;
    const rings = this.rings;
    for (let r = 0; r <= rings; r++) {
      for (let a = 0; a < (r === 0 ? 1 : A); a++) {
        const i = this.indexAt(r, 0, a);
        if (pin) {
          this.invMass[i] = 0;
          const o = i * 3;
          this.pos[o] = this.rest[o];
          this.pos[o + 1] = this.rest[o + 1];
          this.pos[o + 2] = this.rest[o + 2];
          this.vel[o] = 0;
          this.vel[o + 1] = 0;
          this.vel[o + 2] = 0;
        } else if (this.carved[i]) {
          this.invMass[i] = 0;
        } else if (this.mass[i] > 0) {
          this.invMass[i] = 1 / this.mass[i];
        }
      }
    }
    this.sleeping = false;
  }

  /** Stand the gel back at its current rest form. Does not change shape or carves. */
  reset() {
    this.pos.set(this.rest);
    this.prev.set(this.rest);
    this.vel.fill(0);
    this.lastR.set([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    this.upright = 1;
    this.sleeping = false;
    this.releaseFinger();
    if (this.pinBottom) this.setPinBottom(true);
  }

  drop(height = 1.15) {
    this.reset();
    for (let i = 0; i < this.count; i++) {
      this.pos[i * 3 + 1] += height;
      this.prev[i * 3 + 1] += height;
      this.vel[i * 3] = (Math.random() - 0.5) * 0.15;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
    }
    this.sleeping = false;
  }

  attachFinger(x, y, z, radius = 0.14) {
    this.fingerActive = true;
    this.finger.x = x;
    this.finger.y = y;
    this.finger.z = z;
    this.finger.radius = radius;
    this.sleeping = false;
  }

  moveFinger(x, y, z) {
    this.finger.x = x;
    this.finger.y = y;
    this.finger.z = z;
    this.sleeping = false;
  }

  releaseFinger() {
    this.fingerActive = false;
    this.grabIndex = -1;
  }

  grabParticle(index, x, y, z) {
    this.grabIndex = index;
    this.grabX = x;
    this.grabY = y;
    this.grabZ = z;
    this.sleeping = false;
  }

  moveGrab(x, y, z) {
    this.grabX = x;
    this.grabY = y;
    this.grabZ = z;
  }

  applyCarvedFlags(flags) {
    const { count, carved, invMass, mass, vel } = this;
    carved.set(flags);
    for (let i = 0; i < count; i++) {
      if (carved[i]) {
        invMass[i] = 0;
        vel[i * 3] = 0;
        vel[i * 3 + 1] = 0;
        vel[i * 3 + 2] = 0;
      } else if (this.mass[i] > 0) {
        invMass[i] = 1 / mass[i];
      }
    }
    if (this.pinBottom) this.setPinBottom(true);
    this._rebuildShapeRest();
    this._syncCarved();
    this.sleeping = false;
  }

  clearCarved() {
    this.carved.fill(0);
    for (let i = 0; i < this.count; i++) {
      if (this.mass[i] > 0) this.invMass[i] = 1 / this.mass[i];
    }
    if (this.pinBottom) this.setPinBottom(true);
    this._rebuildShapeRest();
    this.sleeping = false;
  }

  carvedCount() {
    let n = 0;
    for (let i = 0; i < this.count; i++) if (this.carved[i]) n += 1;
    return n;
  }

  _syncCarved() {
    const { pos, prev, vel, rest, carved, mass, count } = this;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let rx = 0;
    let ry = 0;
    let rz = 0;
    let w = 0;
    for (let i = 0; i < count; i++) {
      if (carved[i]) continue;
      const m = mass[i];
      const o = i * 3;
      cx += pos[o] * m;
      cy += pos[o + 1] * m;
      cz += pos[o + 2] * m;
      rx += rest[o] * m;
      ry += rest[o + 1] * m;
      rz += rest[o + 2] * m;
      w += m;
    }
    if (w <= 0) return;
    const inv = 1 / w;
    const dx = cx * inv - rx * inv;
    const dy = cy * inv - ry * inv;
    const dz = cz * inv - rz * inv;
    for (let i = 0; i < count; i++) {
      if (!carved[i]) continue;
      const o = i * 3;
      pos[o] = rest[o] + dx;
      pos[o + 1] = rest[o + 1] + dy;
      pos[o + 2] = rest[o + 2] + dz;
      prev[o] = pos[o];
      prev[o + 1] = pos[o + 1];
      prev[o + 2] = pos[o + 2];
      vel[o] = 0;
      vel[o + 1] = 0;
      vel[o + 2] = 0;
    }
  }

  closestParticle(x, y, z, surfaceOnly = true) {
    const { pos, count, A, H, rings, carved } = this;
    let best = 0;
    let bestD = Infinity;
    const consider = (i) => {
      if (carved[i]) return;
      const o = i * 3;
      const dx = pos[o] - x;
      const dy = pos[o + 1] - y;
      const dz = pos[o + 2] - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bestD) {
        bestD = d2;
        best = i;
      }
    };
    if (surfaceOnly) {
      for (let h = 0; h < H; h++) {
        for (let a = 0; a < A; a++) consider(this.ringIndex(rings, h, a));
        consider(this.centerIndex(h));
      }
    } else {
      for (let i = 0; i < count; i++) consider(i);
    }
    return best;
  }

  _computeCom(src, out) {
    let x = 0;
    let y = 0;
    let z = 0;
    let w = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.carved[i]) continue;
      const m = this.mass[i];
      const o = i * 3;
      x += src[o] * m;
      y += src[o + 1] * m;
      z += src[o + 2] * m;
      w += m;
    }
    const inv = w > 0 ? 1 / w : 0;
    out[0] = x * inv;
    out[1] = y * inv;
    out[2] = z * inv;
  }

  _solveDistance(dt2) {
    const {
      pos,
      invMass,
      distI,
      distJ,
      distRest,
      distComp,
      distLambda,
    } = this;
    const n = distI.length;
    for (let c = 0; c < n; c++) {
      const i = distI[c];
      const j = distJ[c];
      if (this.carved[i] || this.carved[j]) continue;
      const wi = invMass[i];
      const wj = invMass[j];
      const w = wi + wj;
      if (w <= 0) continue;
      const io = i * 3;
      const jo = j * 3;
      const dx = pos[jo] - pos[io];
      const dy = pos[jo + 1] - pos[io + 1];
      const dz = pos[jo + 2] - pos[io + 2];
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-8) continue;
      const C = len - distRest[c];
      const alpha = distComp[c] / dt2;
      const dLambda = (-C - alpha * distLambda[c]) / (w + alpha);
      distLambda[c] += dLambda;
      const invLen = 1 / len;
      const sx = dx * invLen * dLambda;
      const sy = dy * invLen * dLambda;
      const sz = dz * invLen * dLambda;
      pos[io] -= sx * wi;
      pos[io + 1] -= sy * wi;
      pos[io + 2] -= sz * wi;
      pos[jo] += sx * wj;
      pos[jo + 1] += sy * wj;
      pos[jo + 2] += sz * wj;
    }
  }

  _solveVolume(dt2) {
    const {
      pos,
      invMass,
      tetI,
      tetJ,
      tetK,
      tetL,
      tetRest,
      tetComp,
      tetLambda,
    } = this;
    const n = tetI.length;
    for (let c = 0; c < n; c++) {
      const i1 = tetI[c];
      const i2 = tetJ[c];
      const i3 = tetK[c];
      const i4 = tetL[c];
      if (
        this.carved[i1] ||
        this.carved[i2] ||
        this.carved[i3] ||
        this.carved[i4]
      ) {
        continue;
      }
      const w1 = invMass[i1];
      const w2 = invMass[i2];
      const w3 = invMass[i3];
      const w4 = invMass[i4];
      if (w1 + w2 + w3 + w4 <= 0) continue;
      if (Math.abs(tetRest[c]) < 1e-8) continue;

      const p1 = i1 * 3;
      const p2 = i2 * 3;
      const p3 = i3 * 3;
      const p4 = i4 * 3;

      const x1 = pos[p1];
      const y1 = pos[p1 + 1];
      const z1 = pos[p1 + 2];
      const d2x = pos[p2] - x1;
      const d2y = pos[p2 + 1] - y1;
      const d2z = pos[p2 + 2] - z1;
      const d3x = pos[p3] - x1;
      const d3y = pos[p3 + 1] - y1;
      const d3z = pos[p3 + 2] - z1;
      const d4x = pos[p4] - x1;
      const d4y = pos[p4 + 1] - y1;
      const d4z = pos[p4 + 2] - z1;

      const g2x = (d3y * d4z - d3z * d4y) / 6;
      const g2y = (d3z * d4x - d3x * d4z) / 6;
      const g2z = (d3x * d4y - d3y * d4x) / 6;
      const g3x = (d4y * d2z - d4z * d2y) / 6;
      const g3y = (d4z * d2x - d4x * d2z) / 6;
      const g3z = (d4x * d2y - d4y * d2x) / 6;
      const g4x = (d2y * d3z - d2z * d3y) / 6;
      const g4y = (d2z * d3x - d2x * d3z) / 6;
      const g4z = (d2x * d3y - d2y * d3x) / 6;
      const g1x = -g2x - g3x - g4x;
      const g1y = -g2y - g3y - g4y;
      const g1z = -g2z - g3z - g4z;

      const vol =
        (d2x * (d3y * d4z - d3z * d4y) +
          d2y * (d3z * d4x - d3x * d4z) +
          d2z * (d3x * d4y - d3y * d4x)) /
        6;
      const C = vol - tetRest[c];
      const wSum =
        w1 * (g1x * g1x + g1y * g1y + g1z * g1z) +
        w2 * (g2x * g2x + g2y * g2y + g2z * g2z) +
        w3 * (g3x * g3x + g3y * g3y + g3z * g3z) +
        w4 * (g4x * g4x + g4y * g4y + g4z * g4z);
      const alpha = tetComp[c] / dt2;
      const denom = wSum + alpha;
      if (denom < 1e-12) continue;
      const dLambda = (-C - alpha * tetLambda[c]) / denom;
      tetLambda[c] += dLambda;

      if (w1 > 0) {
        pos[p1] += w1 * dLambda * g1x;
        pos[p1 + 1] += w1 * dLambda * g1y;
        pos[p1 + 2] += w1 * dLambda * g1z;
      }
      if (w2 > 0) {
        pos[p2] += w2 * dLambda * g2x;
        pos[p2 + 1] += w2 * dLambda * g2y;
        pos[p2 + 2] += w2 * dLambda * g2z;
      }
      if (w3 > 0) {
        pos[p3] += w3 * dLambda * g3x;
        pos[p3 + 1] += w3 * dLambda * g3y;
        pos[p3 + 2] += w3 * dLambda * g3z;
      }
      if (w4 > 0) {
        pos[p4] += w4 * dLambda * g4x;
        pos[p4 + 1] += w4 * dLambda * g4y;
        pos[p4 + 2] += w4 * dLambda * g4z;
      }
    }
  }

  _projectFloor() {
    const { pos, invMass, count, floorY } = this;
    for (let i = 0; i < count; i++) {
      if (invMass[i] <= 0) continue;
      const o = i * 3;
      if (pos[o + 1] < floorY) pos[o + 1] = floorY;
    }
  }

  _applyFloorFriction() {
    const { pos, prev, invMass, count, floorY } = this;
    const kinetic = lerp(0.22, 0.5, 1 - this.softness);
    const staticThresh = lerp(0.0022, 0.0004, this.softness);
    for (let i = 0; i < count; i++) {
      if (invMass[i] <= 0) continue;
      const o = i * 3;
      if (pos[o + 1] > floorY + 0.04) continue;
      const dx = pos[o] - prev[o];
      const dz = pos[o + 2] - prev[o + 2];
      const tang = Math.hypot(dx, dz);
      if (tang < staticThresh) {
        pos[o] = prev[o];
        pos[o + 2] = prev[o + 2];
      } else {
        pos[o] -= dx * kinetic;
        pos[o + 2] -= dz * kinetic;
      }
    }
  }

  _shapeMatch() {
    let k = this.shapeStiffness;
    if (this.fingerActive || this.grabIndex >= 0) k *= 0.38;
    if (k < 1e-4) return;

    const { pos, invMass, carved, count, qRest, mass, Amat, Rmat, lastR, com } =
      this;
    this._computeCom(pos, com);
    Amat.fill(0);
    for (let i = 0; i < count; i++) {
      if (carved[i]) continue;
      const o = i * 3;
      const m = mass[i];
      const px = pos[o] - com[0];
      const py = pos[o + 1] - com[1];
      const pz = pos[o + 2] - com[2];
      const qx = qRest[o];
      const qy = qRest[o + 1];
      const qz = qRest[o + 2];
      Amat[0] += m * px * qx;
      Amat[1] += m * px * qy;
      Amat[2] += m * px * qz;
      Amat[3] += m * py * qx;
      Amat[4] += m * py * qy;
      Amat[5] += m * py * qz;
      Amat[6] += m * pz * qx;
      Amat[7] += m * pz * qy;
      Amat[8] += m * pz * qz;
    }
    polarRotation(Amat, Rmat);
    blendRotation(lastR, Rmat);
    lastR.set(Rmat);
    this.upright = Math.abs(Rmat[4]);

    const r00 = Rmat[0];
    const r01 = Rmat[1];
    const r02 = Rmat[2];
    const r10 = Rmat[3];
    const r11 = Rmat[4];
    const r12 = Rmat[5];
    const r20 = Rmat[6];
    const r21 = Rmat[7];
    const r22 = Rmat[8];

    for (let i = 0; i < count; i++) {
      if (carved[i] || invMass[i] <= 0) continue;
      if (i === this.grabIndex) continue;
      const o = i * 3;
      const qx = qRest[o];
      const qy = qRest[o + 1];
      const qz = qRest[o + 2];
      const gx = com[0] + r00 * qx + r01 * qy + r02 * qz;
      const gy = com[1] + r10 * qx + r11 * qy + r12 * qz;
      const gz = com[2] + r20 * qx + r21 * qy + r22 * qz;
      pos[o] += (gx - pos[o]) * k;
      pos[o + 1] += (gy - pos[o + 1]) * k;
      pos[o + 2] += (gz - pos[o + 2]) * k;
    }
  }

  _solveCollisions() {
    this._projectFloor();
    const { pos, invMass, count, particleRadius } = this;

    if (this.fingerActive) {
      const fx = this.finger.x;
      const fy = this.finger.y;
      const fz = this.finger.z;
      const minD = this.finger.radius + particleRadius;
      const minD2 = minD * minD;
      for (let i = 0; i < count; i++) {
        if (invMass[i] <= 0) continue;
        const o = i * 3;
        const dx = pos[o] - fx;
        const dy = pos[o + 1] - fy;
        const dz = pos[o + 2] - fz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= minD2 || d2 < 1e-10) continue;
        const d = Math.sqrt(d2);
        const push = (minD - d) / d;
        pos[o] += dx * push;
        pos[o + 1] += dy * push;
        pos[o + 2] += dz * push;
      }
    }

    if (this.grabIndex >= 0 && invMass[this.grabIndex] > 0) {
      const o = this.grabIndex * 3;
      const mix = lerp(0.55, 0.28, this.softness);
      pos[o] += (this.grabX - pos[o]) * mix;
      pos[o + 1] += (this.grabY - pos[o + 1]) * mix;
      pos[o + 2] += (this.grabZ - pos[o + 2]) * mix;

      const radius = 0.16;
      const r2 = radius * radius;
      for (let i = 0; i < count; i++) {
        if (i === this.grabIndex || invMass[i] <= 0) continue;
        const p = i * 3;
        const dx = this.pos[p] - this.pos[o];
        const dy = this.pos[p + 1] - this.pos[o + 1];
        const dz = this.pos[p + 2] - this.pos[o + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2 || d2 < 1e-10) continue;
        const w = 1 - Math.sqrt(d2) / radius;
        const k = mix * w * w * 0.45;
        this.pos[p] += (this.grabX + dx - this.pos[p]) * k;
        this.pos[p + 1] += (this.grabY + dy - this.pos[p + 1]) * k;
        this.pos[p + 2] += (this.grabZ + dz - this.pos[p + 2]) * k;
      }
    }
  }

  step(dt) {
    const maxDt = 1 / 40;
    if (dt > maxDt) dt = maxDt;
    if (dt < 1e-4) return;

    if (this.sleeping && !this.fingerActive && this.grabIndex < 0) return;

    const sub = this.substeps;
    const sdt = dt / sub;
    const dt2 = sdt * sdt;
    const { pos, prev, vel, invMass, count, gravity } = this;
    const damp = Math.pow(1 - this.damping, sdt * 60);

    let energy = 0;
    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < count; i++) {
        if (invMass[i] <= 0 || this.carved[i]) continue;
        const o = i * 3;
        vel[o + 1] += gravity * sdt;
        prev[o] = pos[o];
        prev[o + 1] = pos[o + 1];
        prev[o + 2] = pos[o + 2];
        pos[o] += vel[o] * sdt;
        pos[o + 1] += vel[o + 1] * sdt;
        pos[o + 2] += vel[o + 2] * sdt;
      }

      this.distLambda.fill(0);
      this.tetLambda.fill(0);

      for (let it = 0; it < this.iterations; it++) {
        this._solveDistance(dt2);
        this._solveVolume(dt2);
        this._solveCollisions();
      }
      this._solveCollisions();
      this._shapeMatch();
      this._shapeMatch();
      this._projectFloor();
      this._applyFloorFriction();
      this._syncCarved();

      const maxSpeed = 10;
      for (let i = 0; i < count; i++) {
        if (invMass[i] <= 0) {
          vel[i * 3] = 0;
          vel[i * 3 + 1] = 0;
          vel[i * 3 + 2] = 0;
          continue;
        }
        const o = i * 3;
        let vx = ((pos[o] - prev[o]) / sdt) * damp;
        let vy = ((pos[o + 1] - prev[o + 1]) / sdt) * damp;
        let vz = ((pos[o + 2] - prev[o + 2]) / sdt) * damp;
        const speed = Math.hypot(vx, vy, vz);
        if (speed > maxSpeed) {
          const s = maxSpeed / speed;
          vx *= s;
          vy *= s;
          vz *= s;
        }
        vel[o] = vx;
        vel[o + 1] = vy;
        vel[o + 2] = vz;
        energy += vx * vx + vy * vy + vz * vz;
      }
    }

    this.kinetic = energy / (count * sub);
    if (
      this.kinetic < this.sleepThreshold &&
      !this.fingerActive &&
      this.grabIndex < 0
    ) {
      this.sleeping = true;
      this.vel.fill(0);
    }
  }

  sample(rNorm, theta, yNorm, out, field) {
    const { A, H, rings } = this;
    const pos = field || this.pos;
    const rf = clamp(rNorm, 0, 1) * rings;
    const hf = clamp(yNorm, 0, 1) * (H - 1);
    const aWrap = (((theta / TWO_PI) % 1) + 1) % 1 * A;

    const r0 = Math.floor(rf);
    const r1 = Math.min(r0 + 1, rings);
    const tr = rf - r0;
    const h0 = Math.floor(hf);
    const h1 = Math.min(h0 + 1, H - 1);
    const th = hf - h0;
    const a0 = Math.floor(aWrap) % A;
    const a1 = (a0 + 1) % A;
    const ta = aWrap - Math.floor(aWrap);

    const pick = (r, h, a) => this.indexAt(r, h, a) * 3;

    const lerp3 = (ia, ib, t, dest) => {
      dest[0] = pos[ia] + (pos[ib] - pos[ia]) * t;
      dest[1] = pos[ia + 1] + (pos[ib + 1] - pos[ia + 1]) * t;
      dest[2] = pos[ia + 2] + (pos[ib + 2] - pos[ia + 2]) * t;
    };

    const a = this._sA || (this._sA = new Float32Array(3));
    const b = this._sB || (this._sB = new Float32Array(3));
    const c = this._sC || (this._sC = new Float32Array(3));
    const d = this._sD || (this._sD = new Float32Array(3));
    this._sA = a;
    this._sB = b;
    this._sC = c;
    this._sD = d;

    const sampleRingLayer = (r, h, dest) => {
      if (r <= 0) {
        const o = pick(0, h, 0);
        dest[0] = pos[o];
        dest[1] = pos[o + 1];
        dest[2] = pos[o + 2];
        return;
      }
      lerp3(pick(r, h, a0), pick(r, h, a1), ta, dest);
    };

    sampleRingLayer(r0, h0, a);
    sampleRingLayer(r1, h0, b);
    a[0] += (b[0] - a[0]) * tr;
    a[1] += (b[1] - a[1]) * tr;
    a[2] += (b[2] - a[2]) * tr;

    sampleRingLayer(r0, h1, c);
    sampleRingLayer(r1, h1, d);
    c[0] += (d[0] - c[0]) * tr;
    c[1] += (d[1] - c[1]) * tr;
    c[2] += (d[2] - c[2]) * tr;

    out[0] = a[0] + (c[0] - a[0]) * th;
    out[1] = a[1] + (c[1] - a[1]) * th;
    out[2] = a[2] + (c[2] - a[2]) * th;
    return out;
  }
}
