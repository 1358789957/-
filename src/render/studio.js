import * as THREE from "three";

/**
 * Product-studio lighting like the Three.js transmission demo and
 * holtsetio/softbodies: bounce cards in the PMREM, glossy floor, soft
 * contact shadow. The visible backdrop is a dark cyclorama, not a void.
 */
export function createStudioEnvironment(renderer) {
  const bake = new THREE.Scene();

  const cyc = new THREE.Mesh(
    new THREE.SphereGeometry(6.5, 40, 24),
    new THREE.MeshBasicMaterial({ color: 0xe8eef6, side: THREE.BackSide })
  );
  bake.add(cyc);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(5.2, 64),
    new THREE.MeshBasicMaterial({ color: 0xd8dee8 })
  );
  floor.rotation.x = -Math.PI / 2;
  bake.add(floor);

  const addCard = (color, w, h, x, y, z, rotY = 0) => {
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
    );
    card.position.set(x, y, z);
    card.rotation.y = rotY;
    bake.add(card);
  };

  addCard(0xfff6e8, 3.4, 2.4, 2.6, 1.6, -1.1, -0.7);
  addCard(0xb9e4ff, 2.8, 2.2, -2.8, 1.4, -0.4, 0.85);
  addCard(0xffffff, 2.2, 1.2, 0.2, 3.1, 1.6, Math.PI);
  addCard(0xffd7c2, 1.6, 1.4, 1.8, 0.7, 2.2, Math.PI * 0.85);

  const key = new THREE.DirectionalLight(0xfff4ea, 2.4);
  key.position.set(2.8, 4.4, 2.2);
  bake.add(key);
  bake.add(new THREE.AmbientLight(0xffffff, 0.55));

  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(bake, 0.06).texture;
  pmrem.dispose();
  return texture;
}

export function createStudioBackdrop() {
  const group = new THREE.Group();

  const cyc = new THREE.Mesh(
    new THREE.SphereGeometry(9, 48, 28, 0, Math.PI * 2, 0, Math.PI * 0.52),
    new THREE.MeshStandardMaterial({
      color: 0x151922,
      roughness: 1,
      metalness: 0,
      side: THREE.BackSide,
    })
  );
  cyc.position.y = -0.2;
  group.add(cyc);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(5.4, 80),
    new THREE.MeshPhysicalMaterial({
      color: 0x1a1f28,
      metalness: 0.42,
      roughness: 0.18,
      envMapIntensity: 0.85,
      clearcoat: 0.35,
      clearcoatRoughness: 0.22,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.78, 0.82, 0.028, 72),
    new THREE.MeshPhysicalMaterial({
      color: 0x2a3340,
      metalness: 0.72,
      roughness: 0.16,
      clearcoat: 0.8,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.1,
    })
  );
  disc.position.y = 0.014;
  disc.receiveShadow = true;
  group.add(disc);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.8, 0.012, 12, 80),
    new THREE.MeshPhysicalMaterial({
      color: 0xc9d4e2,
      metalness: 0.9,
      roughness: 0.18,
    })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.03;
  group.add(ring);

  return group;
}

export function createContactShadow() {
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.031;
  shadow.renderOrder = 1;
  return shadow;
}
