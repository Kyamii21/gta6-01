// The harbor police: a wanted level that rises with crimes and fades when the
// player lies low, police cruisers that chase and ram, and foot officers who
// arrest a slow player on foot. Getting busted or wasted costs cash and time.
import * as THREE from 'three';
import { CAR, CITY, WANTED } from './config.js';
import { resolveBuildingCollision } from './player.js';

const COP_COLORS = [0x1a1a2e, 0x2a2a3a];

function makeCopMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.72, 0.36),
    new THREE.MeshLambertMaterial({ color: 0x1a2a4a }),
  );
  body.position.y = 1.12;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.34, 0.34),
    new THREE.MeshLambertMaterial({ color: 0xc98d64 }),
  );
  head.position.y = 1.66;
  head.castShadow = true;
  group.add(head);
  const hat = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.1, 0.4),
    new THREE.MeshLambertMaterial({ color: 0x0e1a33 }),
  );
  hat.position.y = 1.86;
  group.add(hat);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x141a28 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.26), legMat);
  legL.geometry.translate(0, -0.36, 0);
  legL.position.set(-0.16, 0.74, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legR);
  return { group, legL, legR };
}

export function createPolice(scene, city, vehicles, rng) {
  const state = {
    stars: 0,
    decayTimer: 0,
    crimeCooldown: 0,
    arrestMeter: 0,
    nearestCopDist: Infinity,
    flashPhase: 0,
  };
  const cops = [];
  const policeCars = [];
  let spawnTimer = 0;

  function setStars(n, silent) {
    const next = Math.max(0, Math.min(WANTED.maxStars, n));
    const changed = next !== state.stars;
    state.stars = next;
    state.decayTimer = 0;
    return changed && !silent ? next : 0;
  }

  function addCrime(stars) {
    if (state.crimeCooldown > 0) return false;
    state.crimeCooldown = 8;
    setStars(state.stars + stars);
    return true;
  }

  function spawnPoliceCar(nearX, nearZ) {
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(55, 80);
    const px = nearX + Math.cos(angle) * dist;
    const pz = nearZ + Math.sin(angle) * dist;
    const road = city.nearestRoadPoint(px, pz);
    const car = vehicles.addCar('police', rng.pick(COP_COLORS), road.x, road.z, rng.range(0, Math.PI * 2));
    car.cruise = CAR.policeSpeed;
    car.health = 200;
    policeCars.push(car);
    return car;
  }

  function spawnCop(nearX, nearZ) {
    const angle = rng.range(0, Math.PI * 2);
    const x = nearX + Math.cos(angle) * rng.range(18, 30);
    const z = nearZ + Math.sin(angle) * rng.range(18, 30);
    const { group, legL, legR } = makeCopMesh();
    group.position.set(x, 0, z);
    scene.add(group);
    const cop = { mesh: group, legL, legR, x, z, heading: 0, phase: 0, punchCooldown: 0 };
    cops.push(cop);
    return cop;
  }

  function removeCop(cop) {
    scene.remove(cop.mesh);
    const i = cops.indexOf(cop);
    if (i >= 0) cops.splice(i, 1);
  }

  function removePoliceCar(car) {
    scene.remove(car.mesh);
    const i = policeCars.indexOf(car);
    if (i >= 0) policeCars.splice(i, 1);
    const j = vehicles.cars.indexOf(car);
    if (j >= 0) vehicles.cars.splice(j, 1);
  }

  /** Police cruisers steer toward the player and ram; returns crash events. */
  function updatePoliceCars(dt, playerPos, playerCar, events) {
    const wantedCount = state.stars <= 1 ? 1 : state.stars <= 3 ? state.stars : 5;
    spawnTimer -= dt;
    if (policeCars.length < wantedCount && spawnTimer <= 0) {
      spawnTimer = 2.5;
      spawnPoliceCar(playerPos.x, playerPos.z);
    }
    state.flashPhase += dt * 7;
    const flash = Math.floor(state.flashPhase) % 2 === 0;
    let nearest = Infinity;
    for (const car of policeCars) {
      const bar = car.mesh.userData.lightBar;
      if (bar) {
        bar.red.material.color.setHex(flash ? 0xff2e2e : 0x551111);
        bar.blue.material.color.setHex(flash ? 0x111155 : 0x2e6bff);
      }
      const dx = playerPos.x - car.x;
      const dz = playerPos.z - car.z;
      const dist = Math.hypot(dx, dz);
      nearest = Math.min(nearest, dist);
      const targetHeading = Math.atan2(dx, dz);
      let diff = targetHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 2.2));
      car.heading += steer * 2.1 * dt * Math.min(1, 0.4 + car.speed / 12);
      const targetSpeed = Math.min(CAR.policeSpeed, 12 + dist * 0.35);
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.6);
      const f = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
      let nx = car.x + f.x * car.speed * dt;
      let nz = car.z + f.z * car.speed * dt;
      const clamped = city.clampToCity(nx, nz, 3);
      const fixed = resolveBuildingCollision(clamped.x, clamped.z, 2.1, city.colliders);
      if (fixed.hit) car.speed *= 0.6;
      car.x = fixed.x;
      car.z = fixed.z;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      const spin = (car.speed * dt) / 0.38;
      for (const wheel of car.mesh.userData.wheels) wheel.rotation.x += spin;
      // Ram the player's car.
      if (playerCar && dist < 4.6 && car.speed > 6) {
        events.push({ type: 'rammed', by: car });
        car.speed *= 0.5;
      }
      // A cruiser that fell far behind respawns closer.
      if (dist > 190) {
        const angle = rng.range(0, Math.PI * 2);
        const road = city.nearestRoadPoint(playerPos.x + Math.cos(angle) * 60, playerPos.z + Math.sin(angle) * 60);
        car.x = road.x;
        car.z = road.z;
        car.speed = 10;
      }
    }
    state.nearestCopDist = nearest;
    return nearest;
  }

  function updateCops(dt, player, events) {
    if (state.stars === 0) {
      for (const cop of [...cops]) removeCop(cop);
      return;
    }
    if (player.state.onFoot && cops.length < Math.min(3, state.stars) && rng.chance(dt * 0.5)) {
      spawnCop(player.state.x, player.state.z);
    }
    let arresting = false;
    for (const cop of [...cops]) {
      const dx = player.state.x - cop.x;
      const dz = player.state.z - cop.z;
      const dist = Math.hypot(dx, dz);
      state.nearestCopDist = Math.min(state.nearestCopDist, dist);
      if (!player.state.onFoot || dist > 120) {
        removeCop(cop);
        continue;
      }
      cop.heading = Math.atan2(dx, dz);
      const speed = 6.8;
      let nx = cop.x + Math.sin(cop.heading) * speed * dt;
      let nz = cop.z + Math.cos(cop.heading) * speed * dt;
      const fixed = resolveBuildingCollision(nx, nz, 0.55, city.colliders);
      cop.x = fixed.x;
      cop.z = fixed.z;
      cop.phase += dt * speed * 1.8;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
      cop.legL.rotation.x = Math.sin(cop.phase) * 0.6;
      cop.legR.rotation.x = -Math.sin(cop.phase) * 0.6;
      if (dist < 1.8) {
        if (cop.punchCooldown <= 0) {
          cop.punchCooldown = 1.1;
          events.push({ type: 'copPunch', damage: 6 });
        }
        if (player.state.speed < 2.5) arresting = true;
      }
      if (cop.punchCooldown > 0) cop.punchCooldown -= dt;
    }
    if (arresting) {
      state.arrestMeter += dt;
      if (state.arrestMeter >= WANTED.arrestSeconds) {
        state.arrestMeter = 0;
        events.push({ type: 'busted' });
      }
    } else {
      state.arrestMeter = Math.max(0, state.arrestMeter - dt * 2);
    }
  }

  function update(dt, player, playerCar, events) {
    if (state.crimeCooldown > 0) state.crimeCooldown -= dt;
    state.nearestCopDist = Infinity;
    const playerPos = playerCar
      ? { x: playerCar.x, z: playerCar.z }
      : { x: player.state.x, z: player.state.z };
    if (state.stars > 0) {
      updatePoliceCars(dt, playerPos, playerCar, events);
      updateCops(dt, player, events);
      // Wanted fades when the heat is off: no crime lately, no cop close.
      if (state.nearestCopDist > 70) {
        state.decayTimer += dt;
        if (state.decayTimer >= WANTED.decaySeconds) {
          state.decayTimer = 0;
          setStars(state.stars - 1, true);
        }
      } else {
        state.decayTimer = 0;
      }
    } else {
      // Clear leftovers when the heat is gone.
      for (const car of [...policeCars]) removePoliceCar(car);
      for (const cop of [...cops]) removeCop(cop);
    }
  }

  function clearAll() {
    setStars(0, true);
    for (const car of [...policeCars]) removePoliceCar(car);
    for (const cop of [...cops]) removeCop(cop);
  }

  return {
    state,
    cops,
    policeCars,
    setStars,
    addCrime,
    spawnPoliceCar,
    update,
    clearAll,
  };
}
