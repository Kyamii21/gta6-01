// Cahaya Bay, the game's original city: a 5x5 road grid with a harbor on the south
// edge, built from boxes, canvas textures and a sun that orbits through a day/night
// cycle. Everything here is procedural — no borrowed map, no external assets.
import * as THREE from 'three';
import { CITY, DAY, PALETTE } from './config.js';

const BUILDING_COLORS = [
  0x8f7b6e, 0x6e7f8f, 0x9c8a6a, 0x7d6a8f, 0x5f7a6a, 0x8f6a5f, 0x4f6a7a, 0xa08a7a,
  0x6a5f7a, 0x7a8a6a, 0x93796b, 0x5a6e7d,
];
const NEON_COLORS = [PALETTE.neonPink, PALETTE.neonCyan, PALETTE.neonAmber, '#7dff5e'];

/** A windows texture drawn once on a canvas: lit windows glow at night. */
function makeWindowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4a5162';
  ctx.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 12; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const lit = Math.random() < 0.55;
      ctx.fillStyle = lit ? (Math.random() < 0.8 ? '#ffd98a' : '#9fe8ff') : '#22262f';
      ctx.fillRect(8 + col * 20, 10 + row * 20, 12, 14);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The ground: one big canvas texture with roads, lane dashes and crosswalks. */
function makeGroundTexture() {
  const size = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = CITY.half + 40;
  const toPx = (v) => ((v + half) / (half * 2)) * size;
  const roadPx = (CITY.roadWidth / (half * 2)) * size;

  ctx.fillStyle = PALETTE.sidewalk;
  ctx.fillRect(0, 0, size, size);

  // Block interiors: slightly varied concrete slabs.
  for (let bx = 0; bx < 4; bx += 1) {
    for (let bz = 0; bz < 4; bz += 1) {
      const x0 = CITY.roadLines[bx] + CITY.roadWidth / 2;
      const z0 = CITY.roadLines[bz] + CITY.roadWidth / 2;
      const w = CITY.pitch - CITY.roadWidth;
      const shade = 88 + ((bx * 7 + bz * 13) % 5) * 6;
      ctx.fillStyle = `rgb(${shade},${shade + 3},${shade + 8})`;
      ctx.fillRect(toPx(x0), toPx(z0), (w / (half * 2)) * size, (w / (half * 2)) * size);
    }
  }

  // Roads.
  ctx.fillStyle = PALETTE.asphalt;
  for (const line of CITY.roadLines) {
    ctx.fillRect(toPx(line - CITY.roadWidth / 2), 0, roadPx, size);
    ctx.fillRect(0, toPx(line - CITY.roadWidth / 2), size, roadPx);
  }

  // Centre dashes and crosswalks.
  ctx.fillStyle = '#d8b13c';
  for (const line of CITY.roadLines) {
    for (let d = -half + 10; d < half - 10; d += 24) {
      ctx.fillRect(toPx(line) - 2, toPx(d), 4, 12);
      ctx.fillRect(toPx(d), toPx(line) - 2, 12, 4);
    }
  }
  ctx.fillStyle = 'rgba(235,235,235,0.85)';
  for (const x of CITY.roadLines) {
    for (const z of CITY.roadLines) {
      for (let s = -1; s <= 1; s += 1) {
        ctx.fillRect(toPx(x + s * 5) - 2, toPx(z - CITY.roadWidth / 2 + 1), 4, 6);
        ctx.fillRect(toPx(x + s * 5) - 2, toPx(z + CITY.roadWidth / 2 - 7), 4, 6);
        ctx.fillRect(toPx(x - CITY.roadWidth / 2 + 1), toPx(z + s * 5) - 2, 6, 4);
        ctx.fillRect(toPx(x + CITY.roadWidth / 2 - 7), toPx(z + s * 5) - 2, 6, 4);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeNeonSignTexture(word, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, 256, 64);
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = color;
  ctx.fillText(word, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const SIGN_WORDS = ['HOTEL', 'NEON', 'PIER 9', 'TACOS', '24H', 'CLUB', 'BAR', 'MOTEL', 'RAMEN', 'DOCK'];

/**
 * Build the city into `scene`. Returns colliders (building AABBs), the road lines,
 * spawn points, the beacon helpers and an `update(dayTime)` that moves the sun.
 */
export function buildCity(scene, rng) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];

  const groundTex = makeGroundTexture();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry((CITY.half + 40) * 2, (CITY.half + 40) * 2),
    new THREE.MeshLambertMaterial({ map: groundTex }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // The harbor: water south of the grid, a pier and stacked containers.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry((CITY.half + 40) * 2, 90),
    new THREE.MeshLambertMaterial({ color: PALETTE.water }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, CITY.half + 45);
  group.add(water);
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(70, 1.2, 26),
    new THREE.MeshLambertMaterial({ color: 0x6a5a44 }),
  );
  pier.position.set(-60, 0.4, CITY.half + 18);
  pier.castShadow = true;
  pier.receiveShadow = true;
  group.add(pier);
  const containerColors = [0xb8442e, 0x2e7ab8, 0x3d8f4f, 0xc78a2e];
  for (let i = 0; i < 10; i += 1) {
    const c = new THREE.Mesh(
      new THREE.BoxGeometry(12, 2.6, 2.6),
      new THREE.MeshLambertMaterial({ color: containerColors[i % containerColors.length] }),
    );
    c.position.set(-120 + (i % 5) * 14, 1.3 + Math.floor(i / 5) * 2.7, CITY.half - 6 - (i % 2) * 6);
    c.castShadow = true;
    group.add(c);
    colliders.push({ minX: c.position.x - 6, maxX: c.position.x + 6, minZ: c.position.z - 1.4, maxZ: c.position.z + 1.4 });
  }

  // Buildings, one to four per block, with neon signs on some of them.
  const windowTex = makeWindowTexture();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const neonSigns = [];
  let signIndex = 0;
  for (let bx = 0; bx < 4; bx += 1) {
    for (let bz = 0; bz < 4; bz += 1) {
      const x0 = CITY.roadLines[bx] + CITY.roadWidth / 2 + CITY.blockMargin;
      const z0 = CITY.roadLines[bz] + CITY.roadWidth / 2 + CITY.blockMargin;
      const inner = CITY.pitch - CITY.roadWidth - CITY.blockMargin * 2;
      const count = rng.int(1, 3);
      for (let n = 0; n < count; n += 1) {
        const w = rng.range(inner * 0.35, inner * 0.6);
        const d = rng.range(inner * 0.35, inner * 0.6);
        const h = rng.range(9, 42);
        const cx = x0 + rng.range(0, inner - w) + w / 2;
        const cz = z0 + rng.range(0, inner - d) + d / 2;
        const tint = rng.pick(BUILDING_COLORS);
        const tex = windowTex.clone();
        tex.needsUpdate = true;
        tex.repeat.set(Math.max(1, Math.round(w / 14)), Math.max(1, Math.round(h / 14)));
        const mat = new THREE.MeshLambertMaterial({ map: tex, color: tint });
        const building = new THREE.Mesh(boxGeo, mat);
        building.scale.set(w, h, d);
        building.position.set(cx, h / 2, cz);
        building.castShadow = true;
        building.receiveShadow = true;
        group.add(building);
        colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
        if (rng.chance(0.35) && h > 14) {
          const word = SIGN_WORDS[signIndex % SIGN_WORDS.length];
          signIndex += 1;
          const color = NEON_COLORS[signIndex % NEON_COLORS.length];
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(12, 3),
            new THREE.MeshBasicMaterial({ map: makeNeonSignTexture(word, color), transparent: true }),
          );
          sign.position.set(cx, h - 2.5, cz + d / 2 + 0.15);
          group.add(sign);
          neonSigns.push(sign);
        }
      }
    }
  }

  // Palm trees along the sidewalks and lamps at every intersection.
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 5, 6);
  const crownGeo = new THREE.ConeGeometry(2.4, 5, 7);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2e });
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x2e7a4a });
  const lampPoleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const lampHeadGeo = new THREE.SphereGeometry(0.5, 8, 6);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lampHeads = [];
  for (let i = 0; i < 46; i += 1) {
    const line = rng.pick(CITY.roadLines);
    const along = rng.range(-CITY.half + 20, CITY.half - 20);
    const side = rng.chance(0.5) ? 1 : -1;
    const horizontal = rng.chance(0.5);
    const x = horizontal ? along : line + side * (CITY.roadWidth / 2 + 3);
    const z = horizontal ? line + side * (CITY.roadWidth / 2 + 3) : along;
    if (Math.abs(x) > CITY.half - 8 || Math.abs(z) > CITY.half - 8) continue;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 2.5, z);
    trunk.castShadow = true;
    group.add(trunk);
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.position.set(x, 6.8, z);
    crown.castShadow = true;
    group.add(crown);
  }
  for (const x of CITY.roadLines) {
    for (const z of CITY.roadLines) {
      const pole = new THREE.Mesh(lampPoleGeo, lampPoleMat);
      pole.position.set(x + CITY.roadWidth / 2 + 1.5, 3.5, z + CITY.roadWidth / 2 + 1.5);
      group.add(pole);
      const head = new THREE.Mesh(lampHeadGeo, lampHeadMat);
      head.position.set(x + CITY.roadWidth / 2 + 1.5, 7.1, z + CITY.roadWidth / 2 + 1.5);
      group.add(head);
      lampHeads.push(head);
    }
  }

  // Sun, sky and fog, all driven by the time of day.
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a3230, 0.9);
  scene.add(hemi);

  const skyDay = new THREE.Color(PALETTE.skyDay);
  const skyDusk = new THREE.Color(PALETTE.skyDusk);
  const skyNight = new THREE.Color(PALETTE.skyNight);
  const fogDay = new THREE.Color(PALETTE.fogDay);
  const fogDusk = new THREE.Color(PALETTE.fogDusk);
  const fogNight = new THREE.Color(PALETTE.fogNight);
  const sky = new THREE.Color();
  const fog = new THREE.Color();
  scene.fog = new THREE.Fog(PALETTE.fogDusk, 120, 620);

  function update(dayTime) {
    // dayTime 0..1: 0 = dawn, 0.25 = noon, 0.5 = dusk, 0.75 = midnight.
    const angle = dayTime * Math.PI * 2 - Math.PI / 2;
    const sunHeight = Math.sin(angle);
    sun.position.set(Math.cos(angle) * 320, Math.max(20, sunHeight * 320), 140);
    const duskness = Math.max(0, 1 - Math.abs(sunHeight) * 2.4);
    const nightness = Math.max(0, -sunHeight);
    sun.intensity = 0.6 + Math.max(0, sunHeight) * 2.4;
    sun.color.setHex(sunHeight > 0.25 ? 0xfff2d0 : 0xffb36a);
    hemi.intensity = 0.85 + Math.max(0, sunHeight) * 0.6;
    sky.copy(skyDay).lerp(skyDusk, duskness).lerp(skyNight, nightness);
    fog.copy(fogDay).lerp(fogDusk, duskness).lerp(fogNight, nightness);
    scene.background = sky;
    scene.fog.color.copy(fog);
    const lampGlow = nightness > 0.25 || duskness > 0.55;
    for (const head of lampHeads) head.material.color.setHex(lampGlow ? 0xffe9a8 : 0x555044);
    for (const sign of neonSigns) sign.visible = lampGlow;
    water.material.color.setHex(nightness > 0.4 ? 0x0a2038 : 0x123a5c);
  }

  update(DAY.startTime);

  return {
    group,
    colliders,
    sun,
    update,
    /** True when (x, z) is on a road strip (within the road half-width). */
    isOnRoad(x, z) {
      for (const line of CITY.roadLines) {
        if (Math.abs(x - line) <= CITY.roadWidth / 2 || Math.abs(z - line) <= CITY.roadWidth / 2) return true;
      }
      return false;
    },
    /** The nearest point on a road centre line, for snapping traffic and markers. */
    nearestRoadPoint(x, z) {
      let best = null;
      let bestDist = Infinity;
      for (const line of CITY.roadLines) {
        const d1 = Math.abs(x - line);
        if (d1 < bestDist) { bestDist = d1; best = { x: line, z }; }
        const d2 = Math.abs(z - line);
        if (d2 < bestDist) { bestDist = d2; best = { x, z: line }; }
      }
      return best;
    },
    /** Clamp a position to the drivable city, keeping it off the water. */
    clampToCity(x, z, margin = 4) {
      return {
        x: Math.max(-CITY.half + margin, Math.min(CITY.half - margin, x)),
        z: Math.max(-CITY.half + margin, Math.min(CITY.half - margin, z)),
      };
    },
  };
}
