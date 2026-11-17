// Solmar — the HUD: money, wanted stars, health, speed, mission objective,
// a live minimap, toasts, and the start / pause / game-over screens.

class SolmarHud {
  constructor(game) {
    this.game = game;
    this.el = {};
    for (const id of ['hud', 'money', 'stars', 'healthFill', 'healthNum', 'speed', 'speedUnit', 'objective', 'toast', 'minimap', 'menu', 'menuTitle', 'menuBody', 'menuBtn', 'menuBtn2', 'over', 'overTitle', 'overStats', 'overBtn', 'pause', 'pauseBtn', 'help', 'timer']) {
      this.el[id] = document.getElementById(id);
    }
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = null;
    this.onStart = null;
    this.onRestart = null;
    this.onResume = null;
    this.el.menuBtn.addEventListener('click', () => { if (this.onStart) this.onStart(); });
    this.el.menuBtn2.addEventListener('click', () => { if (this.onStart) this.onStart(true); });
    this.el.overBtn.addEventListener('click', () => { if (this.onRestart) this.onRestart(); });
    this.el.pauseBtn.addEventListener('click', () => { if (this.onResume) this.onResume(); });
  }

  showMenu(saved) {
    this.el.menu.style.display = 'flex';
    this.el.hud.style.display = 'none';
    this.el.over.style.display = 'none';
    this.el.pause.style.display = 'none';
    this.el.menuTitle.textContent = 'SOLMAR';
    this.el.menuBody.innerHTML =
      'A sun-soaked open world on the Solmar coast. You are <b>Leo Marin</b>, fresh out of the ' +
      'slammer and broke. Mama Rosa has five jobs for you — cars to steal, packages to run, ' +
      'cops to lose, and one last big score at Solmar National Bank.<br><br>' +
      '<b>WASD</b> move / drive &nbsp;·&nbsp; <b>Shift</b> run &nbsp;·&nbsp; <b>E</b> enter car / crack vault &nbsp;·&nbsp; ' +
      '<b>F</b> punch &nbsp;·&nbsp; <b>Space</b> handbrake &nbsp;·&nbsp; <b>Mouse drag</b> look &nbsp;·&nbsp; ' +
      '<b>Esc</b> pause &nbsp;·&nbsp; <b>M</b> mute';
    this.el.menuBtn.textContent = saved ? 'CONTINUE' : 'START THE STORY';
    this.el.menuBtn2.style.display = saved ? 'inline-block' : 'none';
    this.el.menuBtn2.textContent = 'NEW GAME';
  }

  showHud() {
    this.el.menu.style.display = 'none';
    this.el.over.style.display = 'none';
    this.el.pause.style.display = 'none';
    this.el.hud.style.display = 'block';
  }

  showPause() { this.el.pause.style.display = 'flex'; }
  hidePause() { this.el.pause.style.display = 'none'; }

  showOver(title, stats) {
    this.el.over.style.display = 'flex';
    this.el.hud.style.display = 'none';
    this.el.overTitle.textContent = title;
    this.el.overStats.innerHTML = stats;
    this.el.overBtn.textContent = 'PLAY AGAIN';
  }

  toast(text, ms) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.el.toast.style.opacity = '0'; }, ms || 3600);
  }

  setMoney(v) { this.el.money.textContent = '$' + v.toLocaleString('en-US'); }
  setWanted(n) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    this.el.stars.textContent = s;
    this.el.stars.style.color = n >= 3 ? '#ff4444' : n > 0 ? '#ffd319' : '#888888';
  }
  setHealth(v) {
    const pct = Math.max(0, Math.round(v));
    this.el.healthFill.style.width = pct + '%';
    this.el.healthFill.style.background = pct > 50 ? '#37c26a' : pct > 25 ? '#e8b93a' : '#e83a3a';
    this.el.healthNum.textContent = pct;
  }
  setSpeed(kmh, driving) {
    this.el.speed.style.display = driving ? 'block' : 'none';
    if (driving) this.el.speed.querySelector('b').textContent = Math.round(kmh);
  }
  setObjective(text, timerText) {
    this.el.objective.textContent = text || '';
    this.el.timer.textContent = timerText || '';
  }

  // ---- minimap: north-up, player-centred, 200 m across ---------------
  drawMinimap(game) {
    const ctx = this.mapCtx;
    const S = 168, R = S / 2;
    const px = game.playerCar ? game.playerCar.x : game.player.x;
    const pz = game.playerCar ? game.playerCar.z : game.player.z;
    const scale = S / 220; // 220 world units across the map
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(10,14,20,0.82)';
    ctx.fillRect(0, 0, S, S);
    const toMap = (wx, wz) => [R + (wx - px) * scale, R + (wz - pz) * scale];
    // Water + sand at the south.
    ctx.fillStyle = '#1f7fa8';
    const [, wy] = toMap(0, 330);
    if (wy < S) ctx.fillRect(0, Math.max(0, wy), S, S - Math.max(0, wy));
    ctx.fillStyle = '#e3c98f';
    const [, sy] = toMap(0, 268);
    if (sy < S) ctx.fillRect(0, Math.max(0, sy), S, Math.min(S, wy) - Math.max(0, sy));
    // Roads.
    ctx.strokeStyle = '#5a6068';
    ctx.lineWidth = 3;
    for (const line of CITY.ROAD_LINES) {
      const [ax] = toMap(line, 0);
      ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, S); ctx.stroke();
      const [, bz] = toMap(0, line);
      ctx.beginPath(); ctx.moveTo(0, bz); ctx.lineTo(S, bz); ctx.stroke();
    }
    // Park.
    ctx.fillStyle = '#5d9b4a';
    const [pkx, pky] = toMap(29, 29);
    ctx.fillRect(pkx - 11 * scale, pky - 11 * scale, 22 * scale, 22 * scale);
    // Mission marker.
    if (game.missions.marker) {
      const [mx, my] = toMap(game.missions.marker.x, game.missions.marker.z);
      const pulse = 6 + Math.sin(performance.now() / 240) * 2;
      ctx.fillStyle = '#ffd319';
      ctx.beginPath(); ctx.arc(mx, my, pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', mx, my);
    }
    // Traffic cars (white dots) and cops (blue/red).
    ctx.fillStyle = '#ffffff';
    for (const car of game.traffic.cars) {
      if (car.dead) continue;
      const [cx, cy] = toMap(car.x, car.z);
      if (cx < 0 || cx > S || cy < 0 || cy > S) continue;
      ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
    for (const cop of game.police.cops) {
      const [cx, cy] = toMap(cop.x, cop.z);
      if (cx < 0 || cx > S || cy < 0 || cy > S) continue;
      ctx.fillStyle = Math.floor(performance.now() / 300) % 2 ? '#ff3333' : '#3388ff';
      ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow (points along heading).
    const heading = game.playerCar ? game.playerCar.angle : game.player.heading;
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(Math.PI - heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5.5, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // North tick.
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('N', 6, 4);
  }
}
