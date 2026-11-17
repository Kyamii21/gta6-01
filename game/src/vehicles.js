// Solmar — cars: low-poly box-built vehicles, arcade driving physics for the
// player's car, and a traffic system that cruises the road grid.

class SolmarCar {
  constructor(scene, x, z, angle, color, isPolice) {
    this.scene = scene;
    this.isPolice = !!isPolice;
    this.color = color;
    this.speed = 0;
    this.steer = 0;
    this.angle = angle || 0;
    this.health = 100;
    this.smoking = false;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    this.group.rotation.y = this.angle;
    this._buildMesh();
    scene.add(this.group);
    this.radius = 2.1;
    this.length = 4.4;
  }

  _buildMesh() {
    const bodyMat = new THREE.MeshLambertMaterial({ color: this.color });
    const glassMat = new THREE.MeshPhongMaterial({ color: 0x1c2f42, shininess: 140, specular: 0x88bbdd });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x181818 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
    body.position.y = 0.55;
    body.castShadow = true;
    this.group.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.55, 2.1), glassMat);
    cabin.position.set(0, 1.08, -0.25);
    cabin.castShadow = true;
    this.group.add(cabin);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.3, 0.5), bodyMat);
    nose.position.set(0, 0.5, 2.2);
    this.group.add(nose);
    // Wheels.
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
    this.wheels = [];
    for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
      const w = new THREE.Mesh(wheelGeo, darkMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.36, wz);
      this.group.add(w);
      this.wheels.push(w);
    }
    // Headlights and taillights.
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    for (const hx of [-0.65, 0.65]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), headMat);
      h.position.set(hx, 0.62, 2.46);
      this.group.add(h);
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tailMat);
      t.position.set(hx, 0.62, -2.24);
      this.group.add(t);
    }
    if (this.isPolice) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
      bar.position.set(0, 1.5, -0.25);
      this.group.add(bar);
      this.lightBar = bar;
      const decal = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 1.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      decal.position.set(0, 0.62, 0.4);
      this.group.add(decal);
    }
  }

  get x() { return this.group.position.x; }
  get z() { return this.group.position.z; }
  setPos(x, z) { this.group.position.x = x; this.group.position.z = z; }

  forward() {
    return { x: Math.sin(this.angle), z: Math.cos(this.angle) };
  }

  // Arcade drive step. input: {throttle (-1..1), steer (-1..1), brake (bool)}.
  // Returns the distance travelled this step (for skid/effects).
  drive(input, dt, colliders, onCollide) {
    const maxFwd = 30, maxRev = 9, accel = 17, brakeForce = 30;
    if (input.throttle > 0) this.speed += accel * input.throttle * dt;
    else if (input.throttle < 0) {
      if (this.speed > 0.5) this.speed -= brakeForce * dt;
      else this.speed -= accel * 0.55 * dt;
    }
    if (input.brake) this.speed -= Math.sign(this.speed) * brakeForce * 0.8 * dt;
    // Drag + rolling resistance.
    this.speed -= this.speed * 0.55 * dt;
    if (Math.abs(this.speed) < 0.05 && input.throttle === 0) this.speed = 0;
    this.speed = SolmarUtil.clamp(this.speed, -maxRev, maxFwd);
    // Steering: sharper at low speed, and a handbrake drift.
    const steerTarget = input.steer * (input.brake ? 1.35 : 1);
    this.steer = SolmarUtil.lerp(this.steer, steerTarget, Math.min(1, dt * 7));
    const speedFactor = SolmarUtil.clamp(Math.abs(this.speed) / 9, 0, 1);
    const turnRate = this.steer * 1.9 * speedFactor * (input.brake ? 1.5 : 1) * (this.speed >= 0 ? 1 : -1);
    this.angle += turnRate * dt;
    const f = this.forward();
    const nx = this.x + f.x * this.speed * dt;
    const nz = this.z + f.z * this.speed * dt;
    const hit = collideCircle(nx, nz, this.radius, colliders);
    if (hit) {
      if (Math.abs(this.speed) > 7 && onCollide) onCollide(Math.abs(this.speed), hit);
      this.speed *= -0.25;
      this.setPos(this.x, this.z);
    } else {
      this.setPos(nx, nz);
    }
    // Keep the car inside the world.
    this.group.position.x = SolmarUtil.clamp(this.x, -305, 315);
    this.group.position.z = SolmarUtil.clamp(this.z, -285, 415);
    this.group.rotation.y = this.angle;
    for (const w of this.wheels) w.rotation.x += this.speed * dt * 2.2;
    if (this.isPolice && this.lightBar) {
      const t = performance.now() / 280;
      this.lightBar.material.color.setHex(Math.floor(t) % 2 === 0 ? 0xff2222 : 0x2244ff);
    }
    return Math.abs(this.speed) * dt;
  }

  damage(amount) {
    this.health -= amount;
    if (this.health < 45 && !this.smoking) this.smoking = true;
    return this.health <= 0;
  }

  dispose() {
    this.scene.remove(this.group);
  }
}

// Push a circle out of axis-aligned building colliders; returns the collider hit.
function collideCircle(x, z, r, colliders) {
  for (const c of colliders) {
    const cx = SolmarUtil.clamp(x, c.minX, c.maxX);
    const cz = SolmarUtil.clamp(z, c.minZ, c.maxZ);
    const dx = x - cx, dz = z - cz;
    if (dx * dx + dz * dz < r * r) return c;
  }
  return null;
}

// Resolve a circle against colliders by pushing it out along the smallest axis.
function resolveCircle(pos, r, colliders) {
  for (const c of colliders) {
    const cx = SolmarUtil.clamp(pos.x, c.minX, c.maxX);
    const cz = SolmarUtil.clamp(pos.z, c.minZ, c.maxZ);
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * r;
      pos.z = cz + (dz / d) * r;
      return true;
    }
    if (d2 <= 0.0001) { pos.x = c.maxX + r; return true; }
  }
  return false;
}

// ---- traffic: background cars cruising the road grid --------------------
class SolmarTraffic {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.cars = [];
    this.parked = [];
  }

  spawn(count) {
    for (let i = 0; i < count; i++) this._spawnOne(true);
  }

  _spawnOne(moving) {
    const vertical = Math.random() < 0.5;
    const line = SolmarUtil.pick(CITY.ROAD_LINES);
    const along = SolmarUtil.rand(-250, 250);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const lane = dir > 0 ? 3.4 : -3.4;
    const x = vertical ? line + lane : along;
    const z = vertical ? along : line + lane;
    const angle = vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const car = new SolmarCar(this.scene, x, z, angle, SolmarUtil.pick(SolmarUtil.PALETTE.carColors), false);
    car.traffic = { vertical, line, dir, speed: SolmarUtil.rand(7, 11), stopped: 0 };
    this.cars.push(car);
    return car;
  }

  spawnParked(count) {
    for (let i = 0; i < count; i++) {
      const vertical = Math.random() < 0.5;
      const line = SolmarUtil.pick(CITY.ROAD_LINES);
      const along = SolmarUtil.rand(-240, 240);
      const lane = Math.random() < 0.5 ? 3.4 : -3.4;
      const x = vertical ? line + lane : along;
      const z = vertical ? along : line + lane;
      const angle = vertical ? (Math.random() < 0.5 ? 0 : Math.PI) : (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      // Keep parked cars off Palm Park.
      if (Math.abs(x - 29) < 26 && Math.abs(z - 29) < 26) continue;
      const car = new SolmarCar(this.scene, x, z, angle, SolmarUtil.pick(SolmarUtil.PALETTE.carColors), false);
      car.parked = true;
      this.parked.push(car);
      this.cars.push(car);
    }
  }

  // A traffic car drives straight along its road; at an intersection it may
  // turn onto the crossing road. It brakes for the car ahead.
  update(dt, playerCar, playerPos) {
    for (const car of this.cars) {
      if (car.parked || car.isPolice || car.dead || !car.traffic) continue;
      const t = car.traffic;
      if (t.stopped > 0) { t.stopped -= dt; continue; }
      // Car ahead? brake.
      let blocked = false;
      for (const other of this.cars) {
        if (other === car || other.dead) continue;
        const dx = other.x - car.x, dz = other.z - car.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < 9) {
          const f = car.forward();
          const dot = (dx * f.x + dz * f.z) / (d || 1);
          if (dot > 0.7) { blocked = true; break; }
        }
      }
      if (playerCar && playerCar !== car) {
        const dx = playerCar.x - car.x, dz = playerCar.z - car.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < 8) {
          const f = car.forward();
          if ((dx * f.x + dz * f.z) / (d || 1) > 0.7) blocked = true;
        }
      }
      if (blocked) { t.stopped = 0.4; continue; }
      const f = car.forward();
      let nx = car.x + f.x * t.speed * dt;
      let nz = car.z + f.z * t.speed * dt;
      // At an intersection, sometimes turn.
      const nearLine = (v) => { for (const l of CITY.ROAD_LINES) if (Math.abs(v - l) < 1.2) return l; return null; };
      const cross = t.vertical ? nearLine(nz) : nearLine(nx);
      if (cross !== null && Math.random() < dt * 0.25) {
        const turnLeft = Math.random() < 0.5;
        const newVertical = !t.vertical;
        const newLine = cross;
        const newDir = turnLeft ? -t.dir : t.dir;
        const lane = newDir > 0 ? 3.4 : -3.4;
        if (newVertical) {
          car.setPos(newLine + lane, nz);
          car.angle = newDir > 0 ? 0 : Math.PI;
        } else {
          car.setPos(nx, newLine + lane);
          car.angle = newDir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
        t.vertical = newVertical;
        t.line = newLine;
        t.dir = newDir;
        car.group.rotation.y = car.angle;
        continue;
      }
      // Turn around at the city edge.
      if (nx < -255 || nx > 300 || nz < -255 || nz > 255) {
        car.angle += Math.PI;
        car.group.rotation.y = car.angle;
        t.dir *= -1;
        continue;
      }
      car.setPos(nx, nz);
      // Wheel spin for looks.
      for (const w of car.wheels) w.rotation.x += t.speed * dt * 2.2;
    }
  }

  nearestTo(x, z, maxDist, exclude) {
    let best = null, bestD = maxDist;
    for (const car of this.cars) {
      if (car === exclude || car.dead || car.isPolice) continue;
      const d = Math.sqrt(SolmarUtil.dist2(x, z, car.x, car.z));
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  removeCar(car) {
    car.dead = true;
    car.dispose();
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    const j = this.parked.indexOf(car);
    if (j >= 0) this.parked.splice(j, 1);
  }
}
