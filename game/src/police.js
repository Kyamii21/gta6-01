// Solmar — the wanted system and the police who answer it, plus the
// pedestrians who fill the sidewalks.

class SolmarPolice {
  constructor(scene, colliders, traffic, audio, effects) {
    this.scene = scene;
    this.colliders = colliders;
    this.traffic = traffic;
    this.audio = audio;
    this.effects = effects;
    this.wanted = 0;
    this.cops = [];
    this.quietTimer = 0;   // time since the last crime
    this.decayTimer = 0;   // counts down to losing a star while hidden
    this.bustedTimer = 0;  // a cop car sitting on the player on foot
    this.spawnTimer = 0;
    this.onBusted = null;  // callback
    this.onWantedChange = null;
  }

  addWanted(n, reason) {
    if (this.wanted >= 5) return;
    this.wanted = Math.min(5, this.wanted + n);
    this.quietTimer = 0;
    this.decayTimer = 0;
    if (this.onWantedChange) this.onWantedChange(this.wanted, reason);
  }

  clearWanted() {
    this.wanted = 0;
    this.quietTimer = 0;
    if (this.onWantedChange) this.onWantedChange(0, 'clean');
  }

  _spawnCop(px, pz) {
    // Spawn on a road a short way from the player, already rolling.
    const line = SolmarUtil.pick(CITY.ROAD_LINES);
    const vertical = Math.random() < 0.5;
    const along = SolmarUtil.clamp(vertical ? pz : px, -240, 240) + SolmarUtil.pick([-70, -55, 55, 70]);
    const x = vertical ? line : SolmarUtil.clamp(along, -250, 250);
    const z = vertical ? SolmarUtil.clamp(along, -250, 250) : line;
    const car = new SolmarCar(this.scene, x, z, 0, 0x11131a, true);
    car.isPolice = true;
    car.traffic = null;
    this.cops.push(car);
    return car;
  }

  _despawnFarCops(px, pz) {
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const c = this.cops[i];
      if (Math.sqrt(SolmarUtil.dist2(c.x, c.z, px, pz)) > 320) {
        c.dispose();
        this.cops.splice(i, 1);
      }
    }
  }

  update(dt, player, playerCar, pedestrians) {
    const px = playerCar ? playerCar.x : player.x;
    const pz = playerCar ? playerCar.z : player.z;
    this.quietTimer += dt;
    // Wanted decays when the player stays clean and out of sight.
    if (this.wanted > 0) {
      const nearestCop = this._nearestCopDist(px, pz);
      if (this.quietTimer > 20 && nearestCop > 55) {
        this.decayTimer += dt;
        if (this.decayTimer > 10) {
          this.wanted -= 1;
          this.decayTimer = 0;
          if (this.onWantedChange) this.onWantedChange(this.wanted, 'cooled off');
        }
      } else this.decayTimer = 0;
    }
    // Keep the right number of pursuit cars on the road.
    const want = this.wanted === 0 ? 0 : Math.min(2 + this.wanted, 7);
    this.spawnTimer -= dt;
    if (this.cops.length < want && this.spawnTimer <= 0) {
      this._spawnCop(px, pz);
      this.spawnTimer = 1.6;
    }
    if (this.wanted === 0) {
      for (let i = this.cops.length - 1; i >= 0; i--) {
        const c = this.cops[i];
        if (Math.sqrt(SolmarUtil.dist2(c.x, c.z, px, pz)) > 120) { c.dispose(); this.cops.splice(i, 1); }
      }
    }
    this._despawnFarCops(px, pz);
    // Pursuit: steer at the player, ram them, and try to box them in.
    let busted = false;
    for (const cop of this.cops) {
      const dx = px - cop.x, dz = pz - cop.z;
      const dist = Math.sqrt(dx * dx + dz * dz) || 1;
      const targetAngle = Math.atan2(dx, dz);
      const diff = SolmarUtil.angleDiff(cop.angle, targetAngle);
      const steer = SolmarUtil.clamp(diff * 1.4, -1, 1);
      const speedTarget = dist > 26 ? 26 : 24;
      const throttle = cop.speed < speedTarget ? 1 : 0;
      cop.drive({ throttle, steer, brake: false }, dt, this.colliders, (spd) => {
        this.effects.sparks(cop.x, 0.8, cop.z, 6);
        this.audio.crash();
      });
      // Ram damage.
      if (dist < 3.4) {
        if (playerCar) {
          if (playerCar.damage(6 * dt * 8)) this._blowUpCar(playerCar);
        } else {
          player.health -= 9 * dt;
          this.bustedTimer += dt;
          if (this.bustedTimer > 2.5) busted = true;
        }
      } else if (!playerCar) {
        this.bustedTimer = Math.max(0, this.bustedTimer - dt);
      }
      // Cops clip pedestrians out of the way (they scatter).
      for (const ped of pedestrians) {
        if (ped.fallen) continue;
        if (Math.sqrt(SolmarUtil.dist2(ped.x, ped.z, cop.x, cop.z)) < 4) ped.fleeFrom(cop.x, cop.z);
      }
    }
    if (busted && this.onBusted) this.onBusted();
  }

  _nearestCopDist(px, pz) {
    let best = 1e9;
    for (const c of this.cops) best = Math.min(best, Math.sqrt(SolmarUtil.dist2(c.x, c.z, px, pz)));
    return best;
  }

  _blowUpCar(car) {
    this.effects.explosion(car.x, 1, car.z);
    this.audio.boom();
    car.dead = true;
  }

  reset() {
    for (const c of this.cops) c.dispose();
    this.cops = [];
    this.wanted = 0;
    this.bustedTimer = 0;
    this.quietTimer = 0;
  }
}

// ---- pedestrians -------------------------------------------------------
class SolmarPedestrian {
  constructor(scene, x, z) {
    this.scene = scene;
    this.x = x; this.z = z;
    this.heading = Math.random() * Math.PI * 2;
    this.speed = SolmarUtil.rand(1.0, 1.7);
    this.fallen = false;
    this.fade = 1;
    this.fleeTimer = 0;
    this.retarget = 0;
    this.group = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: SolmarUtil.pick([0xc9c9c9, 0x5a7fb8, 0xc98a5a, 0x7ab87a, 0xb85a8a, 0x8a5ab8]) });
    const pants = new THREE.MeshLambertMaterial({ color: 0x333a44 });
    const skin = new THREE.MeshLambertMaterial({ color: SolmarUtil.pick([0xd9a066, 0x8a5a38, 0xe8b88a, 0x6a4530]) });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.36), shirt);
    torso.position.y = 1.1;
    torso.castShadow = true;
    this.group.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.36), skin);
    head.position.y = 1.7;
    this.group.add(head);
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.68, 0.26), pants);
    this.legL.geometry.translate(0, -0.3, 0);
    this.legL.position.set(-0.16, 0.68, 0);
    this.group.add(this.legL);
    this.legR = this.legL.clone();
    this.legR.position.x = 0.16;
    this.group.add(this.legR);
    this.phase = Math.random() * 6;
    this.group.position.set(x, 0, z);
    scene.add(this.group);
  }

  fleeFrom(x, z) {
    const dx = this.x - x, dz = this.z - z;
    const d = Math.hypot(dx, dz) || 1;
    this.heading = Math.atan2(dx / d, dz / d);
    this.fleeTimer = 2.5;
    this.speed = 4.5;
  }

  fall() {
    this.fallen = true;
    this.group.rotation.x = -Math.PI / 2;
    this.group.position.y = 0.35;
  }

  update(dt, colliders, danger) {
    if (this.fallen) {
      this.fade -= dt * 0.25;
      this.group.traverse((o) => { if (o.material) o.material.transparent = true, o.material.opacity = Math.max(0, this.fade); });
      return this.fade <= 0;
    }
    this.retarget -= dt;
    if (this.retarget <= 0) {
      this.retarget = SolmarUtil.rand(4, 9);
      // Walk along a sidewalk: pick a road line, walk parallel to it.
      const vertical = Math.random() < 0.5;
      const line = SolmarUtil.pick(CITY.ROAD_LINES);
      const side = Math.random() < 0.5 ? 8.6 : -8.6;
      if (vertical) { this.tx = line + side; this.tz = SolmarUtil.rand(-240, 240); }
      else { this.tx = SolmarUtil.rand(-240, 240); this.tz = line + side; }
    }
    if (danger) {
      const d = Math.hypot(this.x - danger.x, this.z - danger.z);
      if (d < 10 && this.fleeTimer <= 0) this.fleeFrom(danger.x, danger.z);
    }
    if (this.fleeTimer > 0) this.fleeTimer -= dt;
    else this.speed = SolmarUtil.lerp(this.speed, 1.4, dt);
    const dx = (this.tx || this.x) - this.x, dz = (this.tz || this.z) - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 1) {
      const target = Math.atan2(dx / dist, dz / dist);
      this.heading = SolmarUtil.angleLerp(this.heading, target, Math.min(1, dt * 5));
      const nx = this.x + Math.sin(this.heading) * this.speed * dt;
      const nz = this.z + Math.cos(this.heading) * this.speed * dt;
      if (!collideCircle(nx, this.z, 0.5, colliders)) this.x = nx;
      if (!collideCircle(this.x, nz, 0.5, colliders)) this.z = nz;
      this.phase += dt * this.speed * 3.2;
      const swing = Math.sin(this.phase) * 0.6;
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
    }
    this.x = SolmarUtil.clamp(this.x, -300, 310);
    this.z = SolmarUtil.clamp(this.z, -280, 320);
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    return false;
  }

  dispose() { this.scene.remove(this.group); }
}
