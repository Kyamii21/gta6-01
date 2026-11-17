// The HUD: DOM panels for money, wanted stars, health, speed and the
// objective, plus a live top-down minimap drawn on a 2D canvas.
import { fmtMoney, fmtTime } from './rng.js';
import { STREET_COORDS, ROAD_HALF, BEACH_START, OCEAN_START } from './city.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  const minimap = $('minimap');
  return {
    minimapCtx: minimap.getContext('2d'),
    lastStarHtml: '',
    bannerTimer: null,
    toastTimer: null,
  };
}

export function showHudParts(show) {
  for (const id of ['objective', 'stats', 'minimapWrap', 'speedo', 'hint']) {
    $(id).classList.toggle('hidden', !show);
  }
}

export function setObjective(title, desc, timerSeconds) {
  $('objTitle').textContent = title;
  $('objDesc').textContent = desc;
  const timer = $('objTimer');
  if (timerSeconds > 0) {
    timer.classList.remove('hidden');
    timer.textContent = '⏱ ' + fmtTime(timerSeconds);
  } else {
    timer.classList.add('hidden');
  }
}

export function setMoney(amount) {
  $('money').textContent = fmtMoney(amount);
}

export function setWantedStars(hud, stars) {
  let html = '';
  for (let i = 0; i < 5; i++) {
    html += i < stars ? '★' : '<span class="off">★</span>';
  }
  if (html !== hud.lastStarHtml) {
    $('stars').innerHTML = html;
    hud.lastStarHtml = html;
  }
}

export function setHealth(hp) {
  const fill = $('healthfill');
  fill.style.width = Math.max(0, Math.min(100, hp)) + '%';
  fill.style.background = hp > 50
    ? 'linear-gradient(90deg, #37d67a, #a5e34a)'
    : hp > 25 ? 'linear-gradient(90deg, #e8a13a, #e8d44a)' : 'linear-gradient(90deg, #d63a37, #e84a4a)';
}

export function setSpeed(mph, inCar, gearText) {
  $('speedo').classList.toggle('hidden', !inCar);
  if (!inCar) return;
  $('speed').innerHTML = `${Math.round(mph)} <small>mph</small>`;
  $('gear').textContent = gearText || '';
}

export function showBanner(hud, title, sub, color) {
  const banner = $('banner');
  banner.innerHTML = title + (sub ? `<div class="sub">${sub}</div>` : '');
  banner.style.color = color || '#ffd23e';
  banner.style.opacity = '1';
  clearTimeout(hud.bannerTimer);
  hud.bannerTimer = setTimeout(() => { banner.style.opacity = '0'; }, 2600);
}

export function showToast(hud, text) {
  const toast = $('toast');
  toast.textContent = text;
  toast.style.opacity = '1';
  clearTimeout(hud.toastTimer);
  hud.toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 3200);
}

export function setCompass(target, playerX, playerZ, camYaw) {
  const el = $('compass');
  if (!target) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  const dx = target.x - playerX;
  const dz = target.z - playerZ;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const worldAngle = Math.atan2(dx, dz);
  // Rotate the arrow so it points toward the target relative to the camera.
  const rel = worldAngle - camYaw;
  const arrows = ['▲', '⬈', '▶', '⬊', '▼', '⬋', '◀', '⬉'];
  const idx = Math.round(((rel % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 4)) % 8;
  el.firstChild.textContent = arrows[idx] + ' ';
  $('compassDist').textContent = Math.round(dist) + 'm';
}

export function setDamageFlash(amount) {
  $('vignette').style.opacity = String(Math.max(0, Math.min(1, amount)));
}

// --- minimap ----------------------------------------------------------------
const MAP_MIN = -240;
const MAP_MAX = 320; // covers the city plus the ocean edge
const MAP_SPAN = MAP_MAX - MAP_MIN;

function toMap(v, size) {
  return ((v - MAP_MIN) / MAP_SPAN) * size;
}

export function drawMinimap(hud, state) {
  const ctx = hud.minimapCtx;
  const S = 190;
  ctx.clearRect(0, 0, S, S);
  // Ocean and sand.
  ctx.fillStyle = '#2f7fb8';
  ctx.fillRect(0, toMap(OCEAN_START, S), S, S - toMap(OCEAN_START, S));
  ctx.fillStyle = '#e3c98f';
  ctx.fillRect(0, toMap(BEACH_START, S), S, toMap(OCEAN_START, S) - toMap(BEACH_START, S));
  // Land.
  ctx.fillStyle = '#9a948a';
  ctx.fillRect(0, 0, S, toMap(BEACH_START, S));
  // Park.
  ctx.fillStyle = '#4d8a3f';
  ctx.fillRect(toMap(-154, S), toMap(-74, S), toMap(-86, S) - toMap(-154, S), toMap(-6, S) - toMap(-74, S));
  // Roads.
  ctx.strokeStyle = '#3a3d42';
  ctx.lineWidth = 4;
  for (const c of STREET_COORDS) {
    ctx.beginPath(); ctx.moveTo(toMap(c, S), toMap(-220, S)); ctx.lineTo(toMap(c, S), toMap(220, S)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(toMap(-220, S), toMap(c, S)); ctx.lineTo(toMap(220, S), toMap(c, S)); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(toMap(-220, S), toMap(252, S)); ctx.lineTo(toMap(220, S), toMap(252, S)); ctx.stroke();
  // Mission target.
  if (state.missionTarget) {
    const mx = toMap(state.missionTarget.x, S);
    const my = toMap(state.missionTarget.z, S);
    ctx.fillStyle = '#ffd23e';
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(Math.PI / 4);
    const pulse = 5 + Math.sin(state.time * 4) * 1.5;
    ctx.fillRect(-pulse, -pulse, pulse * 2, pulse * 2);
    ctx.restore();
  }
  // Traffic as grey dots, police as blue, player as a white arrow.
  for (const car of state.traffic) {
    ctx.fillStyle = '#d7d7d7';
    ctx.fillRect(toMap(car.x, S) - 1.5, toMap(car.z, S) - 1.5, 3, 3);
  }
  for (const car of state.police) {
    ctx.fillStyle = '#3a86ff';
    ctx.beginPath();
    ctx.arc(toMap(car.x, S), toMap(car.z, S), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const px = toMap(state.playerX, S);
  const py = toMap(state.playerZ, S);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(state.playerHeading);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4.5, 5);
  ctx.lineTo(-4.5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // North tick.
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = 'bold 11px Arial';
  ctx.fillText('N', S - 14, 14);
}
