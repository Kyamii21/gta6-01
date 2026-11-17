// Solmar — bootstrap, the game loop, input, stealing and driving cars,
// collisions, pickups, health, saving, and the debug hooks the play-test
// driver uses. Everything is wired here; systems live in their own files.

class SolmarGame {
  constructor() {
    this.state = 'menu'; // menu | playing | paused | over
    this.money = 0;
    this.timePlayed = 0;
    this.carsStolen = 0;
    this.pedsDown = 0;
    this.missionsDone = 0;
    this.keys = {};
    this.pickups = [];
    this.pedestrians = [];
    this.saveKey = 'solmar-save-v2';
    this._dragging = false;
    this._lastDamageAt = 0;
  }

  init() {
    const params = new URLSearchParams(location.search);
    this.lowFx = params.get('lowfx') === '1'; // lighter rendering for slow machines
    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.lowFx });
    this.renderer.setPixelRatio(this.lowFx ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = !this.lowFx;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffab66);
    this.scene.fog = new THREE.Fog(0xe89a62, 130, 560);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(-87, 6, 122);

    // Sunset lighting: low warm sun + soft sky fill.
    const sun = new THREE.DirectionalLight(0xffd9a0, 1.6);
    sun.position.set(-180, 140, 260);
    sun.castShadow = !this.lowFx;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -280; sun.shadow.camera.right = 280;
    sun.shadow.camera.top = 280; sun.shadow.camera.bottom = -280;
    sun.shadow.camera.far = 800;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xffc4a0, 0x4a5a6a, 0.85));
    this.sun = sun;

    this.city = buildCity(this.scene);
    this.effects = new SolmarEffects(this.scene);
    this.audio = new SolmarAudio();
    this.traffic = new SolmarTraffic(this.scene, this.city.colliders);
    this.traffic.spawn(11);
    this.traffic.spawnParked(9);
    this.player = new SolmarPlayer(this.scene, -87, 104);
    this.player.health = 100;
    this.playerCamStart = { x: -87, y: 6, z: 122 };
    this.playerCar = null;
    this.police = new SolmarPolice(this.scene, this.city.colliders, this.traffic, this.audio, this.effects);
    this.police.onBusted = () => this.gameOver('busted');
    this.police.onWantedChange = (n, reason) => {
      this.hud.setWanted(n);
      this.audio.setSiren(n);
      if (n > 0) this.hud.toast(reason === 'mission' ? 'The cops are on you!' : 'Wanted level up!', 2200);
    };
    for (let i = 0; i < 26; i++) this._spawnPedestrian();
    this.missions = new SolmarMissions(this);
    this.missions.onMissionComplete = (m, idx) => { this.missionsDone++; };
    this.missions.onStoryComplete = () => {
      this.money += 1000;
      this.hud.toast('STORY COMPLETE — Solmar is yours, Leo. +$1,000', 6000);
      this.hud.setObjective('Free roam — Solmar is yours. Make it rain.');
      this.save();
    };
    this.hud = new SolmarHud(this);
    this.hud.onStart = (fresh) => this.startGame(fresh);
    this.hud.onRestart = () => this.startGame(true);
    this.hud.onResume = () => this.togglePause();
    this._bindInput();
    this._loadSave();
    this.hud.showMenu(!!this.savedData);
    this.hud.setMoney(this.money);
    this.clock = new THREE.Clock();
    document.getElementById('loading').style.display = 'none';
    this.renderer.setAnimationLoop(() => this.frame());
  }

  _spawnPedestrian() {
    const vertical = Math.random() < 0.5;
    const line = SolmarUtil.pick(CITY.ROAD_LINES);
    const side = Math.random() < 0.5 ? 8.6 : -8.6;
    const along = SolmarUtil.rand(-240, 240);
    const x = vertical ? line + side : along;
    const z = vertical ? along : line + side;
    if (Math.abs(x - 29) < 24 && Math.abs(z - 29) < 24) return; // keep Palm Park clear
    this.pedestrians.push(new SolmarPedestrian(this.scene, x, z));
  }

  _bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (e.code === 'KeyM') this.audio.toggleMute();
      if (e.code === 'Escape') { if (this.state === 'playing' || this.state === 'paused') this.togglePause(); }
      if (e.code === 'KeyE' && this.state === 'playing') this._tryEnterExitCar();
      if (e.code === 'KeyF' && this.state === 'playing') this._tryPunch();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    const canvas = document.getElementById('game-canvas');
    canvas.addEventListener('pointerdown', (e) => { this._dragging = true; this._lastPX = e.clientX; this._lastPY = e.clientY; });
    window.addEventListener('pointermove', (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - this._lastPX, dy = e.clientY - this._lastPY;
      this._lastPX = e.clientX; this._lastPY = e.clientY;
      this.player.camYaw -= dx * 0.005;
      this.player.camPitch = SolmarUtil.clamp(this.player.camPitch + dy * 0.004, 0.05, 1.1);
    });
    window.addEventListener('pointerup', () => { this._dragging = false; });
    canvas.addEventListener('wheel', (e) => {
      this.player.camDist = SolmarUtil.clamp(this.player.camDist + Math.sign(e.deltaY) * 1.2, 4.5, 13);
    }, { passive: true });
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  startGame(fresh) {
    if (fresh) {
      this.money = 0; this.missionsDone = 0; this.timePlayed = 0;
      this.carsStolen = 0; this.pedsDown = 0;
      this.player.health = 100;
      this.police.reset();
      this.player.pos.set(-87, 0, 104);
      this.player.heading = Math.PI;
      this.player.camYaw = Math.PI;
      this.player.group.visible = true;
      if (this.playerCar) { this.player.inCar = null; this.playerCar = null; }
      this.missions.start(0);
      try { localStorage.removeItem(this.saveKey); } catch (e) { /* private mode */ }
    } else if (this.savedData) {
      this.money = this.savedData.money || 0;
      this.missions.start(Math.min(this.savedData.missionIndex || 0, SOLMAR_MISSIONS.length - 1));
    } else {
      this.missions.start(0);
    }
    this.audio.start();
    this.state = 'playing';
    this.hud.showHud();
    this.hud.setMoney(this.money);
    this.hud.setHealth(this.player.health);
    this.hud.setWanted(this.police.wanted);
    this.hud.setObjective(this.missions._objectiveText());
    this.hud.toast(this.missions.current ? this.missions.current.title + ' — ' + this.missions.current.intro : '', 5200);
  }

  togglePause() {
    if (this.state === 'playing') { this.state = 'paused'; this.hud.showPause(); }
    else if (this.state === 'paused') { this.state = 'playing'; this.hud.hidePause(); }
  }

  _tryEnterExitCar() {
    if (this.playerCar) {
      // Get out: step out to the car's left side.
      const car = this.playerCar;
      const lx = car.x - Math.cos(car.angle) * 2.2;
      const lz = car.z + Math.sin(car.angle) * 2.2;
      this.player.pos.set(lx, 0, lz);
      this.player.group.visible = true;
      this.player.group.position.copy(this.player.pos);
      this.player.inCar = null;
      this.playerCar = null;
      this.audio.setEngine(0, false);
      return;
    }
    const car = this.traffic.nearestTo(this.player.x, this.player.z, 4.2, null);
    if (!car) return;
    const wasParked = !!car.parked;
    const occupied = !wasParked && car.traffic;
    car.parked = false;
    car.traffic = null;
    this.playerCar = car;
    this.player.inCar = car;
    this.player.group.visible = false;
    this.carsStolen++;
    const copNear = this.police._nearestCopDist(car.x, car.z) < 55;
    if (occupied || copNear) this.police.addWanted(1, 'car theft');
    this.audio.blip(520, 0.1, 'triangle', 0.1);
  }

  _tryPunch() {
    if (!this.player.punch()) return;
    const fx = Math.sin(this.player.heading), fz = Math.cos(this.player.heading);
    for (const ped of this.pedestrians) {
      if (ped.fallen) continue;
      const dx = ped.x - this.player.x, dz = ped.z - this.player.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.4 && (dx * fx + dz * fz) / (d || 1) > 0.3) {
        ped.fall();
        this.pedsDown++;
        this.effects.blood(ped.x, 1, ped.z);
        this.audio.thud();
        this._dropCash(ped.x, ped.z, SolmarUtil.randInt(10, 25));
        this.police.addWanted(1, 'assault');
        break;
      }
    }
  }

  _dropCash(x, z, value) {
    const geo = new THREE.BoxGeometry(0.9, 0.25, 0.5);
    const mat = new THREE.MeshLambertMaterial({ color: 0x37c26a });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.5, z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.pickups.push({ mesh, x, z, value, spin: Math.random() * 6 });
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    // Ocean gently breathes.
    if (this.city.ocean) this.city.ocean.position.y = 0.4 + Math.sin(t * 0.5) * 0.18;
    if (this.state !== 'playing') {
      this.effects.update(dt);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.timePlayed += dt;
    const k = this.keys;
    const input = {
      f: !!(k.KeyW || k.ArrowUp), b: !!(k.KeyS || k.ArrowDown),
      l: !!(k.KeyA || k.ArrowLeft), r: !!(k.KeyD || k.ArrowRight),
      run: !!k.ShiftLeft || !!k.ShiftRight,
    };

    if (this.playerCar) {
      const car = this.playerCar;
      const driveInput = {
        throttle: input.f ? 1 : input.b ? -1 : 0,
        steer: (input.l ? -1 : 0) + (input.r ? 1 : 0),
        brake: !!k.Space,
      };
      const travelled = car.drive(driveInput, dt, this.city.colliders, (spd) => {
        this._carCrash(car, spd);
      });
      // Skid marks + dust at speed or while handbraking.
      if ((k.Space && Math.abs(car.speed) > 6) || Math.abs(car.speed) > 24) {
        if (Math.random() < dt * 22) {
          const back = car.forward();
          this.effects.addSkid(car.x - back.x * 1.6, car.z - back.z * 1.6, car.angle);
        }
      }
      if (car.smoking && Math.random() < dt * 20) this.effects.smoke(car.x, 1.2, car.z, 1);
      this.audio.setEngine(Math.abs(car.speed) / 30, true);
      this.player.updateCarCamera(this.camera, car, dt);
      this._carVsWorld(car, dt);
    } else {
      this.player.update(input, dt, this.city.colliders, this.effects);
      this.audio.setEngine(0, false);
      this.player.updateCamera(this.camera, dt);
    }

    this.traffic.update(dt, this.playerCar, { x: this.player.x, z: this.player.z });
    this.police.update(dt, this.player, this.playerCar, this.pedestrians);
    this._updatePedestrians(dt);
    this.missions.update(dt, this.player, this.playerCar);
    this._updatePickups(dt);
    this.effects.update(dt);
    this._regenHealth(dt);
    this._refreshHud();
    if (this.player.health <= 0) this.gameOver(this.playerCar ? 'wasted' : 'wasted');
    this.renderer.render(this.scene, this.camera);
  }

  _carVsWorld(car, dt) {
    // Ram traffic cars.
    for (const other of this.traffic.cars) {
      if (other === car || other.dead || other.isPolice) continue;
      const d = Math.hypot(other.x - car.x, other.z - car.z);
      if (d < 4.0 && d > 0.01) {
        const push = (4.0 - d) / 2;
        const nx = (other.x - car.x) / d, nz = (other.z - car.z) / d;
        other.setPos(other.x + nx * push, other.z + nz * push);
        car.setPos(car.x - nx * push * 0.4, car.z - nz * push * 0.4);
        if (Math.abs(car.speed) > 5) {
          this._carCrash(car, Math.abs(car.speed));
          other.damage(12);
          if (other.health <= 0) this._blowUpTraffic(other);
        }
      }
    }
    // Run over pedestrians.
    const danger = { x: car.x, z: car.z };
    for (const ped of this.pedestrians) {
      if (ped.fallen) continue;
      const d = Math.hypot(ped.x - car.x, ped.z - car.z);
      if (d < 2.6) {
        ped.fall();
        this.pedsDown++;
        this.effects.blood(ped.x, 1, ped.z);
        this.audio.thud();
        this._dropCash(ped.x, ped.z, SolmarUtil.randInt(10, 25));
        this.police.addWanted(1, 'hit and run');
        car.damage(4);
      } else if (d < 12 && Math.abs(car.speed) > 4) {
        ped.fleeFrom(car.x, car.z);
      }
    }
    // Hit a police car: extra heat.
    for (const cop of this.police.cops) {
      const d = Math.hypot(cop.x - car.x, cop.z - car.z);
      if (d < 4.2 && Math.abs(car.speed) > 4) {
        this.police.addWanted(1, 'ramming a cop');
        cop.damage(10);
        car.damage(10);
        this._carCrash(car, Math.abs(car.speed));
      }
    }
  }

  _carCrash(car, speed) {
    this.effects.sparks(car.x, 0.9, car.z, 8);
    this.audio.crash();
    car.damage(speed * 0.9);
    this.player.health = Math.max(0, this.player.health - speed * 0.35);
    this._lastDamageAt = this.timePlayed;
    if (car.health <= 0) this._blowUpTraffic(car, true);
  }

  _blowUpTraffic(car, isPlayerCar) {
    this.effects.explosion(car.x, 1, car.z);
    this.audio.boom();
    if (isPlayerCar && car === this.playerCar) {
      this.playerCar = null;
      this.player.inCar = null;
      this.player.health = 0;
      this.player.group.visible = true;
      this.player.pos.set(car.x + 3, 0, car.z + 3);
      this.player.group.position.copy(this.player.pos);
    }
    this.traffic.removeCar(car);
  }

  _updatePedestrians(dt) {
    const danger = this.playerCar && Math.abs(this.playerCar.speed) > 4
      ? { x: this.playerCar.x, z: this.playerCar.z } : null;
    for (let i = this.pedestrians.length - 1; i >= 0; i--) {
      const ped = this.pedestrians[i];
      if (ped.update(dt, this.city.colliders, danger)) {
        ped.dispose();
        this.pedestrians.splice(i, 1);
        this._spawnPedestrian();
      }
    }
  }

  _updatePickups(dt) {
    const px = this.playerCar ? this.playerCar.x : this.player.x;
    const pz = this.playerCar ? this.playerCar.z : this.player.z;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.spin += dt * 3;
      p.mesh.rotation.y = p.spin;
      p.mesh.position.y = 0.5 + Math.sin(p.spin * 1.4) * 0.12;
      if (Math.hypot(px - p.x, pz - p.z) < 2.4) {
        this.money += p.value;
        this.audio.cash();
        this.hud.setMoney(this.money);
        this.hud.toast(`+$${p.value}`, 1200);
        this.scene.remove(p.mesh);
        this.pickups.splice(i, 1);
      }
    }
  }

  _regenHealth(dt) {
    if (this.police.wanted === 0 && this.player.health > 0 && this.timePlayed - this._lastDamageAt > 6) {
      this.player.health = Math.min(100, this.player.health + 2.2 * dt);
    }
  }

  _refreshHud() {
    this.hud.setMoney(this.money);
    this.hud.setHealth(this.player.health);
    if (this.playerCar) {
      this.hud.setSpeed(Math.abs(this.playerCar.speed) * 3.6, true);
    } else {
      this.hud.setSpeed(0, false);
    }
    let timerText = '';
    const step = this.missions.step;
    if (this.missions.active && step && step.time && (step.type === 'goto' || step.type === 'survive')) {
      timerText = '⏱ ' + Math.max(0, Math.ceil(this.missions.stepTimer)) + 's';
    }
    if (this.missions.active && step && step.type === 'hold') {
      timerText = 'HOLD E… ' + Math.round(this.missions.holdTimer / step.time * 100) + '%';
    }
    this.hud.setObjective(this.missions.active ? this.missions._objectiveText() : '', timerText);
    this.hud.drawMinimap(this);
  }

  gameOver(kind) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.audio.setEngine(0, false);
    this.audio.setSiren(0);
    const best = Math.max(this.money, (this.savedData && this.savedData.best) || 0);
    const stats = `Cash: <b>$${this.money.toLocaleString('en-US')}</b><br>` +
      `Missions finished: <b>${this.missionsDone} / ${SOLMAR_MISSIONS.length}</b><br>` +
      `Cars stolen: <b>${this.carsStolen}</b> · Time in Solmar: <b>${Math.floor(this.timePlayed / 60)}m ${Math.floor(this.timePlayed % 60)}s</b><br>` +
      `Best cash: <b>$${best.toLocaleString('en-US')}</b>`;
    this.save(best);
    this.hud.showOver(kind === 'busted' ? 'BUSTED' : 'WASTED', stats);
    document.getElementById('overTitle').className = kind === 'busted' ? 'busted' : 'wasted';
  }

  save(best) {
    try {
      localStorage.setItem(this.saveKey, JSON.stringify({
        money: this.money,
        missionIndex: Math.min(this.missions.index, SOLMAR_MISSIONS.length - 1),
        best: best !== undefined ? best : ((this.savedData && this.savedData.best) || this.money),
      }));
    } catch (e) { /* private mode */ }
  }

  _loadSave() {
    try {
      const raw = localStorage.getItem(this.saveKey);
      this.savedData = raw ? JSON.parse(raw) : null;
      if (this.savedData) this.money = this.savedData.money || 0;
    } catch (e) { this.savedData = null; }
  }

  // ---- debug hooks for the play-test driver (and curious players) -----
  debugApi() {
    const game = this;
    return {
      game,
      state: () => ({ state: game.state, money: game.money, wanted: game.police.wanted, health: Math.round(game.player.health), inCar: !!game.playerCar, mission: game.missions.index, step: game.missions.stepIndex, px: Math.round(game.playerCar ? game.playerCar.x : game.player.x), pz: Math.round(game.playerCar ? game.playerCar.z : game.player.z) }),
      start: (fresh) => game.startGame(fresh),
      teleport: (x, z) => {
        if (game.playerCar) game.playerCar.setPos(x, z);
        else { game.player.pos.set(x, 0, z); game.player.group.position.copy(game.player.pos); }
      },
      setWanted: (n) => { game.police.wanted = n; game.hud.setWanted(n); game.audio.setSiren(n); },
      giveCar: () => {
        const car = game.traffic.nearestTo(game.player.x, game.player.z, 60, null) || game.traffic.cars[0];
        car.setPos(game.player.x + 3, game.player.z);
        return car;
      },
      startMission: (i) => game.missions.start(i),
    };
  }
}

// ---- boot ---------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  const game = new SolmarGame();
  window.__solmar = game.debugApi();
  game.init();
  // Screenshot presets: ?shot=drive|foot|chase|mission&autostart=1
  const params = new URLSearchParams(location.search);
  const shot = params.get('shot');
  if (params.get('autostart') === '1') {
    game.startGame(true);
    if (shot === 'drive') {
      const car = game.traffic.nearestTo(-87, 104, 80, null);
      if (car) {
        car.setPos(-174, 150);
        car.angle = Math.PI; // face north, up the open road
        car.group.rotation.y = Math.PI;
        game.player.pos.set(-174, 0, 154);
        game.player.group.position.copy(game.player.pos);
      }
      game._tryEnterExitCar();
      game.playerCar.speed = 16;
    } else if (shot === 'foot') {
      window.__solmar.teleport(-8, 302);
      game.player.camYaw = 0.05; // face south: pier and ocean ahead
      game.player.camPitch = 0.18; // low camera, more horizon
      game.player.heading = 0.05;
    } else if (shot === 'chase') {
      const car = game.traffic.nearestTo(-87, 104, 80, null);
      if (car) {
        car.setPos(-58, 0);
        car.angle = 0;
        car.group.rotation.y = 0;
        game.player.pos.set(-58, 0, -4);
        game.player.group.position.copy(game.player.pos);
      }
      game._tryEnterExitCar();
      game.playerCar.speed = 18;
      window.__solmar.setWanted(3);
      game.police._spawnCop(-58, 40);
      game.police._spawnCop(-30, -20);
      game.police._spawnCop(-90, 20);
    } else if (shot === 'mission') {
      game.missions.start(4);
      window.__solmar.teleport(29, -40);
      game.player.camYaw = Math.PI;
    }
  }
});
