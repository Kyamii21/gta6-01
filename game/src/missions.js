// Solmar — missions and the story: five jobs for Leo Marin, from his first
// stolen car to the Solmar Score, each with steps, a 3D beacon, a timer
// where it matters, and a cash payout.

const SOLMAR_MISSIONS = [
  {
    id: 'wheels',
    title: 'Wheels Up',
    intro: 'Mama Rosa needs wheels. Get in any car and bring it to Spray & Shine.',
    reward: 150,
    steps: [
      { type: 'enterCar', text: 'Steal a car — press E next to one' },
      { type: 'goto', target: 'paintShop', radius: 9, text: 'Drive to Spray & Shine' },
    ],
  },
  {
    id: 'drop',
    title: 'The Drop',
    intro: 'A package is waiting in Palm Park. Grab it and run it to the Docks before the buyer walks.',
    reward: 300,
    steps: [
      { type: 'goto', target: 'park', radius: 6, text: 'Pick up the package in Palm Park' },
      { type: 'goto', target: 'docks', radius: 10, text: 'Deliver to the Docks', time: 150 },
    ],
  },
  {
    id: 'pursuit',
    title: 'Hot Pursuit',
    intro: 'The cops are on you, Leo. Lose them — lay low until the heat dies down.',
    reward: 400,
    steps: [
      { type: 'wanted', stars: 2, text: 'Get the cops off your tail' },
      { type: 'survive', time: 45, text: 'Stay out of sight — heat cooling down' },
    ],
  },
  {
    id: 'beach',
    title: 'Beachcomber',
    intro: 'Six crates washed up on the beach after last night’s storm. Collect them all.',
    reward: 500,
    steps: [
      { type: 'collect', target: 'beach', count: 6, radius: 130, text: 'Collect the washed-up crates (0/6)' },
    ],
  },
  {
    id: 'score',
    title: 'The Solmar Score',
    intro: 'The big one. Hit Solmar National Bank, grab the loot, and get back to Leo’s Place alive.',
    reward: 2500,
    steps: [
      { type: 'goto', target: 'bank', radius: 10, text: 'Get to Solmar National Bank' },
      { type: 'hold', target: 'bank', time: 5, text: 'Hold E to crack the vault' },
      { type: 'goto', target: 'safehouse', radius: 9, text: 'Escape to Leo’s Place!', wanted: 3 },
    ],
  },
];

class SolmarMissions {
  constructor(game) {
    this.game = game;
    this.index = 0;
    this.stepIndex = 0;
    this.active = false;
    this.stepTimer = 0;
    this.holdTimer = 0;
    this.collectibles = [];
    this.beacon = null;
    this.marker = null;
    this.onMissionComplete = null;
    this.onStepChange = null;
    this.onStoryComplete = null;
    this._buildBeacon();
  }

  _buildBeacon() {
    const g = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd319, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true), beamMat);
    beam.position.y = 30;
    g.add(beam);
    const diamondMat = new THREE.MeshBasicMaterial({ color: 0xffd319 });
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), diamondMat);
    diamond.position.y = 7;
    diamond.name = 'diamond';
    g.add(diamond);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3, 4.2, 24), new THREE.MeshBasicMaterial({ color: 0xffd319, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    g.add(ring);
    g.visible = false;
    this.game.scene.add(g);
    this.beacon = g;
  }

  get current() { return SOLMAR_MISSIONS[this.index] || null; }
  get step() { return this.current ? this.current.steps[this.stepIndex] : null; }
  get done() { return this.index >= SOLMAR_MISSIONS.length; }

  start(index) {
    this.index = index;
    this.stepIndex = 0;
    this.active = true;
    this._clearCollectibles();
    this._enterStep();
    if (this.onStepChange) this.onStepChange(this._objectiveText());
  }

  _targetPos(step) {
    const L = this.game.city.landmarks;
    if (step.target === 'beach' && step.type === 'collect') return null; // crates scatter
    return L[step.target] || null;
  }

  _enterStep() {
    const step = this.step;
    if (!step) { this._finishMission(); return; }
    this.stepTimer = step.time || 0;
    this.holdTimer = 0;
    if (step.type === 'collect') this._spawnCollectibles(step);
    if (step.wanted) this.game.police.addWanted(step.wanted, 'mission');
    if (step.type === 'wanted' && step.stars) this.game.police.addWanted(step.stars, 'mission');
    const target = this._targetPos(step);
    if (target) this._placeBeacon(target.x, target.z);
    else if (step.type === 'collect') this._placeBeacon(this.collectibles[0].x, this.collectibles[0].z);
    else if (step.type === 'enterCar' || step.type === 'survive' || step.type === 'wanted') this.beacon.visible = false;
    if (this.onStepChange) this.onStepChange(this._objectiveText());
  }

  _placeBeacon(x, z) {
    this.beacon.position.set(x, 0, z);
    this.beacon.visible = true;
    this.marker = { x, z };
  }

  _spawnCollectibles(step) {
    this._clearCollectibles();
    const mat = new THREE.MeshLambertMaterial({ color: 0x9a7a4a });
    const glow = new THREE.MeshBasicMaterial({ color: 0xffd319 });
    for (let i = 0; i < step.count; i++) {
      const angle = (i / step.count) * Math.PI * 2;
      const x = -60 + Math.cos(angle) * SolmarUtil.rand(30, 95);
      const z = 292 + Math.sin(angle) * SolmarUtil.rand(4, 18);
      const grp = new THREE.Group();
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), mat);
      crate.position.y = 0.8;
      crate.castShadow = true;
      grp.add(crate);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), glow);
      gem.position.y = 2.4;
      grp.add(gem);
      grp.position.set(x, 0, z);
      this.game.scene.add(grp);
      this.collectibles.push({ x, z, group: grp, gem, taken: false });
    }
  }

  _clearCollectibles() {
    for (const c of this.collectibles) this.game.scene.remove(c.group);
    this.collectibles = [];
  }

  _objectiveText() {
    const m = this.current;
    if (!m) return '';
    const s = this.step;
    let t = s ? s.text : '';
    if (s && s.type === 'collect') {
      const got = this.collectibles.filter((c) => c.taken).length;
      t = `Collect the washed-up crates (${got}/${s.count})`;
    }
    return `${m.title} — ${t}`;
  }

  _finishMission() {
    const m = this.current;
    this.active = false;
    this.beacon.visible = false;
    this.marker = null;
    this._clearCollectibles();
    if (m) {
      this.game.money += m.reward;
      this.game.audio.cash();
      this.game.hud.toast(`Mission complete: ${m.title}  +$${m.reward}`);
      if (this.onMissionComplete) this.onMissionComplete(m, this.index);
    }
    this.index++;
    this.game.save();
    if (this.done) {
      if (this.onStoryComplete) this.onStoryComplete();
      return;
    }
    this.start(this.index);
  }

  _failMission(reason) {
    this.game.hud.toast(`Mission failed: ${reason}`);
    this.game.audio.thud();
    this.stepIndex = 0;
    this._enterStep();
  }

  update(dt, player, playerCar) {
    if (!this.active || !this.step) return;
    const step = this.step;
    const px = playerCar ? playerCar.x : player.x;
    const pz = playerCar ? playerCar.z : player.z;
    this.beacon.rotation.y += dt * 0.8;
    const diamond = this.beacon.getObjectByName('diamond');
    if (diamond) diamond.position.y = 7 + Math.sin(performance.now() / 350) * 0.8;
    if (step.time && (step.type === 'goto' || step.type === 'survive')) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        if (step.type === 'survive') { this.stepIndex++; this._enterStep(); return; }
        this._failMission('Out of time');
        return;
      }
    }
    if (step.type === 'enterCar') {
      if (playerCar) { this.stepIndex++; this._enterStep(); }
      return;
    }
    if (step.type === 'goto' || step.type === 'hold') {
      const t = this._targetPos(step);
      if (!t) return;
      const d = Math.hypot(px - t.x, pz - t.z);
      if (step.type === 'goto') {
        if (d < step.radius) { this.stepIndex++; this._enterStep(); }
      } else {
        const holding = this.game.keys['KeyE'] && d < step.radius;
        if (holding) {
          this.holdTimer += dt;
          if (this.holdTimer >= step.time) { this.stepIndex++; this._enterStep(); }
        } else this.holdTimer = Math.max(0, this.holdTimer - dt * 2);
      }
      return;
    }
    if (step.type === 'collect') {
      let changed = false;
      for (const c of this.collectibles) {
        if (c.taken) continue;
        c.gem.rotation.y += dt * 2;
        if (Math.hypot(px - c.x, pz - c.z) < 2.6) {
          c.taken = true;
          this.game.scene.remove(c.group);
          this.game.money += 40;
          this.game.audio.blip(1320, 0.1, 'sine', 0.12);
          changed = true;
        }
      }
      if (changed) {
        const remaining = this.collectibles.filter((c) => !c.taken);
        if (remaining.length === 0) { this.stepIndex++; this._enterStep(); return; }
        this._placeBeacon(remaining[0].x, remaining[0].z);
        if (this.onStepChange) this.onStepChange(this._objectiveText());
      }
      return;
    }
    if (step.type === 'wanted' || step.type === 'survive') {
      if (step.type === 'wanted' && this.game.police.wanted === 0 && this.game.police.quietTimer > 3) {
        this.stepIndex++; this._enterStep();
      }
      return;
    }
  }
}
