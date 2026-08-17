/**
 * Cylindrical XPBD soft body.
 *
 * Particles sit on a structured lattice: a center column plus concentric
 * rings. Constraints are distance (structure / shear / bend), tetrahedral
 * volume (nearly incompressible gel), floor contact, and an optional
 * finger collider. Softness maps to XPBD compliance so hard gel keeps
 * its cylinder while soft gel wobbles and slumps without exploding.
 */

const TWO_PI = Math.PI * 2;

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
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
    this.invMass = new Float32Array(count);
    this.mass = new Float32Array(count);
    this.carved = new Uint8Array(count);

    const volume = Math.PI * radius * radius * height;
    const density = 1.15;
    const m = (density * volume) / count;

    for (let h = 0; h < H; h++) {
      const y = (h / (H - 1)) * height + this.floorY;
      const ci = this.centerIndex(h) * 3;
      this.rest[ci] = 0;
      this.rest[ci + 1] = y;
      this.rest[ci + 2] = 0;
      this.mass[this.centerIndex(h)] = m * 1.15;
      this.invMass[this.centerIndex(h)] = 1 / this.mass[this.centerIndex(h)];

      for (let r = 1; r <= rings; r++) {
        const rr = (r / rings) * radius;
        for (let a = 0; a < A; a++) {
          const theta = (a / A) * TWO_PI;
          const i = this.ringIndex(r, h, a);
          const o = i * 3;
          this.rest[o] = Math.cos(theta) * rr;
          this.rest[o + 1] = y;
          this.rest[o + 2] = Math.sin(theta) * rr;
          const ringMass = r === rings ? m * 0.9 : m;
          this.mass[i] = ringMass;
          this.invMass[i] = 1 / ringMass;
        }
      }
    }

    this.pos.set(this.rest);
    this.prev.set(this.rest);
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
  }

  _applyMaterialParams() {
    const s = clamp(this.softness, 0, 1);
    const structural = lerp(1.2e-5, 0.11, Math.pow(s, 1.4));
    const shear = structural * lerp(1.5, 2.6, s);
    const bend = structural * lerp(3.4, 7.2, s);
    const volume = lerp(1.5e-6, 0.006, Math.pow(s, 1.65));

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

  reset() {
    this.pos.set(this.rest);
    this.prev.set(this.rest);
    this.vel.fill(0);
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
    this._syncCarved();
    this.sleeping = false;
  }

  clearCarved() {
    this.carved.fill(0);
    for (let i = 0; i < this.count; i++) {
      if (this.mass[i] > 0) this.invMass[i] = 1 / this.mass[i];
    }
    if (this.pinBottom) this.setPinBottom(true);
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
    const { pos, prev, rest, invMass, count, floorY } = this;
    const kinetic = lerp(0.22, 0.5, 1 - this.softness);
    const staticThresh = lerp(0.0022, 0.0004, this.softness);
    const stick = this.baseStick * lerp(0.85, 0.35, this.softness);
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
      if (pos[o + 1] <= floorY + 0.02) {
        pos[o] += (rest[o] - pos[o]) * stick;
        pos[o + 2] += (rest[o + 2] - pos[o + 2]) * stick;
      }
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

  sample(rNorm, theta, yNorm, out) {
    const { A, H, rings, pos } = this;
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
