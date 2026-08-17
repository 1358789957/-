import * as THREE from "three";

const TWO_PI = Math.PI * 2;
const _sample = new Float32Array(3);

/**
 * Closed cylinder whose vertices store cylindrical coordinates so they
 * can be skinned each frame from the XPBD lattice.
 */
export function createGelGeometry({
  radialSegs = 48,
  heightSegs = 36,
  capRings = 8,
} = {}) {
  const positions = [];
  const samples = [];
  const uvs = [];
  const indices = [];

  const sideStart = 0;
  for (let h = 0; h <= heightSegs; h++) {
    const yNorm = h / heightSegs;
    for (let a = 0; a <= radialSegs; a++) {
      const u = a / radialSegs;
      const theta = u * TWO_PI;
      samples.push(1, theta, yNorm);
      positions.push(0, 0, 0);
      uvs.push(u, yNorm);
    }
  }

  const sideCols = radialSegs + 1;
  for (let h = 0; h < heightSegs; h++) {
    for (let a = 0; a < radialSegs; a++) {
      const i0 = sideStart + h * sideCols + a;
      const i1 = i0 + 1;
      const i2 = i0 + sideCols;
      const i3 = i2 + 1;
      indices.push(i0, i2, i1, i1, i2, i3);
    }
  }

  const addCap = (yNorm, inward) => {
    const start = samples.length / 3;
    samples.push(0, 0, yNorm);
    positions.push(0, 0, 0);
    uvs.push(0.5, 0.5);

    for (let r = 1; r <= capRings; r++) {
      const rNorm = r / capRings;
      for (let a = 0; a <= radialSegs; a++) {
        const u = a / radialSegs;
        const theta = u * TWO_PI;
        samples.push(rNorm, theta, yNorm);
        positions.push(0, 0, 0);
        uvs.push(0.5 + Math.cos(theta) * 0.5 * rNorm, 0.5 + Math.sin(theta) * 0.5 * rNorm);
      }
    }

    const cols = radialSegs + 1;
    for (let a = 0; a < radialSegs; a++) {
      const outer = start + 1 + a;
      if (inward) indices.push(start, outer + 1, outer);
      else indices.push(start, outer, outer + 1);
    }
    for (let r = 0; r < capRings - 1; r++) {
      const ring = start + 1 + r * cols;
      const next = ring + cols;
      for (let a = 0; a < radialSegs; a++) {
        const i0 = ring + a;
        const i1 = i0 + 1;
        const i2 = next + a;
        const i3 = i2 + 1;
        if (inward) indices.push(i0, i1, i2, i1, i3, i2);
        else indices.push(i0, i2, i1, i1, i2, i3);
      }
    }
  };

  addCap(0, true);
  addCap(1, false);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.userData.samples = new Float32Array(samples);
  geometry.computeVertexNormals();
  return geometry;
}

export function deformGelGeometry(geometry, soft) {
  const pos = geometry.attributes.position;
  const samples = geometry.userData.samples;
  const n = pos.count;
  const arr = pos.array;
  for (let i = 0; i < n; i++) {
    const s = i * 3;
    soft.sample(samples[s], samples[s + 1], samples[s + 2], _sample);
    const o = i * 3;
    arr[o] = _sample[0];
    arr[o + 1] = _sample[1];
    arr[o + 2] = _sample[2];
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

export function createGelMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xc8f4ff,
    metalness: 0,
    roughness: 0.06,
    transmission: 0.97,
    thickness: 1.15,
    ior: 1.41,
    transparent: true,
    opacity: 1,
    attenuationColor: new THREE.Color(0x6ec8ff),
    attenuationDistance: 0.72,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    sheen: 0.15,
    sheenColor: new THREE.Color(0xb8e8ff),
    specularIntensity: 1,
    envMapIntensity: 1.15,
    side: THREE.DoubleSide,
  });
}
