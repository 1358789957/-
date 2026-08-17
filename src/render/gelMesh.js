import * as THREE from "three";

const TWO_PI = Math.PI * 2;
const _sample = new Float32Array(3);

/**
 * Hollow gel shell. Vertices store (wallNorm, theta, yNorm): 0 is the inner
 * surface, 1 is the outer surface. Open ends get a wall-thickness rim.
 */
export function visualRadialSegs(shape) {
  return shape === "prism" ? 8 : 48;
}

export function createGelGeometry({
  radialSegs = 48,
  heightSegs = 40,
  rimSegs = 4,
  caps = "rims",
} = {}) {
  const positions = [];
  const samples = [];
  const uvs = [];
  const indices = [];
  const cols = radialSegs + 1;

  const addGrid = (wallNorm, invert, vOffset = 0) => {
    const start = samples.length / 3;
    for (let h = 0; h <= heightSegs; h++) {
      const yNorm = h / heightSegs;
      for (let a = 0; a <= radialSegs; a++) {
        const u = a / radialSegs;
        const theta = u * TWO_PI;
        samples.push(wallNorm, theta, yNorm);
        positions.push(0, 0, 0);
        uvs.push(u, yNorm * 0.5 + vOffset);
      }
    }
    for (let h = 0; h < heightSegs; h++) {
      for (let a = 0; a < radialSegs; a++) {
        const i0 = start + h * cols + a;
        const i1 = i0 + 1;
        const i2 = i0 + cols;
        const i3 = i2 + 1;
        if (invert) indices.push(i0, i1, i2, i1, i3, i2);
        else indices.push(i0, i2, i1, i1, i2, i3);
      }
    }
  };

  const addRim = (yNorm, invert) => {
    const start = samples.length / 3;
    for (let r = 0; r <= rimSegs; r++) {
      const wallNorm = r / rimSegs;
      for (let a = 0; a <= radialSegs; a++) {
        const u = a / radialSegs;
        const theta = u * TWO_PI;
        samples.push(wallNorm, theta, yNorm);
        positions.push(0, 0, 0);
        uvs.push(u, yNorm > 0.5 ? 0.96 : 0.04);
      }
    }
    for (let r = 0; r < rimSegs; r++) {
      for (let a = 0; a < radialSegs; a++) {
        const i0 = start + r * cols + a;
        const i1 = i0 + 1;
        const i2 = i0 + cols;
        const i3 = i2 + 1;
        if (invert) indices.push(i0, i1, i2, i1, i3, i2);
        else indices.push(i0, i2, i1, i1, i2, i3);
      }
    }
  };

  addGrid(1, false, 0.5);
  addGrid(0, true, 0);
  if (caps === "rims" || caps === "both" || caps === "bottom") addRim(0, true);
  if (caps === "rims" || caps === "both" || caps === "top") addRim(1, false);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("restCyl", new THREE.Float32BufferAttribute(samples, 3));
  geometry.setAttribute("restPos", new THREE.Float32BufferAttribute(new Float32Array(positions.length), 3));
  geometry.setIndex(indices);
  geometry.userData.samples = new Float32Array(samples);
  geometry.userData.restGen = -1;
  geometry.computeVertexNormals();
  return geometry;
}

export function deformGelGeometry(geometry, soft, { normals = true } = {}) {
  const pos = geometry.attributes.position;
  let restPos = geometry.attributes.restPos;
  if (!restPos) {
    restPos = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
    geometry.setAttribute("restPos", restPos);
  }
  const samples = geometry.userData.samples;
  const n = pos.count;
  const arr = pos.array;
  const restArr = restPos.array;
  const writeRest = geometry.userData.restGen !== soft.restGeneration;
  for (let i = 0; i < n; i++) {
    const s = i * 3;
    soft.sample(samples[s], samples[s + 1], samples[s + 2], _sample);
    arr[s] = _sample[0];
    arr[s + 1] = _sample[1];
    arr[s + 2] = _sample[2];
    if (writeRest) {
      soft.sample(samples[s], samples[s + 1], samples[s + 2], _sample, soft.rest);
      restArr[s] = _sample[0];
      restArr[s + 1] = _sample[1];
      restArr[s + 2] = _sample[2];
    }
  }
  pos.needsUpdate = true;
  if (writeRest) {
    restPos.needsUpdate = true;
    geometry.userData.restGen = soft.restGeneration;
  }
  if (normals) geometry.computeVertexNormals();
}

const _tint = new THREE.Color();
const _deep = new THREE.Color();
const _sheen = new THREE.Color();
const _hsl = { h: 0, s: 0, l: 0 };

export const DEFAULT_GEL_COLOR = "#c8f4ff";

export function applyGelColor(material, hex) {
  _tint.set(hex);
  material.color.copy(_tint);
  _tint.getHSL(_hsl);
  _deep.setHSL(
    _hsl.h,
    Math.min(1, _hsl.s * 1.28 + 0.06),
    Math.max(0.16, Math.min(0.62, _hsl.l * 0.52))
  );
  material.attenuationColor.copy(_deep);
  material.attenuationDistance = 0.2 + (1 - _hsl.s) * 0.22;
  material.thickness = 0.11;
  _sheen.copy(_tint).lerp(new THREE.Color(0xffffff), 0.42);
  material.sheenColor.copy(_sheen);
}

export function createGelMaterial(hex = DEFAULT_GEL_COLOR) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xc8f4ff,
    metalness: 0,
    roughness: 0.075,
    transmission: 0.86,
    thickness: 0.12,
    ior: 1.41,
    transparent: true,
    opacity: 1,
    attenuationColor: new THREE.Color(0x6ec8ff),
    attenuationDistance: 0.26,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    sheen: 0.15,
    sheenColor: new THREE.Color(0xb8e8ff),
    specularIntensity: 1,
    envMapIntensity: 1.15,
    side: THREE.DoubleSide,
  });
  applyGelColor(material, hex);
  return material;
}

const CARVE_VERT = /* glsl */ `
attribute vec3 restPos;
varying vec3 vRestPos;
`;

const CARVE_VERT_MAIN = /* glsl */ `
vRestPos = restPos;
`;

const CARVE_FRAG = /* glsl */ `
varying vec3 vRestPos;
uniform int uCarveCount;
uniform vec4 uCarvePos[16];
uniform vec4 uCarveDir[16];
uniform float uGelRadius;
uniform float uGelHeight;
uniform float uGelFloor;

bool gelCarved(vec3 p) {
  for (int i = 0; i < 16; i++) {
    if (i >= uCarveCount) break;
    int kind = int(uCarveDir[i].w);
    if (kind == 1) {
      vec3 w = p - uCarvePos[i].xyz;
      vec3 axis = uCarveDir[i].xyz;
      vec3 perp = w - axis * dot(w, axis);
      if (dot(perp, perp) < uCarvePos[i].w * uCarvePos[i].w) return true;
    } else if (kind == 2) {
      vec3 w = p - uCarvePos[i].xyz;
      if (dot(w, w) < uCarvePos[i].w * uCarvePos[i].w) return true;
    } else if (kind == 3) {
      if (dot(p, uCarveDir[i].xyz) > uCarvePos[i].w) return true;
    }
  }
  return false;
}
`;

const CARVE_FRAG_MAIN = /* glsl */ `
{
  if (gelCarved(vRestPos)) discard;
}
`;

export function attachCarveShader(material, carveSet, gel) {
  const extra = {
    uGelRadius: { value: gel.radius },
    uGelHeight: { value: gel.height },
    uGelFloor: { value: gel.floorY },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, carveSet.uniforms, extra);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${CARVE_VERT}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${CARVE_VERT_MAIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${CARVE_FRAG}`);
    if (shader.fragmentShader.includes("#include <clipping_planes_fragment>")) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>\n${CARVE_FRAG_MAIN}`
      );
    } else {
      shader.fragmentShader = shader.fragmentShader.replace(
        "void main() {",
        `void main() {\n${CARVE_FRAG_MAIN}`
      );
    }
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => "gel-carve-v2";
  material.needsUpdate = true;
}
