// Costa Luna itself: a procedural coastal city built from boxes, planes and
// instanced palms. The street grid, the beach and the ocean are fixed by the
// seeded RNG, so a screenshot seed always rebuilds the same city.
import * as THREE from 'three';
import { makeRng } from './rng.js';
import {
  buildingTexture, roadTexture, sidewalkTexture, sandTexture,
  grassTexture, waterTexture, stuccoTexture,
} from './textures.js';

export const STREET_COORDS = [-160, -80, 0, 80, 160];
export const ROAD_HALF = 6;
export const CITY_EDGE = 220;
export const BEACH_START = 220;
export const OCEAN_START = 296;
// The beach road runs along the sand at this z.
export const BEACH_ROAD_Z = 252;

const PALETTE = {
  tower: ['#7d8aa0', '#5f748f', '#8f7d6b', '#6b7f8f', '#9a8f7a'],
  house: ['#e8c9a0', '#d9a066', '#c97e5a', '#e0b184', '#b5c4a8', '#d48a8a'],
  hotel: ['#f2e3c2', '#e8d0a8', '#dfe8ee'],
};

function box(w, h, d, material, x, y, z, castShadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

// A rectangular loop around one block, driven on the right-hand side of the
// road. Returns waypoints the traffic cars follow.
export function loopWaypoints(cx, cz) {
  const o = ROAD_HALF - 3; // lane offset from the street centreline
  const r = 40 + ROAD_HALF; // half the block pitch (80) plus road half
  return [
    { x: cx - r + o, z: cz - r },
    { x: cx + r, z: cz - r + o },
    { x: cx + r - o, z: cz + r },
    { x: cx - r, z: cz + r - o },
  ];
}

export function buildCity(scene, seed) {
  const rng = makeRng(seed);
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  const sun = new THREE.DirectionalLight(0xfff2d8, 2.6);
  sun.position.set(180, 260, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 700;
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9);
  scene.add(hemi);
  scene.fog = new THREE.Fog(0xbfd9ee, 380, 900);

  // --- ground: sidewalks everywhere, roads on top -------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(520, 520),
    new THREE.MeshLambertMaterial({ map: sidewalkTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 40);
  ground.receiveShadow = true;
  group.add(ground);

  const roadMat = new THREE.MeshLambertMaterial({ map: roadTexture() });
  roadMat.map.wrapS = THREE.RepeatWrapping;
  roadMat.map.wrapT = THREE.RepeatWrapping;
  for (const c of STREET_COORDS) {
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 440), roadMat.clone());
    ns.material.map = roadMat.map.clone();
    ns.material.map.repeat.set(1, 14);
    ns.material.map.needsUpdate = true;
    ns.rotation.x = -Math.PI / 2;
    ns.position.set(c, 0.02, 0);
    ns.receiveShadow = true;
    group.add(ns);
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(440, ROAD_HALF * 2), roadMat.clone());
    ew.material.map = roadMat.map.clone();
    ew.material.map.repeat.set(14, 1);
    ew.material.map.needsUpdate = true;
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(0, 0.02, c);
    ew.receiveShadow = true;
    group.add(ew);
  }
  // Beach road along the sand.
  const beachRoad = new THREE.Mesh(new THREE.PlaneGeometry(440, ROAD_HALF * 2), roadMat.clone());
  beachRoad.material.map = roadMat.map.clone();
  beachRoad.material.map.repeat.set(14, 1);
  beachRoad.material.map.needsUpdate = true;
  beachRoad.rotation.x = -Math.PI / 2;
  beachRoad.position.set(0, 0.02, BEACH_ROAD_Z);
  beachRoad.receiveShadow = true;
  group.add(beachRoad);
  // Crosswalk stripes at every intersection.
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf5f2e8 });
  for (const cx of STREET_COORDS) {
    for (const cz of STREET_COORDS) {
      for (let i = -2; i <= 2; i++) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 4), stripeMat);
        s.rotation.x = -Math.PI / 2;
        s.position.set(cx + i * 2.2, 0.04, cz + ROAD_HALF + 2);
        group.add(s);
      }
    }
  }

  // --- beach and ocean -----------------------------------------------------
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(520, OCEAN_START - BEACH_START),
    new THREE.MeshLambertMaterial({ map: sandTexture() }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.01, (BEACH_START + OCEAN_START) / 2);
  sand.receiveShadow = true;
  group.add(sand);

  const waterMat = new THREE.MeshLambertMaterial({ map: waterTexture() });
  waterMat.map.repeat.set(8, 6);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(1100, 500), waterMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.4, OCEAN_START + 250);
  group.add(ocean);

  // Pier: wooden deck out into the sea with a shack at the end.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x9a7b52 });
  const pierDeck = box(10, 1, 110, pierMat, 40, 1.2, OCEAN_START + 55);
  group.add(pierDeck);
  for (let z = OCEAN_START + 8; z < OCEAN_START + 108; z += 12) {
    for (const dx of [-4, 4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4, 6), pierMat);
      post.position.set(40 + dx, 0, z);
      group.add(post);
    }
  }
  const shack = box(8, 5, 7, new THREE.MeshLambertMaterial({ color: 0x7fb2d9 }), 40, 4, OCEAN_START + 100);
  group.add(shack);
  const shackRoof = box(9.5, 0.6, 8.5, new THREE.MeshLambertMaterial({ color: 0xc96a4a }), 40, 6.8, OCEAN_START + 100);
  group.add(shackRoof);
  colliders.push({ minX: 35, maxX: 45, minZ: OCEAN_START + 96, maxZ: OCEAN_START + 104 });

  // --- park: grass, paths, trees, a gazebo ---------------------------------
  const park = { cx: -120, cz: -40 };
  const lawn = new THREE.Mesh(
    new THREE.PlaneGeometry(68, 68),
    new THREE.MeshLambertMaterial({ map: grassTexture() }),
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(park.cx, 0.03, park.cz);
  lawn.receiveShadow = true;
  group.add(lawn);
  const gazeboMat = new THREE.MeshLambertMaterial({ color: 0xf2e3c2 });
  for (const [dx, dz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 4, 8), gazeboMat);
    col.position.set(park.cx + dx, 2, park.cz + dz);
    col.castShadow = true;
    group.add(col);
  }
  const gazeboRoof = new THREE.Mesh(new THREE.ConeGeometry(8, 3, 4), new THREE.MeshLambertMaterial({ color: 0x2e6f4e }));
  gazeboRoof.position.set(park.cx, 5.5, park.cz);
  gazeboRoof.rotation.y = Math.PI / 4;
  gazeboRoof.castShadow = true;
  group.add(gazeboRoof);
  colliders.push({ minX: park.cx - 6, maxX: park.cx + 6, minZ: park.cz - 6, maxZ: park.cz + 6 });

  // --- buildings ------------------------------------------------------------
  const blockCenters = [];
  for (const bx of [-200, -120, -40, 40, 120, 200]) {
    for (const bz of [-200, -120, -40, 40, 120, 200]) {
      blockCenters.push({ x: bx, z: bz });
    }
  }
  const downtown = (x, z) => Math.abs(x) <= 40 && Math.abs(z) <= 40;
  let seedCounter = seed + 11;
  for (const block of blockCenters) {
    if (block.x === park.cx && block.z === park.cz) continue; // the park
    if (block.z === 200) {
      // Beachfront hotels: a row facing the sea.
      const h = rng.range(22, 42);
      const tex = buildingTexture(rng.pick(PALETTE.hotel), Math.max(4, Math.floor(h / 4)), 8, 0.55, seedCounter++);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const b = box(46, h, 34, mat, block.x, h / 2, block.z);
      group.add(b);
      colliders.push({ minX: block.x - 23, maxX: block.x + 23, minZ: block.z - 17, maxZ: block.z + 17 });
      continue;
    }
    if (downtown(block.x, block.z)) {
      // A downtown tower, sometimes a pair.
      const h = rng.range(42, 88);
      const tex = buildingTexture(rng.pick(PALETTE.tower), Math.max(6, Math.floor(h / 5)), 7, 0.5, seedCounter++);
      const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0x111111 });
      const b = box(rng.range(26, 34), h, rng.range(26, 34), mat, block.x, h / 2, block.z);
      group.add(b);
      colliders.push({ minX: block.x - 17, maxX: block.x + 17, minZ: block.z - 17, maxZ: block.z + 17 });
      const roof = box(10, 2, 10, new THREE.MeshLambertMaterial({ color: 0x39424e }), block.x, h + 1, block.z);
      group.add(roof);
    } else {
      // Houses and mid-rises: two or three per block.
      const count = rng.int(2, 3);
      for (let i = 0; i < count; i++) {
        const ox = rng.range(-18, 18);
        const oz = rng.range(-18, 18);
        const w = rng.range(12, 20);
        const d = rng.range(12, 18);
        const h = rng.chance(0.3) ? rng.range(16, 30) : rng.range(6, 12);
        const base = rng.pick(PALETTE.house);
        const mat = h > 14
          ? new THREE.MeshLambertMaterial({ map: buildingTexture(base, Math.max(3, Math.floor(h / 4)), 5, 0.35, seedCounter++) })
          : new THREE.MeshLambertMaterial({ map: stuccoTexture(base, seedCounter++) });
        const b = box(w, h, d, mat, block.x + ox, h / 2, block.z + oz);
        group.add(b);
        colliders.push({
          minX: block.x + ox - w / 2, maxX: block.x + ox + w / 2,
          minZ: block.z + oz - d / 2, maxZ: block.z + oz + d / 2,
        });
        if (h <= 12) {
          const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, 4, 4), new THREE.MeshLambertMaterial({ color: 0x8a4a3a }));
          roof.position.set(block.x + ox, h + 2, block.z + oz);
          roof.rotation.y = Math.PI / 4;
          roof.castShadow = true;
          group.add(roof);
        }
      }
    }
  }

  // --- streetlights ----------------------------------------------------------
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c313a });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lampPositions = [];
  for (const c of STREET_COORDS) {
    for (let v = -200; v <= 200; v += 40) {
      lampPositions.push([c + ROAD_HALF + 1.5, v]);
      lampPositions.push([v, c + ROAD_HALF + 1.5]);
    }
  }
  for (const [x, z] of lampPositions) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 6), poleMat);
    pole.position.set(x, 3.5, z);
    group.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), lampMat);
    lamp.position.set(x, 7.1, z);
    group.add(lamp);
  }

  // --- palms: instanced trunks and canopies ----------------------------------
  const palmSpots = [];
  for (let x = -210; x <= 210; x += 18) {
    palmSpots.push([x + rng.range(-3, 3), 232 + rng.range(-4, 4)]);
    palmSpots.push([x + rng.range(-3, 3), 288 + rng.range(-3, 3)]);
  }
  for (let i = 0; i < 14; i++) {
    palmSpots.push([park.cx + rng.range(-28, 28), park.cz + rng.range(-28, 28)]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 9, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const canopyGeo = new THREE.ConeGeometry(4.2, 4.5, 7);
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x2f7d3a });
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, palmSpots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  palmSpots.forEach(([x, z], i) => {
    q.setFromAxisAngle(up, rng.next() * Math.PI * 2);
    m4.compose(new THREE.Vector3(x, 4.5, z), q, new THREE.Vector3(1, 1, 1));
    trunks.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, 10.5, z), q, new THREE.Vector3(1, 1, 1));
    canopies.setMatrixAt(i, m4);
    if (Math.abs(x - park.cx) < 30 && Math.abs(z - park.cz) < 30) {
      colliders.push({ minX: x - 0.7, maxX: x + 0.7, minZ: z - 0.7, maxZ: z + 0.7 });
    }
  });
  trunks.castShadow = true;
  canopies.castShadow = true;
  group.add(trunks);
  group.add(canopies);

  // --- the bank (mission 5 target) and the garage (mission 1 target) ---------
  const bank = box(30, 18, 24, new THREE.MeshLambertMaterial({ map: buildingTexture('#cfd6dd', 4, 8, 0.4, seedCounter++) }), 40, 9, -40);
  group.add(bank);
  colliders.push({ minX: 25, maxX: 55, minZ: -52, maxZ: -28 });
  const bankSign = box(20, 3, 1, new THREE.MeshBasicMaterial({ color: 0x1f4d8f }), 40, 19.5, -27.5);
  group.add(bankSign);

  // Warm the scene once so first frames are not black.
  scene.add(new THREE.AmbientLight(0xffffff, 0.15));

  let time = 0;
  return {
    colliders,
    group,
    sun,
    hemi,
    // Sun drifts from afternoon toward sunset as the run goes on.
    update(dt) {
      time += dt;
      const t = Math.min(1, time / 360);
      const elev = 1.05 - t * 0.55;
      const azim = 0.65 + t * 0.5;
      sun.position.set(Math.cos(azim) * 260, Math.sin(elev) * 280, Math.sin(azim) * 200 + 60);
      sun.intensity = 2.6 - t * 1.1;
      hemi.intensity = 0.9 - t * 0.35;
      const sky = new THREE.Color().lerpColors(new THREE.Color(0x8ec7ee), new THREE.Color(0xf2a35e), t * 0.85);
      scene.background = sky;
      scene.fog.color.copy(sky).lerp(new THREE.Color(0xffffff), 0.25);
      waterMat.map.offset.y = (time * 0.008) % 1;
      waterMat.map.offset.x = (time * 0.003) % 1;
    },
  };
}

// Push a circle (x, z, radius) out of every building collider it overlaps.
export function resolveCircleCollision(x, z, radius, colliders) {
  let px = x;
  let pz = z;
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(px, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pz, c.maxZ));
    const dx = px - nx;
    const dz = pz - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        px = nx + (dx / d) * radius;
        pz = nz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const pl = px - c.minX;
        const pr = c.maxX - px;
        const pt = pz - c.minZ;
        const pb = c.maxZ - pz;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) px = c.minX - radius;
        else if (m === pr) px = c.maxX + radius;
        else if (m === pt) pz = c.minZ - radius;
        else pz = c.maxZ + radius;
      }
    }
  }
  return { x: px, z: pz };
}

// Is a point on a road (within the asphalt plus a small margin)?
export function onRoad(x, z) {
  if (Math.abs(z - BEACH_ROAD_Z) < ROAD_HALF + 2 && Math.abs(x) < 230) return true;
  for (const c of STREET_COORDS) {
    if (Math.abs(x - c) < ROAD_HALF + 2 && Math.abs(z) < 225) return true;
    if (Math.abs(z - c) < ROAD_HALF + 2 && Math.abs(x) < 225) return true;
  }
  return false;
}
