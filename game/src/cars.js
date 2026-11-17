// Cars: a box-built car factory, arcade driving for the player, and the
// traffic AI that keeps the streets alive.
import * as THREE from 'three';
import { clamp, angleLerp, angleDiff, dist2d } from './rng.js';
import { resolveCircleCollision, loopWaypoints } from './city.js';

const CAR_COLORS = [0xc0392b, 0x2e86c1, 0x1e8449, 0xe67e22, 0x8e44ad, 0x95a5a6, 0x2c3e50, 0xf1c40f, 0x16a085, 0xd35400];

const SPECS = {
  sedan: { length: 4.4, width: 1.9, height: 0.75, topSpeed: 34, accel: 16, grip: 1 },
  sport: { length: 4.2, width: 1.9, height: 0.6, topSpeed: 46, accel: 22, grip: 1.15 },
  taxi: { length: 4.4, width: 1.9, height: 0.75, topSpeed: 32, accel: 15, grip: 1 },
  truck: { length: 6.4, width: 2.3, height: 1.4, topSpeed: 26, accel: 11, grip: 0.9 },
  police: { length: 4.5, width: 1.95, height: 0.75, topSpeed: 42, accel: 21, grip: 1.1 },
};

export function carColorHex(color) {
  return '#' + color.toString(16).padStart(6, '0');
}

export function createCar(scene, opts) {
  const model = opts.model || 'sedan';
  const spec = SPECS[model];
  const color = opts.color ?? CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  const group = new THREE.Group();
  group.name = opts.name || 'car';

  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.width, spec.height, spec.length), bodyMat);
  body.position.y = 0.55 + spec.height / 2 - 0.35;
  body.castShadow = true;
  group.add(body);

  const glassMat = new THREE.MeshLambertMaterial({ color: 0x18242f });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.width - 0.3, 0.55, spec.length * 0.45), glassMat);
  cabin.position.set(0, body.position.y + spec.height / 2 + 0.22, -spec.length * 0.05);
  cabin.castShadow = true;
  group.add(cabin);

  if (model === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.4), new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    sign.position.set(0, cabin.position.y + 0.4, 0);
    group.add(sign);
  }
  if (model === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x2233ff }));
    bar.position.set(0, cabin.position.y + 0.38, 0);
    bar.name = 'lightbar';
    group.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar2.position.set(0.55, cabin.position.y + 0.38, 0);
    bar2.name = 'lightbar-red';
    group.add(bar2);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(spec.width + 0.02, 0.3, spec.length * 0.7), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.set(0, 0.75, 0);
    group.add(stripe);
  }
  if (model === 'truck') {
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(spec.width - 0.2, 1.5, spec.length * 0.5), new THREE.MeshLambertMaterial({ color: 0x7a6a55 }));
    cargo.position.set(0, 1.5, -spec.length * 0.2);
    cargo.castShadow = true;
    group.add(cargo);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  for (const [wx, wz] of [[-spec.width / 2, spec.length * 0.32], [spec.width / 2, spec.length * 0.32], [-spec.width / 2, -spec.length * 0.32], [spec.width / 2, -spec.length * 0.32]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    wheels.push(wheel);
  }

  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const hx of [-spec.width / 2 + 0.35, spec.width / 2 - 0.35]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.1), headMat);
    head.position.set(hx, 0.75, spec.length / 2 + 0.02);
    group.add(head);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  for (const hx of [-spec.width / 2 + 0.35, spec.width / 2 - 0.35]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.1), tailMat);
    tail.position.set(hx, 0.75, -spec.length / 2 - 0.02);
    group.add(tail);
  }

  group.position.set(opts.x || 0, 0, opts.z || 0);
  group.rotation.y = opts.heading || 0;
  scene.add(group);

  return {
    group, model, spec, color, wheels,
    x: opts.x || 0, z: opts.z || 0, heading: opts.heading || 0,
    speed: 0, steer: 0, drift: 0,
    isPlayer: false, isPolice: model === 'police',
    // Traffic state.
    loop: null, waypoint: 0, cruise: 11,
    stopped: 0,
  };
}

export function syncCar(car) {
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
  const spin = car.speed * 0.12;
  for (const wheel of car.wheels) wheel.rotation.x += spin;
}

// Arcade driving: throttle, brake/reverse, steering that tightens at low
// speed, and a handbrake that breaks traction into a drift.
export function drivePlayerCar(car, input, dt, colliders, onCrash) {
  const spec = car.spec;
  const forward = input.forward ? 1 : 0;
  const back = input.back ? 1 : 0;
  if (forward) car.speed += spec.accel * dt;
  if (back) car.speed -= (car.speed > 0.5 ? spec.accel * 1.4 : spec.accel * 0.6) * dt;
  if (!forward && !back) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  car.speed = clamp(car.speed, -12, spec.topSpeed);

  const targetSteer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  car.steer = angleLerp(car.steer, targetSteer, Math.min(1, dt * 8));
  const steerAuthority = clamp(Math.abs(car.speed) / 8, 0, 1) * (car.speed >= 0 ? 1 : -1);
  let turnRate = car.steer * 1.9 * steerAuthority * spec.grip;
  if (input.handbrake && Math.abs(car.speed) > 6) {
    turnRate *= 1.7;
    car.speed -= Math.sign(car.speed) * 4 * dt;
    car.drift = clamp(car.drift + dt * 3, 0, 1);
  } else {
    car.drift = Math.max(0, car.drift - dt * 2.5);
  }
  car.heading += turnRate * dt;

  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const hit = resolveCircleCollision(nx, nz, spec.length * 0.42, colliders);
  const crashed = hit.x !== nx || hit.z !== nz;
  if (crashed && Math.abs(car.speed) > 8 && onCrash) onCrash(Math.abs(car.speed));
  if (crashed) car.speed *= 0.45;
  car.x = clamp(hit.x, -235, 235);
  car.z = clamp(hit.z, -235, 700);
  syncCar(car);
}

// Traffic: follow a rectangular loop around a block, slowing for the car
// ahead and for tight turns.
export function makeTrafficCar(scene, rng, blockCx, blockCz) {
  const models = ['sedan', 'sedan', 'taxi', 'truck', 'sport'];
  const car = createCar(scene, {
    model: rng.pick(models),
    x: blockCx, z: blockCz, heading: rng.next() * Math.PI * 2,
  });
  car.loop = loopWaypoints(blockCx, blockCz);
  // Start on the nearest waypoint.
  let best = 0;
  let bestD = Infinity;
  car.loop.forEach((w, i) => {
    const d = dist2d(car.x, car.z, w.x, w.z);
    if (d < bestD) { bestD = d; best = i; }
  });
  car.waypoint = best;
  car.cruise = rng.range(9, 14);
  return car;
}

export function updateTrafficCar(car, dt, colliders, others) {
  if (car.stopped > 0) {
    car.stopped -= dt;
    car.speed = Math.max(0, car.speed - 20 * dt);
    syncCar(car);
    return;
  }
  const target = car.loop[car.waypoint];
  const desired = Math.atan2(target.x - car.x, target.z - car.z);
  const diff = angleDiff(car.heading, desired);
  car.heading += clamp(diff, -1.6 * dt, 1.6 * dt);
  // Slow down for the car ahead.
  let blocked = false;
  for (const other of others) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const ahead = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
    const side = Math.abs(dx * Math.cos(car.heading) - dz * Math.sin(car.heading));
    if (ahead > 0 && ahead < 9 && side < 2.4) { blocked = true; break; }
  }
  const want = blocked ? 0 : car.cruise;
  car.speed += clamp(want - car.speed, -18 * dt, 9 * dt);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const hit = resolveCircleCollision(nx, nz, 2.2, colliders);
  if (hit.x !== nx || hit.z !== nz) {
    // Bumped a building corner: skip to the next waypoint and turn around.
    car.waypoint = (car.waypoint + 1) % car.loop.length;
    car.heading += Math.PI / 2;
    car.speed *= 0.4;
  }
  car.x = hit.x;
  car.z = hit.z;
  if (dist2d(car.x, car.z, target.x, target.z) < 6) {
    car.waypoint = (car.waypoint + 1) % car.loop.length;
  }
  syncCar(car);
}
