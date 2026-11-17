// The HUD: a DOM overlay on top of the 3D view — health and cash, wanted stars,
// a live minimap drawn on a small canvas, the mission objective, toasts, and the
// title, briefing, pause, busted and wasted screens. All of it plain DOM/CSS.
import { CITY, MISSIONS } from './config.js';

const MINIMAP_SIZE = 190;

export function createHud(onAction) {
  const root = document.createElement('div');
  root.id = 'hud';
  document.body.appendChild(root);

  const style = document.createElement('style');
  style.textContent = `
    #hud { position: fixed; inset: 0; pointer-events: none; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #f2f4f8; z-index: 5; }
    #hud .panel { background: rgba(8, 10, 18, 0.62); border: 1px solid rgba(255,255,255,0.14); border-radius: 10px; padding: 10px 14px; backdrop-filter: blur(2px); }
    #hud-top-left { position: absolute; top: 14px; left: 14px; display: flex; flex-direction: column; gap: 8px; }
    #hud-cash { font-size: 24px; font-weight: 800; color: #7dff8a; letter-spacing: 0.5px; }
    #hud-health-wrap { width: 210px; height: 12px; background: rgba(255,255,255,0.16); border-radius: 6px; overflow: hidden; }
    #hud-health { height: 100%; width: 100%; background: linear-gradient(90deg, #37e6a0, #7dff8a); transition: width 0.15s; }
    #hud-health.low { background: linear-gradient(90deg, #ff4d4d, #ff9a3c); }
    #hud-ammo { font-size: 14px; color: #dfe6ef; }
    #hud-stars { position: absolute; top: 14px; right: 16px; font-size: 30px; letter-spacing: 4px; color: #ffd23c; text-shadow: 0 2px 8px rgba(0,0,0,0.7); }
    #hud-stars .off { color: rgba(255,255,255,0.25); }
    #hud-objective { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); max-width: 560px; text-align: center; font-size: 16px; font-weight: 600; }
    #hud-objective .sub { display: block; font-size: 13px; font-weight: 400; color: #ffd23c; margin-top: 2px; }
    #hud-speed { position: absolute; right: 16px; bottom: 210px; font-size: 30px; font-weight: 800; text-shadow: 0 2px 8px rgba(0,0,0,0.8); }
    #hud-speed small { font-size: 13px; font-weight: 400; color: #c8d0dc; }
    #hud-minimap { position: absolute; left: 14px; bottom: 14px; border: 2px solid rgba(255,255,255,0.25); border-radius: 8px; background: rgba(10,14,22,0.8); }
    #hud-toast { position: absolute; left: 50%; bottom: 120px; transform: translateX(-50%); font-size: 17px; font-weight: 600; text-align: center; text-shadow: 0 2px 6px rgba(0,0,0,0.9); max-width: 640px; }
    #hud-hint { position: absolute; right: 16px; bottom: 14px; font-size: 12.5px; line-height: 1.55; color: #c8d0dc; text-align: right; }
    #hud-screen { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: auto; background: radial-gradient(ellipse at center, rgba(5,8,16,0.25) 0%, rgba(5,8,16,0.78) 100%); }
    #hud-screen .card { width: 620px; max-width: 92vw; background: rgba(10, 14, 24, 0.92); border: 1px solid rgba(255,255,255,0.16); border-radius: 16px; padding: 30px 36px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.6); }
    #hud-screen h1 { margin: 0 0 4px; font-size: 54px; font-weight: 900; letter-spacing: 2px; background: linear-gradient(90deg, #ff4fd8, #37e6ff, #ffb347); -webkit-background-clip: text; background-clip: text; color: transparent; }
    #hud-screen h2 { margin: 0 0 10px; font-size: 30px; font-weight: 800; }
    #hud-screen p { margin: 8px 0; font-size: 15.5px; line-height: 1.55; color: #d5dce6; }
    #hud-screen .controls { font-size: 13.5px; color: #aeb8c6; line-height: 1.8; }
    #hud-screen button { pointer-events: auto; margin: 10px 6px 0; padding: 12px 26px; font-size: 16px; font-weight: 700; border: none; border-radius: 10px; background: linear-gradient(90deg, #ff4fd8, #ff8a3c); color: #fff; cursor: pointer; }
    #hud-screen button.secondary { background: rgba(255,255,255,0.14); color: #f2f4f8; }
    #hud-screen button:hover { filter: brightness(1.15); }
    #hud-screen .story { font-style: italic; color: #ffd23c; }
    #hud-banner { position: absolute; left: 50%; top: 34%; transform: translate(-50%, -50%); font-size: 44px; font-weight: 900; letter-spacing: 3px; color: #ffd23c; text-shadow: 0 4px 18px rgba(0,0,0,0.85); text-align: center; }
    #hud-banner small { display: block; font-size: 20px; letter-spacing: 1px; color: #fff; margin-top: 6px; }
  `;
  document.head.appendChild(style);

  const topLeft = document.createElement('div');
  topLeft.id = 'hud-top-left';
  topLeft.innerHTML = `
    <div class="panel"><div id="hud-cash">$0</div>
    <div id="hud-health-wrap"><div id="hud-health"></div></div>
    <div id="hud-ammo">Pistol 24 / 24</div></div>`;
  root.appendChild(topLeft);
  const cashEl = topLeft.querySelector('#hud-cash');
  const healthEl = topLeft.querySelector('#hud-health');
  const ammoEl = topLeft.querySelector('#hud-ammo');

  const starsEl = document.createElement('div');
  starsEl.id = 'hud-stars';
  root.appendChild(starsEl);

  const objectiveEl = document.createElement('div');
  objectiveEl.id = 'hud-objective';
  objectiveEl.className = 'panel';
  objectiveEl.style.display = 'none';
  root.appendChild(objectiveEl);

  const speedEl = document.createElement('div');
  speedEl.id = 'hud-speed';
  speedEl.style.display = 'none';
  root.appendChild(speedEl);

  const minimap = document.createElement('canvas');
  minimap.id = 'hud-minimap';
  minimap.width = MINIMAP_SIZE;
  minimap.height = MINIMAP_SIZE;
  root.appendChild(minimap);
  const mapCtx = minimap.getContext('2d');

  const toastEl = document.createElement('div');
  toastEl.id = 'hud-toast';
  root.appendChild(toastEl);

  const hintEl = document.createElement('div');
  hintEl.id = 'hud-hint';
  hintEl.className = 'panel';
  hintEl.innerHTML = 'WASD drive / walk &nbsp;·&nbsp; Mouse look (click to lock)<br>E enter / steal car &nbsp;·&nbsp; F punch &nbsp;·&nbsp; G shoot &nbsp;·&nbsp; R reload<br>Shift sprint &nbsp;·&nbsp; Space brake &nbsp;·&nbsp; P pause &nbsp;·&nbsp; M mute';
  root.appendChild(hintEl);

  const bannerEl = document.createElement('div');
  bannerEl.id = 'hud-banner';
  bannerEl.style.display = 'none';
  root.appendChild(bannerEl);

  const screenEl = document.createElement('div');
  screenEl.id = 'hud-screen';
  root.appendChild(screenEl);

  let toastTimer = null;
  let bannerTimer = null;

  function showScreen(html) {
    screenEl.innerHTML = html;
    screenEl.style.display = 'flex';
    for (const button of screenEl.querySelectorAll('button')) {
      button.addEventListener('click', () => onAction(button.dataset.action));
    }
  }
  function hideScreen() {
    screenEl.style.display = 'none';
    screenEl.innerHTML = '';
  }

  function showTitle(hasSave, bestCash) {
    showScreen(`
      <div class="card">
        <h1>NEON HARBOR</h1>
        <p class="story">Cahaya Bay, a neon port city. Raka, a courier with nothing left to lose, takes one last job from Mira — and the whole harbor comes after him.</p>
        <p>Explore the city on foot and by car. Steal cars, dodge the harbor police, and finish Mira's three jobs to own the streets.</p>
        <p class="controls">WASD move &amp; drive · Mouse look (click to lock) · E enter / steal car · F punch · G shoot · R reload<br>Shift sprint · Space brake · P pause · M mute</p>
        ${hasSave ? `<p>Saved game: $${bestCash.toLocaleString('en-US')} earned so far.</p>` : ''}
        <button data-action="new">New Game</button>
        ${hasSave ? '<button data-action="continue" class="secondary">Continue</button>' : ''}
        <p style="font-size:12px;color:#8b93a3">An original game made for make.fun's “Make GTA 6” bounty. Not affiliated with Rockstar Games.</p>
      </div>`);
  }

  function showBriefing(mission) {
    showScreen(`
      <div class="card">
        <h2>${mission.title}</h2>
        <p class="story">From ${mission.giver} — reward $${mission.reward} · ${mission.timeLimit}s on the clock</p>
        <p>${mission.briefing}</p>
        <button data-action="accept">Take the job</button>
        <button data-action="decline" class="secondary">Not yet</button>
      </div>`);
  }

  function showPaused() {
    showScreen(`
      <div class="card">
        <h2>Paused</h2>
        <p>The harbor waits for no one — but it will wait for you.</p>
        <button data-action="resume">Resume</button>
        <button data-action="quit" class="secondary">Quit to title</button>
      </div>`);
  }

  function showBusted(cashLost) {
    showScreen(`
      <div class="card">
        <h2>BUSTED</h2>
        <p>The harbor police dragged you in. You lost $${cashLost} in fines and the heat is off — for now.</p>
        <button data-action="respawn">Back to the streets</button>
      </div>`);
  }

  function showWasted(cashLost) {
    showScreen(`
      <div class="card">
        <h2>WASTED</h2>
        <p>You woke up at the harbor clinic, lighter by $${cashLost}. Cahaya Bay doesn't forgive — but it forgets.</p>
        <button data-action="respawn">Back to the streets</button>
      </div>`);
  }

  function showStoryComplete(totalEarned) {
    showScreen(`
      <div class="card">
        <h2>THE CITY IS YOURS</h2>
        <p class="story">All three of Mira's jobs are done. The ledger is back, the heat is gone, and Neon Harbor belongs to Raka.</p>
        <p>Total earned: $${totalEarned}. Free roam continues — keep the streets, or keep the chaos.</p>
        <button data-action="freeroam">Keep playing</button>
      </div>`);
  }

  function toast(text, seconds) {
    toastEl.textContent = text;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.textContent = ''; }, (seconds || 4) * 1000);
  }

  function banner(title, sub, seconds) {
    bannerEl.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    bannerEl.style.display = 'block';
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { bannerEl.style.display = 'none'; }, (seconds || 2.6) * 1000);
  }

  function setCash(value) {
    cashEl.textContent = `$${value.toLocaleString('en-US')}`;
  }

  function setHealth(value) {
    healthEl.style.width = `${Math.max(0, Math.min(100, value))}%`;
    healthEl.classList.toggle('low', value < 35);
  }

  function setAmmo(loaded, reserve) {
    ammoEl.textContent = `Pistol ${loaded} / ${reserve}`;
  }

  function setStars(count) {
    let html = '';
    for (let i = 0; i < 5; i += 1) {
      html += `<span class="${i < count ? '' : 'off'}">★</span>`;
    }
    starsEl.innerHTML = html;
  }

  function setObjective(title, sub) {
    if (!title) {
      objectiveEl.style.display = 'none';
      return;
    }
    objectiveEl.style.display = 'block';
    objectiveEl.innerHTML = `${title}${sub ? `<span class="sub">${sub}</span>` : ''}`;
  }

  function setSpeed(kmh, driving) {
    if (!driving) {
      speedEl.style.display = 'none';
      return;
    }
    speedEl.style.display = 'block';
    speedEl.innerHTML = `${Math.round(kmh)} <small>km/h</small>`;
  }

  /** Draw the minimap: roads, the player arrow, cars, police, the objective. */
  function drawMinimap(state) {
    const ctx = mapCtx;
    const size = MINIMAP_SIZE;
    const scale = size / (CITY.half * 2 + 40);
    const toMap = (v) => (v + CITY.half + 20) * scale;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#11141d';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#3a3f47';
    for (const line of CITY.roadLines) {
      ctx.fillRect(toMap(line - CITY.roadWidth / 2), 0, CITY.roadWidth * scale, size);
      ctx.fillRect(0, toMap(line - CITY.roadWidth / 2), size, CITY.roadWidth * scale);
    }
    ctx.fillStyle = '#123a5c';
    ctx.fillRect(0, toMap(CITY.half), size, size - toMap(CITY.half));
    const dot = (x, z, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(toMap(x), toMap(z), r, 0, Math.PI * 2);
      ctx.fill();
    };
    if (state.objectivePos) dot(state.objectivePos.x, state.objectivePos.z, '#ffd23c', 5);
    for (const car of state.cars) {
      if (car.kind === 'police') dot(car.x, car.z, '#ff3b30', 3);
      else if (car.kind === 'player') continue;
      else dot(car.x, car.z, 'rgba(255,255,255,0.75)', 2);
    }
    for (const cop of state.cops) dot(cop.x, cop.z, '#ff3b30', 2.5);
    // Player arrow.
    const px = toMap(state.playerX);
    const pz = toMap(state.playerZ);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(state.playerHeading);
    ctx.fillStyle = '#37e6ff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function setInGameVisible(visible) {
    for (const el of [topLeft, starsEl, minimap, hintEl]) el.style.display = visible ? '' : 'none';
    if (!visible) {
      objectiveEl.style.display = 'none';
      speedEl.style.display = 'none';
    }
  }

  return {
    showTitle,
    showBriefing,
    showPaused,
    showBusted,
    showWasted,
    showStoryComplete,
    showScreen,
    hideScreen,
    toast,
    banner,
    setCash,
    setHealth,
    setAmmo,
    setStars,
    setObjective,
    setSpeed,
    drawMinimap,
    setInGameVisible,
  };
}
