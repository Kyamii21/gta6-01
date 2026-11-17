// Cars: the player's ride, traffic that follows the road grid, and parked cars
// waiting to be borrowed. One mesh factory builds them all (body, cabin, wheels,
// headlights); traffic drives the grid lanes and turns at intersections, the
// player's car uses simple arcade physics with building and car collisions.
import * as THREE from 'three';
import { CAR, CITY } from './config.js';
import { resolveBuildingCollision } from './player.js';

const CAR_COLORS = [
  0xc23b2e, 0x2e6bc2, 0xd8a13c, 0x3a9e5f, 0x8a8f96, 0x22252b, 0xe8e4da, 0x7a4a9e,
  0x4a9e9e, 0xb85c2e,
];

const bodyGeo = new THREE.BoxGeometry(2, 0.62, 4.4);
const cabinGeo = new THREE.BoxGeometry(1.7, 0.55, 2.2);
const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
const lightGeo = new THREE.BoxGeometry(0.34, 0.16, 0.06);
const barGeo = new THREE.BoxGeometry(1.3, 0.14, 0.5);

function makeCarMesh(color, kind) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    cabinGeo,
    new THREE.MeshLambertMaterial({ color: kind === 'police' ? 0xf2f2f2 : 0x1c2733 }),
  );
  cabin.position.set(0, 1.1, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const hx of [-0.6, 0.6]) {
    const head = new THREE.Mesh(lightGeo, headMat);
    head.position.set(hx, 0.62, 2.21);
    group.add(head);
  }
  if (kind === 'police') {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0xff2e2e }));
    red.position.x = -0.34;
    const blue = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x2e6bff }));
    blue.position.x = 0.34;
    bar.add(red);
    bar.add(blue);
    bar.position.y = 1.48;
    bar.scale.set(0.5, 1, 1);
    group.add(bar);
    group.userData.lightBar = { red, blue };
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.18, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffd23c }),
    );
    sign.position.set(0, 1.5, -0.2);
    group.add(sign);
  }
  group.userData.wheels = wheels;
  return group;
}

function carForward(heading) {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

export function createVehicles(scene, city, rng) {
  const cars = [];
  let playerCar = null;

  function addCar(kind, color, x, z, heading) {
    const mesh = makeCarMesh(color, kind);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const car = {
      kind,
      color,
      mesh,
      x,
      z,
      heading,
      speed: 0,
      steerAngle: 0,
      occupied: false,
      driver: null,
      // Traffic state: which road axis it follows and which way.
      axis: 'x',
      line: 0,
      dir: 1,
      cruise: rng.range(CAR.trafficSpeed * 0.7, CAR.trafficMax),
      turnCooldown: 0,
      brakeLight: 0,
      health: 100,
      ramCooldown: 0,
    };
    cars.push(car);
    return car;
  }

  function spawnTraffic(count) {
    for (let i = 0; i < count; i += 1) {
      const horizontal = rng.chance(0.5);
      const line = rng.pick(CITY.roadLines);
      const along = rng.range(-CITY.half + 30, CITY.half - 30);
      const dir = rng.chance(0.5) ? 1 : -1;
      const lane = dir > 0 ? 4 : -4;
      const x = horizontal ? along : line + lane;
      const z = horizontal ? line + lane : along;
      const heading = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      const car = addCar('traffic', rng.pick(CAR_COLORS), x, z, heading);
      car.axis = horizontal ? 'x' : 'z';
      car.line = line;
      car.dir = dir;
      car.speed = car.cruise;
    }
  }

  function spawnParked(count) {
    for (let i = 0; i < count; i += 1) {
      const horizontal = rng.chance(0.5);
      const line = rng.pick(CITY.roadLines);
      const along = rng.range(-CITY.half + 40, CITY.half - 40);
      const side = rng.chance(0.5) ? 1 : -1;
      const x = horizontal ? along : line + side * 6.5;
      const z = horizontal ? line + side * 6.5 : along;
      const heading = horizontal ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
      const car = addCar('parked', rng.pick(CAR_COLORS), x, z, heading);
      car.axis = horizontal ? 'x' : 'z';
      car.line = line;
      car.dir = side > 0 ? 1 : -1;
    }
  }

  function nearestCar(x, z, maxDist, kinds) {
    let best = null;
    let bestDist = maxDist;
    for (const car of cars) {
      if (kinds && !kinds.includes(car.kind)) continue;
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestDist) {
        bestDist = d;
        best = car;
      }
    }
    return best;
  }

  /** The player steps into `car`: parked cars are free, occupied ones are a theft. */
  function enterCar(car, player) {
    if (playerCar) return null;
    const stolen = car.kind === 'traffic' || car.kind === 'taxi';
    if (car.driver) car.driver = null;
    car.kind = 'player';
    car.occupied = true;
    playerCar = car;
    player.state.onFoot = false;
    player.state.car = car;
    return { stolen };
  }

  function exitCar(player) {
    if (!playerCar) return;
    const f = carForward(playerCar.heading);
    player.state.onFoot = true;
    player.state.car = null;
    player.teleport(playerCar.x - f.x * 3.2, playerCar.z - f.z * 3.2, playerCar.heading);
    playerCar.kind = 'parked';
    playerCar.occupied = false;
    playerCar.speed = 0;
    playerCar = null;
  }

  function carAhead(car, dist) {
    for (const other of cars) {
      if (other === car || other.kind === 'player') continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const f = carForward(car.heading);
      const along = dx * f.x + dz * f.z;
      const side = Math.abs(dx * f.z - dz * f.x);
      if (along > 0 && along < dist && side < 3) return other;
    }
    return null;
  }

  function updateTrafficCar(car, dt) {
    if (car.turnCooldown > 0) car.turnCooldown -= dt;
    // Slow for the car ahead, stop for the player's car in the way.
    const ahead = carAhead(car, 13);
    const targetSpeed = ahead ? Math.max(0, ahead.speed - 2) : car.cruise;
    car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 2.5);
    const f = carForward(car.heading);
    let nx = car.x + f.x * car.speed * dt;
    let nz = car.z + f.z * car.speed * dt;
    // At an intersection, sometimes turn onto the crossing road.
    const along = car.axis === 'x' ? nx : nz;
    for (const line of CITY.roadLines) {
      if (Math.abs(along - line) < 1.2 && car.turnCooldown <= 0 && rng.chance(0.35)) {
        car.turnCooldown = 2.5;
        const turnLeft = rng.chance(0.5);
        const newAxis = car.axis === 'x' ? 'z' : 'x';
        const newDir = turnLeft ? -car.dir : car.dir;
        car.axis = newAxis;
        car.line = line;
        car.dir = newDir;
        const lane = newDir > 0 ? 4 : -4;
        if (newAxis === 'x') {
          car.z = line + lane;
          car.heading = newDir > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          car.x = line + lane;
          car.heading = newDir > 0 ? 0 : Math.PI;
        }
        nx = car.x;
        nz = car.z;
        break;
      }
    }
    // At the city edge, turn around at the next intersection instead of leaving.
    const edge = CITY.half - 14;
    if (car.axis === 'x' && (nx > edge || nx < -edge)) {
      car.dir *= -1;
      car.heading += Math.PI;
      car.z = car.line + (car.dir > 0 ? 4 : -4);
      nx = Math.max(-edge, Math.min(edge, nx));
    } else if (car.axis === 'z' && (nz > edge || nz < -edge)) {
      car.dir *= -1;
      car.heading += Math.PI;
      car.x = car.line + (car.dir > 0 ? 4 : -4);
      nz = Math.max(-edge, Math.min(edge, nz));
    }
    // Keep on its lane.
    if (car.axis === 'x') nz = car.line + (car.dir > 0 ? 4 : -4);
    else nx = car.line + (car.dir > 0 ? 4 : -4);
    car.x = nx;
    car.z = nz;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    const spin = (car.speed * dt) / 0.38;
    for (const wheel of car.mesh.userData.wheels) wheel.rotation.x += spin;
  }

  function updatePlayerCar(car, dt, input) {
    const f = carForward(car.heading);
    if (input.forward) car.speed += CAR.accel * dt;
    else if (input.back) car.speed -= (car.speed > 0.5 ? CAR.brake : CAR.reverseAccel) * dt;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
    if (input.brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), CAR.brake * dt);
    car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
    const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const steerTarget = steerInput * CAR.steer * (car.speed >= 0 ? 1 : -1);
    car.steerAngle += (steerTarget - car.steerAngle) * Math.min(1, dt * 8);
    car.heading += (car.steerAngle * (car.speed / CAR.maxSpeed) * 2.4) * dt;
    const nf = carForward(car.heading);
    let nx = car.x + nf.x * car.speed * dt;
    let nz = car.z + nf.z * car.speed * dt;
    const clamped = city.clampToCity(nx, nz, 3);
    nx = clamped.x;
    nz = clamped.z;
    const fixed = resolveBuildingCollision(nx, nz, CAR.radius, city.colliders);
    if (fixed.hit && Math.abs(car.speed) > 6) {
      car.speed *= 0.45;
    }
    car.x = fixed.x;
    car.z = fixed.z;
    // Bump other cars out of the way (and count it as a ram).
    for (const other of cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && d < CAR.radius * 2) {
        const push = (CAR.radius * 2 - d) / 2;
        const ux = dx / d;
        const uz = dz / d;
        other.x += ux * push;
        other.z += uz * push;
        other.mesh.position.set(other.x, 0, other.z);
        if (other.kind !== 'player' && Math.abs(car.speed) > 8 && other.ramCooldown <= 0) {
          other.ramCooldown = 1;
          other.health -= 25;
        }
      }
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    const spin = (car.speed * dt) / 0.38;
    for (const wheel of car.mesh.userData.wheels) wheel.rotation.x += spin;
    const frontWheels = car.mesh.userData.wheels;
    frontWheels[0].rotation.y = car.steerAngle * 0.35;
    frontWheels[1].rotation.y = car.steerAngle * 0.35;
    return { speed: car.speed, crashed: fixed.hit };
  }

  function update(dt, input, player) {
    for (const car of cars) {
      if (car.ramCooldown > 0) car.ramCooldown -= dt;
      if (car.kind === 'player') {
        const result = updatePlayerCar(car, dt, input);
        car._crashed = result.crashed;
      } else if (car.kind === 'traffic' || car.kind === 'taxi') {
        updateTrafficCar(car, dt);
      }
    }
  }

  return {
    cars,
    spawnTraffic,
    spawnParked,
    addCar,
    nearestCar,
    enterCar,
    exitCar,
    update,
    get playerCar() {
      return playerCar;
    },
    carForward,
  };
}
