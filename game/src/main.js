// Costa Luna — bootstrap, game loop and the wiring between every system.
// States: menu -> playing <-> paused, playing -> wasted | busted | legend.
import * as THREE from 'three';
import { makeRng, clamp, dist2d, fmtMoney } from './rng.js';
import { buildCity, STREET_COORDS, BEACH_ROAD_Z } from './city.js';
import { createCar, drivePlayerCar, makeTrafficCar, updateTrafficCar, syncCar } from './cars.js';
import { createPlayer, setPlayerPos, updatePlayer, createCameraRig, rigPointerDown, rigPointerMove, rigPointerUp, updateCameraRig } from './player.js';
import { spawnPedestrians, updatePedestrians, nearestPed } from './peds.js';
import { createPoliceSystem, addWanted, setWanted, updatePolice, clearPolice } from './police.js';
import { createMissionSystem, currentMission, currentStage, startMission, updateMissions, missionProgressText, resetMissions } from './missions.js';
import { createParticles, burst, updateParticles } from './particles.js';
import { createAudio } from './audio.js';
import { createHud, showHudParts, setObjective, setMoney, setWantedStars, setHealth, setSpeed, showBanner, showToast, setCompass, setDamageFlash, drawMinimap } from './hud.js';
import { setupShot, SHOT_NAMES } from './shots.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') || 7);
const SAVE_KEY = 'costa-luna-save-v1';
const SPAWN = { x: 0, z: 10, heading: 2.9 }; // facing the red sports car

window.__costaErrors = [];
window.addEventListener('error', (e) => window.__costaErrors.push(String(e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => window.__costaErrors.push('rejection: ' + String(e.reason)));

// --- renderer and scene ------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.className = 'game';
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec7ee);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1400);

const rng = makeRng(SEED);
const cityApi = buildCity(scene, SEED);
const colliders = cityApi.colliders;
const particles = createParticles(scene);
const audio = createAudio();
const hud = createHud();
const rig = createCameraRig(camera);

// --- world state -------------------------------------------------------------
const state = {
  mode: 'menu', // menu | playing | paused | wasted | busted | legend
  money: 0,
  missionIndex: 0,
  completedMissions: [],
  playSeconds: 0,
  topSpeed: 0,
  inCar: false,
  car: null,
  lastDamageAt: -99,
  elapsed: 0,
  shake: 0,
  minimapAt: 0,
  retryCount: 0,
};

const player = createPlayer(scene);
setPlayerPos(player, SPAWN.x, SPAWN.z, SPAWN.heading);
const policeSys = createPoliceSystem(scene, rng);
const missions = createMissionSystem(scene);

// The red sports car for mission 1, parked by the garage corner.
const sportsCar = createCar(scene, { model: 'sport', color: 0xc0392b, x: 6, z: -14, heading: 2.4, name: 'sports-car' });
// A few parked cars to steal around the city.
const parkedCars = [sportsCar];
const parkedSpots = [
  { model: 'sedan', color: 0x2e86c1, x: -86, z: 6, heading: 1.57 },
  { model: 'taxi', color: 0xf1c40f, x: 86, z: -6, heading: -1.57 },
  { model: 'sedan', color: 0x16a085, x: 166, z: 86, heading: 3.1 },
  { model: 'sport', color: 0x8e44ad, x: -166, z: -166, heading: 0 },
  { model: 'sedan', color: 0xe67e22, x: 6, z: 166, heading: -1.57 },
];
for (const spot of parkedSpots) parkedCars.push(createCar(scene, { ...spot, name: 'parked' }));

// Traffic on loops around random blocks.
const traffic = [];
const blockCenters = [];
for (const bx of [-120, -40, 40, 120]) for (const bz of [-120, -40, 40, 120]) blockCenters.push([bx, bz]);
for (let i = 0; i < 12; i++) {
  const [bx, bz] = blockCenters[i % blockCenters.length];
  traffic.push(makeTrafficCar(scene, rng, bx + (i % 2 === 0 ? 0 : 80), bz));
}
const peds = spawnPedestrians(scene, rng, 16, colliders);

// --- save / load ---------------------------------------------------------------
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number') return null;
    return data;
  } catch { return null; }
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: state.money,
      missionIndex: state.missionIndex,
      completedMissions: state.completedMissions,
      playSeconds: Math.round(state.playSeconds),
      topSpeed: Math.round(state.topSpeed),
    }));
  } catch { /* storage unavailable: the run still works */ }
}

// --- input ---------------------------------------------------------------------
const keys = {};
const input = { forward: false, back: false, left: false, right: false, run: false, handbrake: false };
function refreshInput() {
  input.forward = !!(keys.KeyW || keys.ArrowUp);
  input.back = !!(keys.KeyS || keys.ArrowDown);
  input.left = !!(keys.KeyA || keys.ArrowLeft);
  input.right = !!(keys.KeyD || keys.ArrowRight);
  input.run = !!keys.ShiftLeft || !!keys.ShiftRight;
  input.handbrake = !!keys.Space;
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  keys[e.code] = true;
  refreshInput();
  if (e.code === 'KeyE' && state.mode === 'playing') tryEnterExitCar();
  if (e.code === 'KeyF' && state.mode === 'playing' && !state.inCar) tryPunch();
  if ((e.code === 'KeyP' || e.code === 'Escape') && (state.mode === 'playing' || state.mode === 'paused')) togglePause();
  if (e.code === 'KeyM') audio.setMuted(!audio.muted);
  if (e.code === 'KeyR' && (state.mode === 'wasted' || state.mode === 'busted')) retryRun();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; refreshInput(); });
renderer.domElement.addEventListener('pointerdown', (e) => rigPointerDown(rig, e.clientX, e.clientY));
window.addEventListener('pointermove', (e) => rigPointerMove(rig, e.clientX, e.clientY));
window.addEventListener('pointerup', () => rigPointerUp(rig));
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- car enter / exit ------------------------------------------------------------
function nearestStealableCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of parkedCars) {
    const d = dist2d(player.x, player.z, car.x, car.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  for (const car of traffic) {
    const d = dist2d(player.x, player.z, car.x, car.z);
    if (d < bestD && car.speed < 4) { bestD = d; best = car; }
  }
  return best;
}

function putPlayerInCar(car) {
  state.inCar = true;
  state.car = car;
  car.isPlayer = true;
  const ti = traffic.indexOf(car);
  if (ti !== -1) traffic.splice(ti, 1);
  const pi = parkedCars.indexOf(car);
  if (pi !== -1) parkedCars.splice(pi, 1);
  player.group.visible = false;
  player.visible = false;
  audio.unlock();
}

function tryEnterExitCar() {
  if (!state.inCar) {
    const car = nearestStealableCar(5.5);
    if (!car) return;
    putPlayerInCar(car);
    if (car !== sportsCar) {
      addWanted(policeSys, 1);
      showToast(hud, 'Car stolen — the cops noticed! (+1 ★)');
    } else {
      showToast(hud, 'Nice wheels. Now get to the lockup.');
    }
    audio.pickup();
  } else {
    const car = state.car;
    state.inCar = false;
    state.car = null;
    car.isPlayer = false;
    car.speed = 0;
    parkedCars.push(car);
    const side = Math.cos(car.heading) >= 0 ? 1 : -1;
    setPlayerPos(player, car.x + Math.cos(car.heading) * 2.4 * side, car.z - Math.sin(car.heading) * 2.4 * side, car.heading);
  }
}

function tryPunch() {
  const ped = nearestPed(peds, player.x, player.z, 2.4);
  if (!ped) return;
  audio.punch();
  ped.group.rotation.x = -1.2;
  setTimeout(() => { ped.group.rotation.x = 0; }, 450);
  ped.fleeing = 3;
  ped.target = { x: clamp(ped.x + (ped.x - player.x) * 2, -215, 215), z: clamp(ped.z + (ped.z - player.z) * 2, -215, 290) };
  burst(particles, ped.x, 1.4, ped.z, 'gold', 8);
  addWanted(policeSys, 1);
  showToast(hud, 'Assault! The cops are coming. (+1 ★)');
}

// --- missions ---------------------------------------------------------------------
function beginMission(index) {
  const m = startMission(missions, index, {
    setWanted: (n) => setWanted(policeSys, n),
    toast: (t) => showToast(hud, t),
  });
  if (!m) return;
  setObjective(m.title, m.desc, 0);
  showBanner(hud, m.title, m.desc, '#ffd23e');
}

function handleMissionEvent(ev) {
  if (!ev) return;
  if (ev.type === 'complete') {
    state.money += ev.reward;
    state.completedMissions.push(ev.mission.id);
    state.missionIndex = missions.index;
    setMoney(state.money);
    audio.jingle();
    burst(particles, player.x, 2, player.z, 'gold', 26);
    showBanner(hud, 'MISSION COMPLETE', `+${fmtMoney(ev.reward)} — ${ev.mission.title}`, '#7dff8a');
    showToast(hud, `Earned ${fmtMoney(ev.reward)}. Total ${fmtMoney(state.money)}.`);
    saveGame();
    if (ev.allDone) {
      setTimeout(() => showLegend(), 1800);
    } else {
      setTimeout(() => beginMission(missions.index), 2200);
    }
  } else if (ev.type === 'failed') {
    audio.fail();
    showBanner(hud, 'MISSION FAILED', ev.reason + ' Try again.', '#ff5a4e');
    setTimeout(() => beginMission(missions.index), 2200);
  } else if (ev.type === 'stage') {
    audio.pickup();
    showToast(hud, ev.label);
    const m = currentMission(missions);
    if (m) setObjective(m.title, ev.label, missions.timer);
  }
}

// --- run flow ---------------------------------------------------------------------
function startRun(fromSave) {
  const save = fromSave ? loadSave() : null;
  state.money = save ? save.money : 0;
  state.missionIndex = save ? Math.min(save.missionIndex, 4) : 0;
  state.completedMissions = save ? save.completedMissions || [] : [];
  state.playSeconds = save ? save.playSeconds || 0 : 0;
  state.topSpeed = save ? save.topSpeed || 0 : 0;
  state.mode = 'playing';
  state.inCar = false;
  state.car = null;
  player.health = 100;
  setPlayerPos(player, SPAWN.x, SPAWN.z, SPAWN.heading);
  clearPolice(policeSys);
  resetMissions(missions);
  setMoney(state.money);
  setHealth(100);
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('endScreen').classList.add('hidden');
  document.getElementById('pauseMenu').classList.add('hidden');
  showHudParts(true);
  audio.unlock();
  beginMission(state.missionIndex);
}

function togglePause() {
  if (state.mode === 'playing') {
    state.mode = 'paused';
    document.getElementById('pauseMenu').classList.remove('hidden');
  } else if (state.mode === 'paused') {
    state.mode = 'playing';
    document.getElementById('pauseMenu').classList.add('hidden');
  }
}

function endRun(kind) {
  state.mode = kind; // 'wasted' | 'busted'
  audio.setSiren(false);
  audio.setEngine(0, false);
  if (kind === 'wasted') audio.fail();
  else audio.busted();
  const title = document.getElementById('endTitle');
  title.textContent = kind.toUpperCase();
  title.className = kind;
  document.getElementById('endStats').innerHTML =
    `Cash: <b>${fmtMoney(state.money)}</b> &nbsp;·&nbsp; Missions done: <b>${state.completedMissions.length} / 5</b><br>` +
    `Time in the city: <b>${Math.floor(state.playSeconds / 60)}:${String(Math.floor(state.playSeconds % 60)).padStart(2, '0')}</b> &nbsp;·&nbsp; Top speed: <b>${Math.round(state.topSpeed)} mph</b><br>` +
    `The cops keep the cash you had on the run. Your save keeps your progress.`;
  document.getElementById('endScreen').classList.remove('hidden');
  showHudParts(false);
}

function showLegend() {
  state.mode = 'legend';
  audio.jingle();
  const title = document.getElementById('endTitle');
  title.textContent = 'CITY LEGEND';
  title.className = 'legend';
  document.getElementById('endStats').innerHTML =
    `All five jobs done. Luna's crew runs Costa Luna now — and Marco's name is on every street.<br>` +
    `Cash: <b>${fmtMoney(state.money)}</b> &nbsp;·&nbsp; Time: <b>${Math.floor(state.playSeconds / 60)}:${String(Math.floor(state.playSeconds % 60)).padStart(2, '0')}</b><br>` +
    `Free roam unlocked: keep driving, the city is yours.`;
  document.getElementById('btnRetry').textContent = 'KEEP DRIVING';
  document.getElementById('endScreen').classList.remove('hidden');
  showHudParts(false);
  saveGame();
}

function retryRun() {
  document.getElementById('btnRetry').textContent = 'TRY AGAIN';
  if (state.mode === 'legend') {
    document.getElementById('endScreen').classList.add('hidden');
    showHudParts(true);
    state.mode = 'playing';
    return;
  }
  document.getElementById('endScreen').classList.add('hidden');
  state.mode = 'playing';
  player.health = 100;
  setHealth(100);
  clearPolice(policeSys);
  if (state.inCar && state.car) {
    state.car.isPlayer = false;
    state.car.speed = 0;
    parkedCars.push(state.car);
    state.car = null;
    state.inCar = false;
  }
  setPlayerPos(player, SPAWN.x, SPAWN.z, SPAWN.heading);
  showHudParts(true);
  beginMission(state.missionIndex);
}

document.getElementById('btnStart').addEventListener('click', () => startRun(false));
document.getElementById('btnContinue').addEventListener('click', () => startRun(true));
document.getElementById('btnResume').addEventListener('click', () => togglePause());
document.getElementById('btnRestart').addEventListener('click', () => {
  document.getElementById('pauseMenu').classList.add('hidden');
  localStorage.removeItem(SAVE_KEY);
  startRun(false);
});
document.getElementById('btnQuit').addEventListener('click', () => {
  document.getElementById('pauseMenu').classList.add('hidden');
  state.mode = 'menu';
  showHudParts(false);
  document.getElementById('menu').classList.remove('hidden');
});
document.getElementById('btnRetry').addEventListener('click', () => retryRun());
document.getElementById('btnEndMenu').addEventListener('click', () => {
  document.getElementById('endScreen').classList.add('hidden');
  document.getElementById('btnRetry').textContent = 'TRY AGAIN';
  state.mode = 'menu';
  showHudParts(false);
  document.getElementById('menu').classList.remove('hidden');
});

// Continue button appears when a save exists.
const existingSave = loadSave();
if (existingSave && existingSave.missionIndex > 0) {
  document.getElementById('contMission').textContent = String(existingSave.missionIndex + 1);
  document.getElementById('btnContinue').classList.remove('hidden');
}

// --- screenshot-mode API (used by shots.js) ---------------------------------------
const shotApi = {
  player, rig, state,
  cityApi, traffic, policeSys, missions,
  setTimeOfDay(t) { cityApi.update(t * 360); },
  placePlayerOnFoot(x, z, heading) {
    if (state.inCar && state.car) { state.car.isPlayer = false; parkedCars.push(state.car); state.car = null; state.inCar = false; }
    setPlayerPos(player, x, z, heading);
  },
  spawnPlayerCar(model, color, x, z, heading) {
    const car = createCar(scene, { model, color, x, z, heading, name: 'shot-car' });
    return car;
  },
  putPlayerInCar(car) { putPlayerInCar(car); },
  setWanted(n) { setWanted(policeSys, n); },
  startMissionAt(index) {
    resetMissions(missions);
    const m = startMission(missions, index, {
      setWanted: (n) => setWanted(policeSys, n),
      toast: (t) => showToast(hud, t),
    });
    if (m) setObjective(m.title, missionProgressText(missions), 0);
    state.missionIndex = index;
  },
  placePoliceNear(x, z, count) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + 0.4;
      const px = clamp(x + Math.sin(angle) * rng.range(14, 26), -215, 215);
      const pz = clamp(z + Math.cos(angle) * rng.range(14, 26), -215, 285);
      const car = createCar(scene, { model: 'police', x: px, z: pz, heading: Math.atan2(x - px, z - pz), name: 'police' });
      car.isPolice = true;
      policeSys.policeCars.push(car);
    }
  },
};

if (SHOT && SHOT_NAMES.includes(SHOT)) {
  document.getElementById('menu').classList.add('hidden');
  state.mode = 'playing';
  state.money = 1250;
  setMoney(1250);
  showHudParts(true);
  setupShot(SHOT, shotApi);
  window.__costaShotReady = true;
}

// --- main loop -----------------------------------------------------------------------
const clock = new THREE.Clock();
let frames = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  state.elapsed += dt;
  if (state.mode === 'playing') state.playSeconds += dt;

  if (state.mode === 'playing' || state.mode === 'legend' || SHOT) {
    // --- player ---------------------------------------------------------------
    if (state.inCar && state.car) {
      const car = state.car;
      const before = car.speed;
      drivePlayerCar(car, input, dt, colliders, (strength) => {
        player.health -= strength * 0.55;
        state.lastDamageAt = state.elapsed;
        state.shake = Math.min(1, strength * 0.03);
        burst(particles, car.x, 1, car.z, 'spark', 16);
        audio.crash(strength);
        setDamageFlash(0.7);
        setTimeout(() => setDamageFlash(0), 260);
      });
      state.topSpeed = Math.max(state.topSpeed, Math.abs(car.speed) * 2.237);
      if (Math.abs(car.speed) > 2) {
        // Skid smoke while handbraking, exhaust puffs while accelerating.
        if (input.handbrake) burst(particles, car.x - Math.sin(car.heading) * 2, 0.3, car.z - Math.cos(car.heading) * 2, 'smoke', 2);
      }
      // Running over a pedestrian at speed.
      for (const ped of peds) {
        if (Math.abs(car.speed) > 8 && dist2d(car.x, car.z, ped.x, ped.z) < 2.2 && ped.fleeing <= 0) {
          ped.fleeing = 3;
          ped.group.rotation.x = -1.4;
          setTimeout(() => { ped.group.rotation.x = 0; }, 600);
          addWanted(policeSys, 1);
          showToast(hud, 'You hit a pedestrian! (+1 ★)');
          burst(particles, ped.x, 1.2, ped.z, 'gold', 8);
        }
      }
      if (car.z > 290) { car.z = 290; car.speed *= 0.5; }
      car.x = clamp(car.x, -232, 232);
      // Camera target is the car.
      updateCameraRig(rig, car.x, 0, car.z, car.heading, true, dt);
      setSpeed(Math.abs(car.speed) * 2.237, true, car.speed > 0.5 ? (car.speed > 28 ? 'D4' : car.speed > 16 ? 'D3' : car.speed > 7 ? 'D2' : 'D1') : car.speed < -0.5 ? 'R' : 'N');
      audio.setEngine(Math.abs(car.speed) / car.spec.topSpeed, true);
      void before;
    } else {
      updatePlayer(player, input, rig.yaw, dt, colliders);
      if (player.z > 294) player.z = 294;
      player.x = clamp(player.x, -232, 232);
      updateCameraRig(rig, player.x, 0, player.z, player.heading, false, dt);
      setSpeed(0, false, '');
      audio.setEngine(0, false);
    }

    // --- traffic, pedestrians, police -----------------------------------------
    const allCars = [...traffic, ...parkedCars, ...policeSys.policeCars];
    if (state.car) allCars.push(state.car);
    for (const car of [...traffic]) updateTrafficCar(car, dt, colliders, allCars);
    const danger = state.inCar && state.car && Math.abs(state.car.speed) > 10
      ? { x: state.car.x, z: state.car.z }
      : policeSys.wanted > 0 ? { x: player.x, z: player.z } : null;
    updatePedestrians(peds, dt, colliders, rng, danger);

    const bust = updatePolice(policeSys, dt, {
      x: state.inCar ? state.car.x : player.x,
      z: state.inCar ? state.car.z : player.z,
      inCar: state.inCar,
      speed: state.inCar ? state.car.speed : player.speed,
      health: player.health,
    }, colliders, {
      onRam: (strength) => {
        player.health -= strength * 0.45;
        state.lastDamageAt = state.elapsed;
        state.shake = Math.min(1, strength * 0.03);
        burst(particles, state.car.x, 1, state.car.z, 'spark', 10);
        audio.crash(strength);
      },
      onCooled: (stars) => showToast(hud, stars > 0 ? `Heat dropping — ${stars} star${stars === 1 ? '' : 's'} left.` : 'You lost them. Heat is off.'),
    });
    void bust;
    if (policeSys.bustTimer > 2.2 && state.mode === 'playing') {
      endRun('busted');
    }
    audio.setSiren(policeSys.wanted > 0 && state.mode === 'playing');

    // --- health ------------------------------------------------------------------
    if (state.elapsed - state.lastDamageAt > 6 && player.health < 100 && player.health > 0) {
      player.health = Math.min(100, player.health + 2 * dt);
    }
    if (player.health <= 0 && state.mode === 'playing') {
      player.health = 0;
      burst(particles, player.x, 1.5, player.z, 'spark', 24);
      endRun('wasted');
    }

    // --- missions ------------------------------------------------------------------
    const ev = updateMissions(missions, dt, {
      x: state.inCar ? state.car.x : player.x,
      z: state.inCar ? state.car.z : player.z,
      inCar: state.inCar,
      inSportsCar: state.inCar && state.car === sportsCar,
      setWanted: (n) => setWanted(policeSys, n),
      addWanted: (n) => addWanted(policeSys, n),
      banner: (t, s) => showBanner(hud, t, s),
      toast: (t) => showToast(hud, t),
    });
    handleMissionEvent(ev);
    const m = currentMission(missions);
    if (m && missions.active) {
      const stage = currentStage(missions);
      setObjective(m.title, stage ? stage.label : m.desc, missions.timer);
      setCompass(stage && stage.target ? stage.target : null, state.inCar ? state.car.x : player.x, state.inCar ? state.car.z : player.z, rig.yaw);
    } else if (m && !missions.active && !missions.done) {
      setObjective(m.title, m.desc, 0);
      setCompass(null, 0, 0, 0);
    }

    // --- HUD -----------------------------------------------------------------------
    setWantedStars(hud, policeSys.wanted);
    setHealth(player.health);
    state.minimapAt += dt;
    if (state.minimapAt > 0.12) {
      state.minimapAt = 0;
      drawMinimap(hud, {
        playerX: state.inCar ? state.car.x : player.x,
        playerZ: state.inCar ? state.car.z : player.z,
        playerHeading: state.inCar ? state.car.heading : player.heading,
        traffic, police: policeSys.policeCars,
        missionTarget: missions.active && currentStage(missions) ? currentStage(missions).target : null,
        time: state.elapsed,
      });
    }
  }

  // City sun drift and particles always animate (menus included).
  cityApi.update(dt);
  updateParticles(particles, dt);

  if (state.shake > 0) {
    state.shake = Math.max(0, state.shake - dt * 2);
    camera.position.x += (Math.random() - 0.5) * state.shake * 0.6;
    camera.position.y += (Math.random() - 0.5) * state.shake * 0.6;
  }

  renderer.render(scene, camera);
  frames += 1;
  if (frames === 5) window.__costaReady = true;
}

// Expose a snapshot for automated play-testing.
window.__costa = {
  state, player, policeSys, missions, traffic, peds,
  get snapshot() {
    return {
      mode: state.mode,
      money: state.money,
      wanted: policeSys.wanted,
      missionIndex: missions.index,
      missionActive: missions.active,
      missionTimer: Math.round(missions.timer * 10) / 10,
      inCar: state.inCar,
      carSpeed: state.car ? Math.round(Math.abs(state.car.speed) * 2.237) : 0,
      carX: state.car ? Math.round(state.car.x * 10) / 10 : null,
      carZ: state.car ? Math.round(state.car.z * 10) / 10 : null,
      missionStage: missions.active ? missions.stage : null,
      health: Math.round(player.health),
      playerX: Math.round(player.x * 10) / 10,
      playerZ: Math.round(player.z * 10) / 10,
      trafficCount: traffic.length,
      pedCount: peds.length,
      policeCount: policeSys.policeCars.length,
      errors: window.__costaErrors,
      frames,
    };
  },
  keys(k, down) { keys[k] = down; refreshInput(); },
  enterCar() { if (state.mode === 'playing') tryEnterExitCar(); },
  punch() { if (state.mode === 'playing' && !state.inCar) tryPunch(); },
  startRun() { startRun(false); },
};

animate();
