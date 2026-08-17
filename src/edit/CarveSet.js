import { Vector4 } from "three";

export const CARVE_HOLE = 1;
export const CARVE_SPHERE = 2;
export const CARVE_PLANE = 3;
export const MAX_CARVES = 16;

function distToAxis2(px, py, pz, ox, oy, oz, dx, dy, dz) {
  const wx = px - ox;
  const wy = py - oy;
  const wz = pz - oz;
  const t = wx * dx + wy * dy + wz * dz;
  const qx = wx - dx * t;
  const qy = wy - dy * t;
  const qz = wz - dz * t;
  return qx * qx + qy * qy + qz * qz;
}

export function testCarve(x, y, z, op) {
  if (op.type === CARVE_HOLE) {
    return (
      distToAxis2(x, y, z, op.ox, op.oy, op.oz, op.dx, op.dy, op.dz) <
      op.radius * op.radius
    );
  }
  if (op.type === CARVE_SPHERE) {
    const dx = x - op.ox;
    const dy = y - op.oy;
    const dz = z - op.oz;
    return dx * dx + dy * dy + dz * dz < op.radius * op.radius;
  }
  if (op.type === CARVE_PLANE) {
    return x * op.dx + y * op.dy + z * op.dz > op.offset;
  }
  return false;
}

export class CarveSet {
  constructor() {
    this.ops = [];
    this.flags = null;
    this.uniforms = {
      uCarveCount: { value: 0 },
      uCarvePos: { value: Array.from({ length: MAX_CARVES }, () => new Vector4()) },
      uCarveDir: { value: Array.from({ length: MAX_CARVES }, () => new Vector4()) },
    };
  }

  push(op) {
    if (this.ops.length >= MAX_CARVES) this.ops.shift();
    this.ops.push(op);
    this.syncUniforms();
  }

  undo() {
    this.ops.pop();
    this.syncUniforms();
  }

  clear() {
    this.ops.length = 0;
    this.syncUniforms();
  }

  contains(x, y, z) {
    for (let i = 0; i < this.ops.length; i++) {
      if (testCarve(x, y, z, this.ops[i])) return true;
    }
    return false;
  }

  reorient(soft, prevR, prevLift, nextR, nextLift) {
    if (!this.ops.length) return;
    const p0 = this._p0 || (this._p0 = new Float32Array(3));
    const p1 = this._p1 || (this._p1 = new Float32Array(3));
    const d0 = this._d0 || (this._d0 = new Float32Array(3));
    const d1 = this._d1 || (this._d1 = new Float32Array(3));
    for (let i = 0; i < this.ops.length; i++) {
      const op = this.ops[i];
      soft.unmapByOrient(op.ox, op.oy, op.oz, prevR, prevLift, p0);
      soft.mapByOrient(p0[0], p0[1], p0[2], nextR, nextLift, p1);
      soft.unrotateByOrient(op.dx, op.dy, op.dz, prevR, d0);
      soft.rotateByOrient(d0[0], d0[1], d0[2], nextR, d1);
      if (op.type === CARVE_PLANE) {
        const nlen = Math.hypot(op.dx, op.dy, op.dz) || 1;
        soft.unmapByOrient(
          (op.dx / nlen) * op.offset,
          (op.dy / nlen) * op.offset,
          (op.dz / nlen) * op.offset,
          prevR,
          prevLift,
          p0
        );
        soft.mapByOrient(p0[0], p0[1], p0[2], nextR, nextLift, p1);
        const n1 = Math.hypot(d1[0], d1[1], d1[2]) || 1;
        op.offset = (d1[0] * p1[0] + d1[1] * p1[1] + d1[2] * p1[2]) / n1;
      }
      op.ox = p1[0];
      op.oy = p1[1];
      op.oz = p1[2];
      op.dx = d1[0];
      op.dy = d1[1];
      op.dz = d1[2];
    }
    this.syncUniforms();
  }

  applyToSoft(soft) {
    const flags = this.flags && this.flags.length === soft.count
      ? this.flags
      : new Uint8Array(soft.count);
    this.flags = flags;
    flags.fill(0);
    const rest = soft.rest;
    for (let i = 0; i < soft.count; i++) {
      const o = i * 3;
      if (this.contains(rest[o], rest[o + 1], rest[o + 2])) flags[i] = 1;
    }
    soft.applyCarvedFlags(flags);
    return soft.carvedCount();
  }

  syncUniforms() {
    const { uCarveCount, uCarvePos, uCarveDir } = this.uniforms;
    uCarveCount.value = this.ops.length;
    for (let i = 0; i < MAX_CARVES; i++) {
      const pos = uCarvePos.value[i];
      const dir = uCarveDir.value[i];
      const op = this.ops[i];
      if (!op) {
        pos.set(0, 0, 0, 0);
        dir.set(0, 1, 0, 0);
        continue;
      }
      pos.set(op.ox, op.oy, op.oz, op.type === CARVE_PLANE ? op.offset : op.radius || 0);
      dir.set(op.dx, op.dy, op.dz, op.type);
    }
  }
}

export function makeHoleOp(rest, towardCenter, radius) {
  const vx = rest.x;
  const vz = rest.z;
  const side = Math.hypot(vx, vz);
  const onCap = rest.yNorm < 0.12 || rest.yNorm > 0.88;
  if (onCap) {
    return {
      type: CARVE_HOLE,
      ox: vx,
      oy: 0,
      oz: vz,
      dx: 0,
      dy: 1,
      dz: 0,
      radius,
    };
  }
  const inv = side > 1e-5 ? 1 / side : 1;
  return {
    type: CARVE_HOLE,
    ox: 0,
    oy: rest.y,
    oz: 0,
    dx: towardCenter ? vx * inv : 1,
    dy: 0,
    dz: towardCenter ? vz * inv : 0,
    radius,
  };
}

export function makeSphereOp(rest, radius) {
  return {
    type: CARVE_SPHERE,
    ox: rest.x,
    oy: rest.y,
    oz: rest.z,
    dx: 0,
    dy: 1,
    dz: 0,
    radius,
  };
}

export function makeSliceOp(rest, radius, gelRadius) {
  const hx = rest.x;
  const hz = rest.z;
  const len = Math.hypot(hx, hz) || 1;
  const nx = hx / len;
  const nz = hz / len;
  const keep = gelRadius * (1.05 - radius / gelRadius);
  return {
    type: CARVE_PLANE,
    ox: 0,
    oy: 0,
    oz: 0,
    dx: nx,
    dy: 0,
    dz: nz,
    radius: 0,
    offset: keep,
  };
}
