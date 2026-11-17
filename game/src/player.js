// Raka, the player character, on foot: a low-poly figure built from boxes, with
// walk-cycle leg swing, third-person camera follow, and collision against the
// city's buildings. Driving is handled by vehicles.js; this module owns the feet.
import * as THREE from 'three';
import { CITY, PLAYER } from './config.js';

function makeBodyMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.72, 0.36),
    new THREE.MeshLambertMaterial({ color: 0x2e8f7a }),
  );
  jacket.position.y = 1.12;
  jacket.castShadow = true;
  group.add(jacket);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.34, 0.34),
    new THREE.MeshLambertMaterial({ color: 0xc98d64 }),
  );
  head.position.y = 1.66;
  head.castShadow = true;
  group.add(head);
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.1, 0.38),
    new THREE.MeshLambertMaterial({ color: 0x222222 }),
  );
  cap.position.y = 1.86;
  group.add(cap);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2a2f3a });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.26), legMat);
  legL.geometry.translate(0, -0.36, 0);
  legL.position.set(-0.16, 0.74, 0);
  legL.castShadow = true;
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legR);
  const armMat = new THREE.MeshLambertMaterial({ color: 0x2e8f7a });
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.22), armMat);
  armL.geometry.translate(0, -0.31, 0);
  armL.position.set(-0.42, 1.44, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.42;
  group.add(armR);
  return { group, legL, legR, armL, armR };
}

function circleHitsBuilding(x, z, radius, colliders) {
  for (let i = 0; i < colliders.length; i += 1) {
    const c = colliders[i];
    if (x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ) return c;
  }
  return null;
}

/** Push a circle out of a building AABB; returns the corrected position. */
export function resolveBuildingCollision(x, z, radius, colliders) {
  const c = circleHitsBuilding(x, z, radius, colliders);
  if (!c) return { x, z, hit: false };
  const dxMin = x + radius - c.minX;
  const dxMax = c.maxX - (x - radius);
  const dzMin = z + radius - c.minZ;
  const dzMax = c.maxZ - (z - radius);
  const min = Math.min(dxMin, dxMax, dzMin, dzMax);
  if (min === dxMin) return { x: c.minX - radius, z, hit: true };
  if (min === dxMax) return { x: c.maxX + radius, z, hit: true };
  if (min === dzMin) return { x, z: c.minZ - radius, hit: true };
  return { x, z: c.maxZ + radius, hit: true };
}

export function createPlayer(scene, city) {
  const { group, legL, legR, armL, armR } = makeBodyMesh();
  scene.add(group);
  const state = {
    x: 0,
    z: 24,
    heading: Math.PI,
    speed: 0,
    walkPhase: 0,
    onFoot: true,
    invulnerable: 0,
    car: null,
    punchCooldown: 0,
  };
  group.position.set(state.x, 0, state.z);

  function update(dt, input, cameraYaw) {
    if (!state.onFoot) {
      group.visible = false;
      return;
    }
    group.visible = true;
    if (state.invulnerable > 0) state.invulnerable = Math.max(0, state.invulnerable - dt);
    if (state.punchCooldown > 0) state.punchCooldown -= dt;
    // Movement is relative to the camera: W walks away from the camera.
    let mx = 0;
    let mz = 0;
    if (input.forward) mz -= 1;
    if (input.back) mz += 1;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    const len = Math.hypot(mx, mz);
    const sprint = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    const targetSpeed = len > 0 ? sprint : 0;
    state.speed += (targetSpeed - state.speed) * Math.min(1, PLAYER.accel * dt / Math.max(1, targetSpeed));
    if (len > 0) {
      const sin = Math.sin(cameraYaw);
      const cos = Math.cos(cameraYaw);
      const wx = (mx * cos - mz * sin) / len;
      const wz = (mx * sin + mz * cos) / len;
      const nx = state.x + wx * state.speed * dt;
      const nz = state.z + wz * state.speed * dt;
      const clamped = city.clampToCity(nx, nz, 2);
      const fixed = resolveBuildingCollision(clamped.x, clamped.z, PLAYER.radius, city.colliders);
      state.x = fixed.x;
      state.z = fixed.z;
      state.heading = Math.atan2(wx, wz);
      state.walkPhase += dt * state.speed * 1.6;
    }
    group.position.set(state.x, 0, state.z);
    group.rotation.y = state.heading;
    const swing = len > 0 ? Math.sin(state.walkPhase) * 0.55 : 0;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    armL.rotation.x = -swing * 0.7;
    armR.rotation.x = swing * 0.7;
    // Blink while invulnerable after being hit.
    group.visible = state.invulnerable === 0 || Math.floor(state.invulnerable * 10) % 2 === 1;
  }

  function teleport(x, z, heading) {
    state.x = x;
    state.z = z;
    if (heading !== undefined) state.heading = heading;
    group.position.set(x, 0, z);
    group.rotation.y = state.heading;
  }

  return {
    state,
    mesh: group,
    update,
    teleport,
    position() {
      return { x: state.x, z: state.z };
    },
  };
}
