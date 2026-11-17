// Street life and street fights: pedestrians who walk the sidewalks and flee from
// trouble, a punch for close work, and a pistol with hitscan shots, tracers and a
// muzzle flash. Hurting people is a crime — the police module hears about it.
import * as THREE from 'three';
import { CITY, COMBAT } from './config.js';
import { resolveBuildingCollision } from './player.js';

const SHIRT_COLORS = [0xd84a4a, 0x4a7ad8, 0xe8c13c, 0x7a4ad8, 0x3aa67a, 0xd87a3c, 0xe8e8e8, 0x333a44];
const SKIN_COLORS = [0xc98d64, 0x8a5a3b, 0xe8b98a, 0x6e4530];

function makePedMesh(shirt, skin) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.68, 0.34),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  body.position.y = 1.1;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.32, 0.32),
    new THREE.MeshLambertMaterial({ color: skin }),
  );
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2a2f3a });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.24), legMat);
  legL.geometry.translate(0, -0.35, 0);
  legL.position.set(-0.15, 0.72, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.15;
  group.add(legR);
  const armMat = new THREE.MeshLambertMaterial({ color: shirt });
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.58, 0.2), armMat);
  armL.geometry.translate(0, -0.29, 0);
  armL.position.set(-0.39, 1.4, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.39;
  group.add(armR);
  return { group, legL, legR, armL, armR };
}

export function createCombat(scene, city, rng) {
  const peds = [];
  const raycaster = new THREE.Raycaster();
  const tracers = [];
  const flash = new THREE.PointLight(0xffd9a0, 0, 18);
  scene.add(flash);

  function spawnPed() {
    const horizontal = rng.chance(0.5);
    const line = rng.pick(CITY.roadLines);
    const along = rng.range(-CITY.half + 20, CITY.half - 20);
    const side = rng.chance(0.5) ? 1 : -1;
    const x = horizontal ? along : line + side * (CITY.roadWidth / 2 + 3);
    const z = horizontal ? line + side * (CITY.roadWidth / 2 + 3) : along;
    const { group, legL, legR, armL, armR } = makePedMesh(rng.pick(SHIRT_COLORS), rng.pick(SKIN_COLORS));
    group.position.set(x, 0, z);
    scene.add(group);
    const ped = {
      mesh: group,
      legL,
      legR,
      armL,
      armR,
      x,
      z,
      heading: rng.range(0, Math.PI * 2),
      speed: rng.range(1.2, 2.2),
      axis: horizontal ? 'x' : 'z',
      line,
      dir: rng.chance(0.5) ? 1 : -1,
      health: 100,
      state: 'walk',
      downTimer: 0,
      phase: rng.range(0, 6),
      cash: rng.int(20, 60),
    };
    peds.push(ped);
    return ped;
  }

  function removePed(ped) {
    scene.remove(ped.mesh);
    const i = peds.indexOf(ped);
    if (i >= 0) peds.splice(i, 1);
  }

  function spawnPeds(count) {
    for (let i = 0; i < count; i += 1) spawnPed();
  }

  function nearestPed(x, z, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < bestDist) {
        bestDist = d;
        best = ped;
      }
    }
    return best;
  }

  /** Punch the nearest person in front of the player. Returns an event or null. */
  function tryPunch(player, cops) {
    if (player.state.punchCooldown > 0 || !player.state.onFoot) return null;
    player.state.punchCooldown = COMBAT.punchCooldown;
    const px = player.state.x;
    const pz = player.state.z;
    const fx = Math.sin(player.state.heading);
    const fz = Math.cos(player.state.heading);
    let target = null;
    let targetKind = 'ped';
    let bestScore = Infinity;
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      const dx = ped.x - px;
      const dz = ped.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > COMBAT.punchRange) continue;
      const dot = (dx * fx + dz * fz) / d;
      if (dot < 0.3) continue;
      if (d < bestScore) {
        bestScore = d;
        target = ped;
        targetKind = 'ped';
      }
    }
    for (const cop of cops) {
      const dx = cop.x - px;
      const dz = cop.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > COMBAT.punchRange) continue;
      const dot = (dx * fx + dz * fz) / d;
      if (dot < 0.3) continue;
      if (d < bestScore) {
        bestScore = d;
        target = cop;
        targetKind = 'cop';
      }
    }
    if (!target) return { type: 'punchMiss' };
    if (targetKind === 'ped') {
      target.health -= COMBAT.punchDamage;
      target.x += fx * 1.2;
      target.z += fz * 1.2;
      if (target.health <= 0) {
        target.state = 'down';
        target.downTimer = 5;
        target.mesh.rotation.x = -Math.PI / 2;
        target.mesh.position.y = 0.3;
        return { type: 'pedDown', ped: target, crime: true };
      }
      target.state = 'flee';
      return { type: 'pedHit', crime: true };
    }
    return { type: 'copHit', crime: true };
  }

  /** Fire the pistol from the camera through the screen centre. Returns an event. */
  function tryShoot(camera, ammo, cops) {
    if (ammo <= 0) return { type: 'gunEmpty' };
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    raycaster.far = COMBAT.gunRange;
    const targets = [];
    for (const ped of peds) {
      if (ped.state !== 'down') targets.push(ped.mesh);
    }
    for (const cop of cops) targets.push(cop.mesh);
    const hits = raycaster.intersectObjects(targets, true);
    let end = new THREE.Vector3();
    raycaster.ray.at(COMBAT.gunRange, end);
    let event = { type: 'gunMiss', end };
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      event = { type: 'gunMiss', end };
      // Walk up from the hit part to the person or cop it belongs to.
      const isPartOf = (mesh) => {
        let obj = hit.object;
        while (obj) {
          if (obj === mesh) return true;
          obj = obj.parent;
        }
        return false;
      };
      const ped = peds.find((p) => isPartOf(p.mesh));
      const cop = cops.find((c) => isPartOf(c.mesh));
      if (ped) {
        ped.health -= COMBAT.gunDamage;
        if (ped.health <= 0) {
          ped.state = 'down';
          ped.downTimer = 6;
          ped.mesh.rotation.x = -Math.PI / 2;
          ped.mesh.position.y = 0.3;
          event = { type: 'pedDown', ped, crime: true, end };
        } else {
          ped.state = 'flee';
          event = { type: 'pedHit', crime: true, end };
        }
      } else if (cop) {
        event = { type: 'copHit', crime: true, end };
      }
    }
    // Tracer line from the camera to the hit point.
    const start = camera.position.clone();
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    scene.add(line);
    tracers.push({ line, life: 0.09 });
    flash.position.copy(start).add(new THREE.Vector3(0, -0.4, 0));
    flash.intensity = 30;
    return event;
  }

  function update(dt, player, police) {
    // Tracer fade.
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      tracers[i].life -= dt;
      if (tracers[i].life <= 0) {
        scene.remove(tracers[i].line);
        tracers[i].line.geometry.dispose();
        tracers.splice(i, 1);
      }
    }
    flash.intensity = Math.max(0, flash.intensity - dt * 400);

    for (const ped of [...peds]) {
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          // Gets up and walks away, or is gone for good.
          if (ped.health <= -40 || rng.chance(0.4)) {
            removePed(ped);
            spawnPed();
          } else {
            ped.state = 'walk';
            ped.health = 100;
            ped.mesh.rotation.x = 0;
            ped.mesh.position.y = 0;
          }
        }
        continue;
      }
      let speed = ped.speed;
      if (ped.state === 'flee') {
        const dx = ped.x - player.state.x;
        const dz = ped.z - player.state.z;
        const d = Math.hypot(dx, dz);
        if (d < 24) {
          ped.heading = Math.atan2(dx, dz);
          speed = 5.5;
        } else {
          ped.state = 'walk';
        }
      } else {
        // Walk along the sidewalk; turn at intersections sometimes.
        const along = ped.axis === 'x' ? ped.x : ped.z;
        for (const line of CITY.roadLines) {
          if (Math.abs(along - line) < 1 && rng.chance(0.25)) {
            ped.axis = ped.axis === 'x' ? 'z' : 'x';
            ped.dir = rng.chance(0.5) ? 1 : -1;
            ped.line = line;
            break;
          }
        }
        ped.heading = ped.axis === 'x'
          ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
          : (ped.dir > 0 ? 0 : Math.PI);
        const edge = CITY.half - 14;
        if ((ped.axis === 'x' && (ped.x > edge || ped.x < -edge)) || (ped.axis === 'z' && (ped.z > edge || ped.z < -edge))) {
          ped.dir *= -1;
        }
      }
      const nx = ped.x + Math.sin(ped.heading) * speed * dt;
      const nz = ped.z + Math.cos(ped.heading) * speed * dt;
      const fixed = resolveBuildingCollision(nx, nz, 0.5, city.colliders);
      ped.x = fixed.x;
      ped.z = fixed.z;
      if (ped.axis === 'x') ped.z = ped.line + (ped.dir > 0 ? 1 : -1) * (CITY.roadWidth / 2 + 3);
      else ped.x = ped.line + (ped.dir > 0 ? 1 : -1) * (CITY.roadWidth / 2 + 3);
      ped.phase += dt * speed * 1.8;
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
      const swing = Math.sin(ped.phase) * 0.5;
      ped.legL.rotation.x = swing;
      ped.legR.rotation.x = -swing;
      ped.armL.rotation.x = -swing * 0.7;
      ped.armR.rotation.x = swing * 0.7;
    }
    // Keep the streets populated.
    if (peds.length < 14 && rng.chance(dt * 0.4)) spawnPed();
  }

  return {
    peds,
    spawnPeds,
    nearestPed,
    tryPunch,
    tryShoot,
    update,
  };
}
