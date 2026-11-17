// Solmar — the player on foot: a third-person walker with a drag-orbit
// camera, running, punching, and getting in and out of cars.

class SolmarPlayer {
  constructor(scene, x, z) {
    this.scene = scene;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = Math.PI; // facing the street
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 7.5;
    this.speed = 0;
    this.walkPhase = 0;
    this.punchTimer = 0;
    this.punchCooldown = 0;
    this.inCar = null;
    this.group = new THREE.Group();
    this._buildMesh();
    this.group.position.copy(this.pos);
    scene.add(this.group);
  }

  _buildMesh() {
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x2e8f83 });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2a3242 });
    const cap = new THREE.MeshLambertMaterial({ color: 0xd23b2e });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.4), shirt);
    torso.position.y = 1.15;
    torso.castShadow = true;
    this.group.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.4), skin);
    head.position.y = 1.82;
    head.castShadow = true;
    this.group.add(head);
    const capTop = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.44), cap);
    capTop.position.y = 2.06;
    this.group.add(capTop);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.24), cap);
    brim.position.set(0, 2.0, 0.3);
    this.group.add(brim);
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.75, 0.3), pants);
    this.legL.position.set(-0.19, 0.38, 0);
    this.legL.geometry.translate(0, -0.32, 0);
    this.legL.position.y = 0.75;
    this.group.add(this.legL);
    this.legR = this.legL.clone();
    this.legR.position.x = 0.19;
    this.group.add(this.legR);
    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.24), shirt);
    this.armL.geometry.translate(0, -0.28, 0);
    this.armL.position.set(-0.48, 1.5, 0);
    this.group.add(this.armL);
    this.armR = this.armL.clone();
    this.armR.position.x = 0.48;
    this.group.add(this.armR);
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  // input: {f, b, l, r (bools), run, punch}. dt seconds. Returns nothing.
  update(input, dt, colliders, effects) {
    if (this.inCar) return;
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.punchTimer = Math.max(0, this.punchTimer - dt);
    const fwdX = Math.sin(this.camYaw), fwdZ = Math.cos(this.camYaw);
    const rightX = Math.cos(this.camYaw), rightZ = -Math.sin(this.camYaw);
    let mx = 0, mz = 0;
    if (input.f) { mx += fwdX; mz += fwdZ; }
    if (input.b) { mx -= fwdX; mz -= fwdZ; }
    if (input.r) { mx += rightX; mz += rightZ; }
    if (input.l) { mx -= rightX; mz -= rightZ; }
    const moving = mx !== 0 || mz !== 0;
    const targetSpeed = moving ? (input.run ? 8.5 : 4.6) : 0;
    this.speed = SolmarUtil.lerp(this.speed, targetSpeed, Math.min(1, dt * 8));
    if (moving) {
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      const targetHeading = Math.atan2(mx, mz);
      this.heading = SolmarUtil.angleLerp(this.heading, targetHeading, Math.min(1, dt * 12));
      const nx = this.pos.x + mx * this.speed * dt;
      const nz = this.pos.z + mz * this.speed * dt;
      if (!collideCircle(nx, this.pos.z, 0.55, colliders)) this.pos.x = nx;
      if (!collideCircle(this.pos.x, nz, 0.55, colliders)) this.pos.z = nz;
      this.pos.x = SolmarUtil.clamp(this.pos.x, -305, 315);
      this.pos.z = SolmarUtil.clamp(this.pos.z, -285, 415);
      this.walkPhase += dt * this.speed * 1.6;
      if (input.run && Math.random() < dt * 6) effects.dust(this.pos.x, 0.1, this.pos.z, 1);
    }
    const swing = moving ? Math.sin(this.walkPhase) * 0.7 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    if (this.punchTimer > 0) {
      this.armR.rotation.x = -1.9 * Math.sin((this.punchTimer / 0.28) * Math.PI);
    } else {
      this.armL.rotation.x = -swing * 0.8;
      this.armR.rotation.x = swing * 0.8;
    }
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }

  punch() {
    if (this.punchCooldown > 0 || this.inCar) return false;
    this.punchCooldown = 0.45;
    this.punchTimer = 0.28;
    return true;
  }

  // Third-person camera: orbit behind the heading, drag to look around.
  updateCamera(camera, dt) {
    const yaw = this.camYaw;
    const cx = this.pos.x - Math.sin(yaw) * this.camDist * Math.cos(this.camPitch);
    const cz = this.pos.z - Math.cos(yaw) * this.camDist * Math.cos(this.camPitch);
    const cy = 2.2 + Math.sin(this.camPitch) * this.camDist;
    camera.position.x = SolmarUtil.lerp(camera.position.x, cx, Math.min(1, dt * 10));
    camera.position.y = SolmarUtil.lerp(camera.position.y, cy, Math.min(1, dt * 10));
    camera.position.z = SolmarUtil.lerp(camera.position.z, cz, Math.min(1, dt * 10));
    camera.lookAt(this.pos.x, 1.6, this.pos.z);
  }

  // Chase camera for driving: behind the car, smoothing the yaw.
  updateCarCamera(camera, car, dt) {
    const back = 9.5, up = 4.2;
    const fx = Math.sin(car.angle), fz = Math.cos(car.angle);
    const tx = car.x - fx * back, tz = car.z - fz * back;
    camera.position.x = SolmarUtil.lerp(camera.position.x, tx, Math.min(1, dt * 5));
    camera.position.y = SolmarUtil.lerp(camera.position.y, up, Math.min(1, dt * 5));
    camera.position.z = SolmarUtil.lerp(camera.position.z, tz, Math.min(1, dt * 5));
    camera.lookAt(car.x + fx * 6, 1.4, car.z + fz * 6);
  }
}
