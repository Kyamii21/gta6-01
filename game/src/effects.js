// Solmar — particles (dust, smoke, sparks, explosions), skid marks and
// floating score popups. One pooled THREE.Points cloud, no per-frame allocs.

class SolmarEffects {
  constructor(scene) {
    this.scene = scene;
    this.max = 900;
    this.positions = new Float32Array(this.max * 3);
    this.colors = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.maxLife = new Float32Array(this.max);
    this.grav = new Float32Array(this.max);
    this.head = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.55, vertexColors: true, transparent: true, opacity: 0.9,
      depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    for (let i = 0; i < this.max; i++) this.positions[i * 3 + 1] = -100;

    // Skid marks: a pool of dark quads that fade out.
    this.skids = [];
    const skidGeo = new THREE.PlaneGeometry(0.55, 1.6);
    const skidMat = new THREE.MeshBasicMaterial({ color: 0x141414, transparent: true, opacity: 0.55, depthWrite: false });
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(skidGeo, skidMat.clone());
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.03;
      m.visible = false;
      m.userData.fade = 0;
      scene.add(m);
      this.skids.push(m);
    }
    this.skidHead = 0;

    // Floating "+$250" popups are DOM elements pooled by the HUD.
    this.popups = [];
  }

  _spawn(x, y, z, vx, vy, vz, life, r, g, b, grav) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    this.positions[i * 3] = x; this.positions[i * 3 + 1] = y; this.positions[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.colors[i * 3] = r; this.colors[i * 3 + 1] = g; this.colors[i * 3 + 2] = b;
    this.life[i] = life; this.maxLife[i] = life; this.grav[i] = grav;
  }

  dust(x, y, z, n) {
    for (let k = 0; k < (n || 3); k++) {
      this._spawn(x + SolmarUtil.rand(-0.5, 0.5), y + SolmarUtil.rand(0, 0.3), z + SolmarUtil.rand(-0.5, 0.5),
        SolmarUtil.rand(-1, 1), SolmarUtil.rand(0.5, 1.6), SolmarUtil.rand(-1, 1),
        SolmarUtil.rand(0.5, 0.9), 0.72, 0.66, 0.55, 0.4);
    }
  }
  smoke(x, y, z, n) {
    for (let k = 0; k < (n || 2); k++) {
      this._spawn(x + SolmarUtil.rand(-0.4, 0.4), y + SolmarUtil.rand(0.6, 1.2), z + SolmarUtil.rand(-0.4, 0.4),
        SolmarUtil.rand(-0.4, 0.4), SolmarUtil.rand(1.2, 2.2), SolmarUtil.rand(-0.4, 0.4),
        SolmarUtil.rand(0.9, 1.5), 0.16, 0.16, 0.18, -0.6);
    }
  }
  sparks(x, y, z, n) {
    for (let k = 0; k < (n || 10); k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = SolmarUtil.rand(3, 9);
      this._spawn(x, y, z, Math.cos(a) * sp, SolmarUtil.rand(1, 5), Math.sin(a) * sp,
        SolmarUtil.rand(0.25, 0.6), 1.0, 0.75, 0.2, 9);
    }
  }
  explosion(x, y, z) {
    for (let k = 0; k < 46; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = SolmarUtil.rand(2, 11);
      const pick = Math.random();
      const col = pick < 0.5 ? [1.0, 0.55, 0.1] : pick < 0.8 ? [1.0, 0.85, 0.3] : [0.25, 0.22, 0.22];
      this._spawn(x, y + SolmarUtil.rand(0, 1.5), z, Math.cos(a) * sp, SolmarUtil.rand(1, 8), Math.sin(a) * sp,
        SolmarUtil.rand(0.5, 1.2), col[0], col[1], col[2], 6);
    }
    this.smoke(x, y + 1, z, 14);
  }
  blood(x, y, z) {
    for (let k = 0; k < 8; k++) {
      this._spawn(x, y + 0.8, z, SolmarUtil.rand(-2, 2), SolmarUtil.rand(1, 3), SolmarUtil.rand(-2, 2),
        SolmarUtil.rand(0.3, 0.6), 0.55, 0.05, 0.05, 9);
    }
  }

  addSkid(x, z, angle) {
    const m = this.skids[this.skidHead];
    this.skidHead = (this.skidHead + 1) % this.skids.length;
    m.position.x = x; m.position.z = z;
    m.rotation.z = -angle;
    m.material.opacity = 0.55;
    m.userData.fade = 1;
    m.visible = true;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.positions[i * 3 + 1] = -100; continue; }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.positions[i * 3] += this.vel[i * 3] * dt;
      this.positions[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = this.life[i] / this.maxLife[i];
      this.colors[i * 3] *= (0.92 + 0.08 * f);
      this.colors[i * 3 + 1] *= (0.92 + 0.08 * f);
      this.colors[i * 3 + 2] *= (0.92 + 0.08 * f);
      if (this.positions[i * 3 + 1] < 0.05 && this.vel[i * 3 + 1] < 0) this.vel[i * 3 + 1] = 0;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    for (const m of this.skids) {
      if (!m.visible) continue;
      m.userData.fade -= dt * 0.05;
      m.material.opacity = 0.55 * Math.max(0, m.userData.fade);
      if (m.userData.fade <= 0) m.visible = false;
    }
  }
}
