// Pedestrians: box people strolling the sidewalks who scatter when a car
// screams past or the wanted level rises.
import * as THREE from 'three';
import { clamp, dist2d } from './rng.js';
import { resolveCircleCollision, STREET_COORDS, ROAD_HALF, onRoad } from './city.js';

const SHIRTS = [0xd35400, 0x8e44ad, 0x16a085, 0xc0392b, 0x2e86c1, 0xf1c40f, 0xecf0f1, 0x7f8c8d];
const PANTS = [0x2c3e50, 0x5d4037, 0x37474f, 0x4a235a];

function makePedMesh(scene, shirtColor, pantsColor) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: pantsColor });
  const skin = new THREE.MeshLambertMaterial({ color: [0xd9a066, 0xc98a5a, 0x8a5a3b, 0xe8b88a][Math.floor(Math.random() * 4)] });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.66, 0.32), shirt);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.36), skin);
  head.position.y = 1.68;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.74, 0.24), pants);
  legL.position.set(-0.15, 0.37, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.15;
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.2), shirt);
  armL.position.set(-0.4, 1.14, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.4;
  group.add(armR);
  scene.add(group);
  return { group, legL, legR, armL, armR };
}

export function spawnPedestrians(scene, rng, count, colliders) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const mesh = makePedMesh(scene, rng.pick(SHIRTS), rng.pick(PANTS));
    // Start on a sidewalk beside a street.
    const street = rng.pick(STREET_COORDS);
    const along = rng.range(-200, 200);
    const side = rng.chance(0.5) ? 1 : -1;
    const x = rng.chance(0.5) ? street + side * (ROAD_HALF + 2.5) : along;
    const z = rng.chance(0.5) ? along : street + side * (ROAD_HALF + 2.5);
    const ped = {
      ...mesh,
      x: clamp(x, -215, 215), z: clamp(z, -215, 290),
      heading: rng.next() * Math.PI * 2,
      speed: rng.range(1.2, 2.2),
      walkPhase: rng.next() * 6,
      target: null, fleeing: 0, panic: 0,
    };
    ped.group.position.set(ped.x, 0, ped.z);
    peds.push(ped);
  }
  return peds;
}

function pickStrollTarget(ped, rng) {
  // Walk to a nearby point on a sidewalk.
  const street = rng.pick(STREET_COORDS);
  const along = clamp(ped.x + rng.range(-60, 60), -210, 210);
  const side = rng.chance(0.5) ? 1 : -1;
  if (rng.chance(0.5)) return { x: street + side * (ROAD_HALF + 2.5), z: along };
  return { x: along, z: street + side * (ROAD_HALF + 2.5) };
}

export function updatePedestrians(peds, dt, colliders, rng, danger) {
  for (const ped of peds) {
    if (ped.fleeing > 0) ped.fleeing -= dt;
    // A fast car or a police chase nearby sends them running.
    if (danger) {
      const d = dist2d(ped.x, ped.z, danger.x, danger.z);
      if (d < 14 && ped.fleeing <= 0) {
        ped.fleeing = rng.range(1.5, 3);
        ped.target = {
          x: clamp(ped.x + (ped.x - danger.x) * 2, -215, 215),
          z: clamp(ped.z + (ped.z - danger.z) * 2, -215, 290),
        };
      }
    }
    if (!ped.target || dist2d(ped.x, ped.z, ped.target.x, ped.target.z) < 2) {
      if (ped.fleeing > 0) {
        ped.target = { x: clamp(ped.x + rng.range(-30, 30), -215, 215), z: clamp(ped.z + rng.range(-30, 30), -215, 290) };
      } else {
        ped.target = pickStrollTarget(ped, rng);
      }
    }
    const desired = Math.atan2(ped.target.x - ped.x, ped.target.z - ped.z);
    let diff = desired - ped.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ped.heading += clamp(diff, -3 * dt, 3 * dt);
    const speed = ped.fleeing > 0 ? 5.5 : ped.speed;
    const nx = ped.x + Math.sin(ped.heading) * speed * dt;
    const nz = ped.z + Math.cos(ped.heading) * speed * dt;
    const hit = resolveCircleCollision(nx, nz, 0.5, colliders);
    ped.x = hit.x;
    ped.z = hit.z;
    ped.walkPhase += dt * speed * 2.2;
    const swing = Math.sin(ped.walkPhase) * (ped.fleeing > 0 ? 0.9 : 0.55);
    ped.legL.rotation.x = swing;
    ped.legR.rotation.x = -swing;
    ped.armL.rotation.x = -swing * 0.8;
    ped.armR.rotation.x = swing * 0.8;
    ped.group.position.set(ped.x, 0, ped.z);
    ped.group.rotation.y = ped.heading;
  }
}

// The nearest pedestrian within `radius` of a point, for the punch.
export function nearestPed(peds, x, z, radius) {
  let best = null;
  let bestD = radius;
  for (const ped of peds) {
    const d = dist2d(x, z, ped.x, ped.z);
    if (d < bestD) { bestD = d; best = ped; }
  }
  return best;
}
