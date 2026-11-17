// The law: a 0-to-5-star wanted level, patrol cars that hunt the player,
// and the BUSTED clock that ends a run on foot.
import * as THREE from 'three';
import { clamp, dist2d } from './rng.js';
import { createCar, syncCar } from './cars.js';
import { resolveCircleCollision } from './city.js';

export function createPoliceSystem(scene, rng) {
  return {
    scene, rng,
    wanted: 0,
    wantedHeat: 0, // 0..1: how "hot" the chase is; decays when unseen
    policeCars: [],
    bustTimer: 0,
    calmTimer: 0,
    flashPhase: 0,
  };
}

export function addWanted(sys, stars, reason) {
  const before = sys.wanted;
  sys.wanted = clamp(sys.wanted + stars, 0, 5);
  sys.wantedHeat = 1;
  sys.calmTimer = 0;
  if (sys.wanted > before) return sys.wanted;
  return sys.wanted;
}

export function setWanted(sys, stars) {
  sys.wanted = clamp(stars, 0, 5);
  sys.wantedHeat = stars > 0 ? 1 : 0;
  sys.calmTimer = 0;
}

function spawnPoliceCar(sys, nearX, nearZ) {
  // Appear on a road a little way from the player, never on top of them.
  const angle = sys.rng.next() * Math.PI * 2;
  const dist = sys.rng.range(55, 90);
  const x = clamp(nearX + Math.sin(angle) * dist, -215, 215);
  const z = clamp(nearZ + Math.cos(angle) * dist, -215, 285);
  const car = createCar(sys.scene, { model: 'police', x, z, heading: Math.atan2(nearX - x, nearZ - z), name: 'police' });
  car.isPolice = true;
  car.cruise = 30;
  sys.policeCars.push(car);
  return car;
}

function removePoliceCar(sys, car) {
  sys.scene.remove(car.group);
  sys.policeCars.splice(sys.policeCars.indexOf(car), 1);
}

// dt step. `player` is {x, z, inCar, speed, health}. Callbacks: onRam(strength),
// onCooled(stars). Touching the player on foot fills sys.bustTimer directly.
// Returns nothing; read sys.wanted and sys.bustTimer.
export function updatePolice(sys, dt, player, colliders, callbacks) {
  const wantCount = sys.wanted === 0 ? 0 : Math.min(1 + sys.wanted, 6);
  while (sys.policeCars.length < wantCount) spawnPoliceCar(sys, player.x, player.z);
  while (sys.policeCars.length > wantCount) removePoliceCar(sys, sys.policeCars[sys.policeCars.length - 1]);

  sys.flashPhase += dt * 8;
  const flash = Math.sin(sys.flashPhase) > 0;
  let nearest = Infinity;
  let anyNear = false;

  for (const car of sys.policeCars) {
    const d = dist2d(car.x, car.z, player.x, player.z);
    nearest = Math.min(nearest, d);
    if (d < 26) anyNear = true;
    // Chase: steer at the player, faster with more stars.
    const desired = Math.atan2(player.x - car.x, player.z - car.z);
    let diff = desired - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.heading += clamp(diff, -2.4 * dt, 2.4 * dt);
    const top = 24 + sys.wanted * 3.2;
    car.speed += clamp(top - car.speed, -22 * dt, 13 * dt);
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const hit = resolveCircleCollision(nx, nz, 2.2, colliders);
    if (hit.x !== nx || hit.z !== nz) {
      car.heading += Math.PI * 0.5;
      car.speed *= 0.5;
    }
    car.x = hit.x;
    car.z = hit.z;
    syncCar(car);
    // Flashing light bar.
    const bar = car.group.getObjectByName('lightbar');
    const barRed = car.group.getObjectByName('lightbar-red');
    if (bar) bar.material.color.setHex(flash ? 0x3355ff : 0x112266);
    if (barRed) barRed.material.color.setHex(flash ? 0x661111 : 0xff2222);

    // Ramming the player's car damages it; touching the player on foot busts.
    // A cop that reaches the player on foot brakes hard and pins them there,
    // so the bust clock can actually run instead of driving straight through.
    if (d < 3.4) {
      if (player.inCar) {
        if (car.speed > 6 && callbacks.onRam) callbacks.onRam(car.speed);
        car.speed *= 0.4;
        car.heading += 0.6;
      } else {
        car.speed *= 0.7;
        sys.bustTimer += dt;
      }
    }
    // A cop that falls far behind reappears closer to keep the chase hot.
    if (d > 190) {
      const angle = sys.rng.next() * Math.PI * 2;
      car.x = clamp(player.x + Math.sin(angle) * 70, -215, 215);
      car.z = clamp(player.z + Math.cos(angle) * 70, -215, 285);
      car.heading = Math.atan2(player.x - car.x, player.z - car.z);
    }
  }

  if (nearest > 4 || player.inCar) sys.bustTimer = Math.max(0, sys.bustTimer - dt * 2);

  // Cooling off: stay out of sight and the heat fades, then stars drop.
  if (sys.wanted > 0) {
    if (!anyNear && nearest > 60) {
      sys.calmTimer += dt;
      sys.wantedHeat = Math.max(0, sys.wantedHeat - dt * 0.05);
      if (sys.calmTimer > 14) {
        sys.wanted -= 1;
        sys.calmTimer = 0;
        sys.wantedHeat = sys.wanted > 0 ? 0.6 : 0;
        if (callbacks.onCooled) callbacks.onCooled(sys.wanted);
      }
    } else {
      sys.calmTimer = 0;
      sys.wantedHeat = Math.min(1, sys.wantedHeat + dt * 0.2);
    }
  }
  return nearest;
}

export function clearPolice(sys) {
  for (const car of [...sys.policeCars]) removePoliceCar(sys, car);
  sys.wanted = 0;
  sys.wantedHeat = 0;
  sys.bustTimer = 0;
  sys.calmTimer = 0;
}
