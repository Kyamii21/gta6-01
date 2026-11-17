// Neon Harbor: boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there. The game
// moves between title, play, paused, busted and wasted screens, plus a briefing
// card when a job is offered.
//
// ?seed=N fixes the city and traffic. ?shot=start|drive|chase|mission (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.
import * as THREE from 'three';
import { CITY, COMBAT, DAY, KEYS, MISSIONS, PLAYER, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { buildCity } from './city.js';
import { createAudio } from './audio.js';
import { createPlayer } from './player.js';
import { createVehicles } from './vehicles.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createCombat } from './combat.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const SPAWN = { x: 10, z: 4, heading: Math.PI / 2 };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const rng = createRandom(seed);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);

const audio = createAudio();
const city = buildCity(scene, rng);
const player = createPlayer(scene, city);
const vehicles = createVehicles(scene, city, rng);
const police = createPolice(scene, city, vehicles, rng);
const missions = createMissions(scene, city, vehicles, rng);
const combat = createCombat(scene, city, rng);

const G = {
  mode: 'title',
  briefingOpen: false,
  time: 0,
  dayTime: DAY.startTime,
  cash: 0,
  totalEarned: 0,
  health: PLAYER.health,
  ammo: COMBAT.clipSize,
  reserve: 240,
  reloading: 0,
  gunCooldown: 0,
  crashCooldown: 0,
  ramCooldown: 0,
  regenTimer: 0,
  cameraOverride: null,
  cameraLock: false,
  stats: { stolen: 0, busted: 0, wasted: 0, jobs: 0 },
};

const cam = { yaw: SPAWN.heading, pitch: 0.3, shake: 0, lastMouse: -10 };

const hud = createHud(handleHudAction);

function announce(message) {
  status.textContent = message;
}

// ---------- input ----------

const held = new Set();
const pressed = { interact: false, punch: false, shoot: false, reload: false, pause: false, mute: false };

function isCode(list) {
  return list.some((code) => held.has(code));
}

function currentInput() {
  return {
    forward: isCode(KEYS.forward),
    back: isCode(KEYS.back),
    left: isCode(KEYS.left),
    right: isCode(KEYS.right),
    sprint: isCode(KEYS.sprint),
    brake: isCode(KEYS.brake),
  };
}

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  held.add(event.code);
  if (KEYS.interact.includes(event.code)) pressed.interact = true;
  else if (KEYS.punch.includes(event.code)) pressed.punch = true;
  else if (KEYS.shoot.includes(event.code)) pressed.shoot = true;
  else if (KEYS.reload.includes(event.code)) pressed.reload = true;
  else if (KEYS.pause.includes(event.code)) pressed.pause = true;
  else if (KEYS.mute.includes(event.code)) pressed.mute = true;
  else if (KEYS.confirm.includes(event.code) && G.mode === 'title') startNewGame();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
});
window.addEventListener('keyup', (event) => held.delete(event.code));
window.addEventListener('blur', () => held.clear());

canvas.addEventListener('click', () => {
  audio.unlock();
  if (G.mode === 'play' && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock?.();
  }
});
canvas.addEventListener('mousedown', (event) => {
  audio.unlock();
  if (event.button === 0 && G.mode === 'play') pressed.shoot = true;
});
document.addEventListener('mousemove', (event) => {
  if (G.mode !== 'play') return;
  if (document.pointerLockElement === canvas || event.buttons === 1) {
    cam.yaw -= event.movementX * 0.0028;
    cam.pitch = Math.max(0.05, Math.min(1.0, cam.pitch + event.movementY * 0.0028));
    cam.lastMouse = G.time;
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.mode === 'play') pauseGame();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
camera.aspect = window.innerWidth / window.innerHeight;
camera.updateProjectionMatrix();
renderer.setSize(window.innerWidth, window.innerHeight);

// ---------- save / load ----------

function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.cash,
      totalEarned: G.totalEarned,
      missionIndex: missions.state.index,
      allDone: missions.state.allDone,
      jobs: G.stats.jobs,
    }));
  } catch {
    // Storage can be off: the save then lasts this visit only.
  }
}

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

// ---------- game flow ----------

function resetWorld() {
  if (vehicles.cars.length === 0) {
    vehicles.spawnTraffic(14);
    vehicles.spawnParked(9);
    combat.spawnPeds(14);
  }
}

function startNewGame() {
  audio.unlock();
  G.cash = 0;
  G.totalEarned = 0;
  G.health = PLAYER.health;
  G.ammo = COMBAT.clipSize;
  G.reserve = 240;
  G.stats = { stolen: 0, busted: 0, wasted: 0, jobs: 0 };
  missions.state.index = 0;
  missions.state.started = false;
  missions.state.allDone = false;
  police.clearAll();
  player.teleport(SPAWN.x, SPAWN.z, SPAWN.heading);
  player.state.onFoot = true;
  player.state.car = null;
  cam.yaw = SPAWN.heading;
  cam.pitch = 0.3;
  G.cameraOverride = null;
  G.mode = 'play';
  G.briefingOpen = false;
  resetWorld();
  hud.hideScreen();
  hud.setInGameVisible(true);
  hud.setObjective('', null);
  hud.toast('Welcome to Cahaya Bay. Find Mira\u2019s garage — follow the cyan beacon.', 5);
  announce('Neon Harbor. Playing.');
}

function continueGame() {
  const data = loadSave();
  startNewGame();
  if (!data) return;
  G.cash = data.cash;
  G.totalEarned = data.totalEarned || 0;
  G.stats.jobs = data.jobs || 0;
  missions.state.index = Math.min(2, data.missionIndex || 0);
  missions.state.allDone = !!data.allDone;
  hud.toast(`Welcome back, Raka. $${G.cash} in your pocket.`, 4);
}

function toTitle() {
  G.mode = 'title';
  G.briefingOpen = false;
  police.clearAll();
  hud.hideScreen();
  hud.setInGameVisible(false);
  const save = loadSave();
  hud.showTitle(!!save, save ? save.totalEarned || save.cash : 0);
  announce('Neon Harbor. Title screen.');
}

function pauseGame() {
  if (G.mode !== 'play') return;
  G.mode = 'paused';
  hud.showPaused();
  announce('Paused.');
}

function resumeGame() {
  G.mode = 'play';
  hud.hideScreen();
  announce('Playing.');
}

function respawn() {
  player.teleport(SPAWN.x, SPAWN.z, SPAWN.heading);
  player.state.onFoot = true;
  player.state.car = null;
  G.health = PLAYER.health;
  G.mode = 'play';
  hud.hideScreen();
  hud.setInGameVisible(true);
  saveGame();
  announce('Back on the streets.');
}

function handleHudAction(action) {
  audio.unlock();
  audio.click();
  if (action === 'new') startNewGame();
  else if (action === 'continue') continueGame();
  else if (action === 'accept') {
    G.briefingOpen = false;
    hud.hideScreen();
    const events = [];
    missions.acceptBriefing(events);
    handleEvents(events);
  } else if (action === 'decline') {
    G.briefingOpen = false;
    hud.hideScreen();
  } else if (action === 'resume') resumeGame();
  else if (action === 'quit') toTitle();
  else if (action === 'respawn') respawn();
  else if (action === 'freeroam') {
    hud.hideScreen();
    G.mode = 'play';
  }
}

// ---------- events ----------

function handleEvents(events) {
  for (const event of events) {
    if (event.type === 'briefing') {
      G.briefingOpen = true;
      hud.showBriefing(event.mission);
    } else if (event.type === 'missionStart') {
      audio.missionStart();
      hud.banner(event.mission.title, `Reward $${event.mission.reward} · ${event.mission.timeLimit}s`);
      announce(`Job started: ${event.mission.title}.`);
    } else if (event.type === 'missionComplete') {
      G.cash += event.reward;
      G.totalEarned += event.reward;
      G.stats.jobs += 1;
      audio.success();
      hud.banner('JOB DONE', `+$${event.reward} — ${event.mission.title}`);
      saveGame();
      announce(`Job done. Earned $${event.reward}.`);
    } else if (event.type === 'missionFailed') {
      audio.busted();
      hud.toast(`Job failed: ${event.reason}. Return to Mira\u2019s garage to retry.`, 5);
    } else if (event.type === 'storyComplete') {
      audio.success();
      hud.setInGameVisible(false);
      hud.showStoryComplete(G.totalEarned);
      G.mode = 'paused';
      saveGame();
    } else if (event.type === 'cashBag') {
      G.cash += event.amount;
      G.totalEarned += event.amount;
      audio.coin();
      hud.toast(`+$${event.amount} found on the street`, 2.5);
    } else if (event.type === 'pedDown') {
      if (event.ped) {
        G.cash += event.ped.cash;
        G.totalEarned += event.ped.cash;
        hud.toast(`+$${event.ped.cash} lifted from the pavement`, 2.5);
      }
      police.addCrime(1);
    } else if (event.type === 'pedHit' || event.type === 'copHit') {
      police.addCrime(1);
    } else if (event.type === 'setWanted') {
      police.setStars(event.stars);
    } else if (event.type === 'crash') {
      audio.crash();
      cam.shake = 0.5;
    } else if (event.type === 'rammed') {
      if (G.ramCooldown <= 0) {
        G.ramCooldown = 1;
        G.health -= 4;
        audio.crash();
        cam.shake = 0.6;
      }
    } else if (event.type === 'copPunch') {
      G.health -= event.damage;
      audio.punch();
      cam.shake = 0.3;
    } else if (event.type === 'busted') {
      const lost = Math.min(G.cash, 150);
      G.cash -= lost;
      G.stats.busted += 1;
      audio.busted();
      police.clearAll();
      G.mode = 'busted';
      hud.showBusted(lost);
      saveGame();
      announce('Busted by the harbor police.');
    } else if (event.type === 'toast') {
      hud.toast(event.text, 4.5);
    }
  }
}

// ---------- the step ----------

function playerPosition() {
  const car = vehicles.playerCar;
  if (car) return { x: car.x, z: car.z };
  return { x: player.state.x, z: player.state.z };
}

function update(dt, input) {
  const events = [];
  G.time += dt;
  G.dayTime = (G.dayTime + dt / 300) % 1;
  city.update(G.dayTime);

  if (G.mode === 'title') {
    // The city lives behind the title screen: traffic, pedestrians, daylight.
    vehicles.update(dt, { forward: false, back: false, left: false, right: false, sprint: false, brake: false }, player);
    combat.update(dt, player, police);
    return;
  }
  if (G.mode !== 'play' || G.briefingOpen) return;

  // One-shot actions.
  if (pressed.pause) {
    pressed.pause = false;
    pauseGame();
    return;
  }
  if (pressed.mute) {
    pressed.mute = false;
    const muted = audio.toggleMute();
    hud.toast(muted ? 'Sound off' : 'Sound on', 1.5);
  }
  if (pressed.interact) {
    pressed.interact = false;
    const pos = playerPosition();
    const acted = missions.interact(pos, events);
    if (!acted) {
      if (vehicles.playerCar) {
        vehicles.exitCar(player);
        audio.click();
      } else {
        const car = vehicles.nearestCar(pos.x, pos.z, 4.5, ['parked', 'traffic', 'taxi']);
        if (car) {
          const result = vehicles.enterCar(car, player);
          audio.click();
          if (result && result.stolen) {
            G.stats.stolen += 1;
            police.addCrime(1);
            hud.toast('You stole the car! The harbor police noticed.', 3);
          }
          cam.yaw = car.heading;
        }
      }
    }
  }
  if (pressed.punch) {
    pressed.punch = false;
    const event = combat.tryPunch(player, police.cops);
    if (event) {
      audio.punch();
      if (event.type !== 'punchMiss') events.push(event);
    }
  }
  if (pressed.reload) {
    pressed.reload = false;
    if (G.reloading <= 0 && G.ammo < COMBAT.clipSize && G.reserve > 0) {
      G.reloading = COMBAT.reloadSeconds;
      audio.click();
    }
  }
  if (pressed.shoot) {
    pressed.shoot = false;
    if (G.gunCooldown <= 0 && G.reloading <= 0) {
      G.gunCooldown = COMBAT.gunCooldown;
      if (G.ammo > 0) {
        G.ammo -= 1;
        audio.gunshot();
        cam.shake = Math.max(cam.shake, 0.15);
        const event = combat.tryShoot(camera, G.ammo + 1, police.cops);
        if (event && event.type !== 'gunMiss' && event.type !== 'gunEmpty') events.push(event);
        if (event && event.crime) police.addCrime(1);
      } else {
        audio.click();
        hud.toast('Out of ammo — press R to reload', 2);
      }
    }
  }
  if (G.gunCooldown > 0) G.gunCooldown -= dt;
  if (G.crashCooldown > 0) G.crashCooldown -= dt;
  if (G.ramCooldown > 0) G.ramCooldown -= dt;
  if (G.reloading > 0) {
    G.reloading -= dt;
    if (G.reloading <= 0) {
      const need = COMBAT.clipSize - G.ammo;
      const take = Math.min(need, G.reserve);
      G.ammo += take;
      G.reserve -= take;
      hud.toast('Reloaded', 1.2);
    }
  }

  // World updates.
  player.update(dt, input, cam.yaw);
  vehicles.update(dt, input, player);
  const pos = playerPosition();
  police.update(dt, player, vehicles.playerCar, events);
  missions.update(dt, pos, vehicles.playerCar, events);
  combat.update(dt, player, police);

  // Crash damage when the player's car slams a building.
  const car = vehicles.playerCar;
  if (car && car._crashed && Math.abs(car.speed) > 12 && G.crashCooldown <= 0) {
    G.crashCooldown = 1;
    G.health -= 5;
    audio.crash();
    cam.shake = 0.5;
  }

  // Slow health regen while the heat is off.
  if (police.state.stars === 0 && G.health > 0 && G.health < PLAYER.health) {
    G.regenTimer += dt;
    if (G.regenTimer > 6) G.health = Math.min(PLAYER.health, G.health + 2 * dt);
  } else {
    G.regenTimer = 0;
  }

  handleEvents(events);

  // Wasted.
  if (G.health <= 0 && G.mode === 'play') {
    const lost = Math.min(G.cash, 200);
    G.cash -= lost;
    G.stats.wasted += 1;
    audio.wasted();
    police.clearAll();
    G.mode = 'wasted';
    hud.showWasted(lost);
    saveGame();
    announce('Wasted. You woke up at the harbor clinic.');
  }

  // Continuous sounds.
  const driving = !!vehicles.playerCar;
  audio.engine(driving ? Math.abs(vehicles.playerCar.speed) / 34 : 0, driving);
  audio.siren(dt, police.state.stars > 0 && police.state.nearestCopDist < 90);
}

// ---------- camera & render ----------

function updateCamera(dt, snap) {
  if (G.cameraOverride) {
    camera.position.set(G.cameraOverride.pos[0], G.cameraOverride.pos[1], G.cameraOverride.pos[2]);
    camera.lookAt(G.cameraOverride.look[0], G.cameraOverride.look[1], G.cameraOverride.look[2]);
    return;
  }
  const car = vehicles.playerCar;
  const px = car ? car.x : player.state.x;
  const pz = car ? car.z : player.state.z;
  const heading = car ? car.heading : player.state.heading;
  // While driving, the camera drifts back behind the car when the mouse is idle.
  if (car && !G.cameraLock && G.time - cam.lastMouse > 1.5) {
    let diff = heading - cam.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cam.yaw += diff * Math.min(1, dt * 0.7);
  }
  const dist = car ? 11.5 : 7.5;
  const height = 1.7 + Math.sin(cam.pitch) * dist;
  const horizontal = Math.cos(cam.pitch) * dist;
  const tx = px - Math.sin(cam.yaw) * horizontal;
  const tz = pz - Math.cos(cam.yaw) * horizontal;
  if (snap) {
    camera.position.set(tx, height, tz);
  } else {
    const k = 1 - Math.pow(0.0001, dt);
    camera.position.x += (tx - camera.position.x) * k;
    camera.position.y += (height - camera.position.y) * k;
    camera.position.z += (tz - camera.position.z) * k;
  }
  if (cam.shake > 0) {
    cam.shake = Math.max(0, cam.shake - dt * 1.8);
    camera.position.x += (Math.random() - 0.5) * cam.shake * 0.5;
    camera.position.y += (Math.random() - 0.5) * cam.shake * 0.4;
  }
  camera.lookAt(px, 1.7, pz);
}

function updateHud() {
  if (G.mode !== 'play') return;
  hud.setCash(G.cash);
  hud.setHealth(G.health);
  hud.setAmmo(G.ammo, G.reserve);
  hud.setStars(police.state.stars);
  const car = vehicles.playerCar;
  hud.setSpeed(car ? Math.abs(car.speed) * 3.6 : 0, !!car);
  if (missions.state.started) {
    const m = missions.mission();
    const sub = missions.state.index === 2 && missions.state.stage === 0
      ? `Survive ${Math.ceil(missions.state.surviveTimer)}s`
      : `${missions.timeLeft()}s left · $${m.reward}`;
    hud.setObjective(missions.state.objectiveText, sub);
  } else if (!missions.state.allDone) {
    hud.setObjective('Next job: ' + MISSIONS[missions.state.index].title, 'Go to Mira\u2019s garage — cyan beacon');
  } else {
    hud.setObjective('Free roam — the city is yours', 'All three jobs done');
  }
  const pos = playerPosition();
  hud.drawMinimap({
    playerX: pos.x,
    playerZ: pos.z,
    playerHeading: vehicles.playerCar ? vehicles.playerCar.heading : player.state.heading,
    cars: vehicles.cars,
    cops: police.cops,
    objectivePos: missions.state.objectivePos || null,
  });
}

function render(snap) {
  updateCamera(1 / 60, snap);
  renderer.render(scene, camera);
  updateHud();
}

// ---------- boot ----------

function step(dt, inputOverride) {
  update(dt, inputOverride || currentInput());
}

function runGame() {
  resetWorld();
  player.teleport(SPAWN.x, SPAWN.z, SPAWN.heading);
  camera.position.set(SPAWN.x - Math.sin(cam.yaw) * 8, 5, SPAWN.z - Math.cos(cam.yaw) * 8);
  camera.lookAt(SPAWN.x, 1.7, SPAWN.z);
  const save = loadSave();
  hud.showTitle(!!save, save ? save.totalEarned || save.cash : 0);
  hud.setInGameVisible(false);
  announce('Neon Harbor. Press Enter or click New Game to start.');
  let last = performance.now();
  let accumulator = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (G.mode === 'play' || G.mode === 'title') {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= STEP && steps < 5) {
        step(STEP);
        accumulator -= STEP;
        steps += 1;
      }
      if (steps === 5) accumulator = 0;
    }
    render(false);
  }
  requestAnimationFrame(frame);
}

// ---------- screenshot mode ----------

function putPlayerInCar(x, z, heading, color) {
  const car = vehicles.addCar('parked', color || 0xc23b2e, x, z, heading);
  vehicles.enterCar(car, player);
  cam.yaw = heading;
  cam.pitch = 0.3;
  return car;
}

function runShot(name) {
  try {
    resetWorld();
    const api = {
      setupStart() {
        G.mode = 'title';
        player.teleport(SPAWN.x, SPAWN.z, SPAWN.heading);
        G.cameraOverride = { pos: [30, 62, -150], look: [-10, 8, 90] };
        G.dayTime = 0.36;
        city.update(G.dayTime);
        hud.setInGameVisible(false);
        hud.showTitle(false, 0);
      },
      setupDrive() {
        G.mode = 'play';
        hud.setInGameVisible(true);
        hud.hideScreen();
        G.dayTime = 0.45;
        city.update(G.dayTime);
        putPlayerInCar(-120, 4, Math.PI / 2, 0xc23b2e);
      },
      setupChase() {
        G.mode = 'play';
        hud.setInGameVisible(true);
        hud.hideScreen();
        G.dayTime = 0.42;
        city.update(G.dayTime);
        const car = putPlayerInCar(-100, -4, Math.PI / 2, 0x2e6bc2);
        police.setStars(3);
        police.spawnPoliceCar(-140, -4);
        police.spawnPoliceCar(-120, 4);
        // Look back at the car so the pursuing cruisers are in frame.
        G.cameraLock = true;
        cam.yaw = car.heading + Math.PI;
        cam.pitch = 0.34;
      },
      setupMission() {
        G.mode = 'play';
        hud.setInGameVisible(true);
        hud.hideScreen();
        G.dayTime = 0.38;
        city.update(G.dayTime);
        const events = [];
        missions.acceptBriefing(events);
        handleEvents(events);
        putPlayerInCar(-80, 120, 0, 0x3a9e5f);
        cam.pitch = 0.42;
      },
      advance(seconds, inputFn) {
        for (let t = 0; t < seconds; t += STEP) step(STEP, inputFn(t));
      },
      render() {
        render(true);
      },
    };
    stageShot(name, api);
    // Keep painting every frame (a resize clears the WebGL buffer, so a
    // one-off paint can go blank before the screenshot is taken).
    let painted = 0;
    function paint() {
      render(true);
      painted += 1;
      if (painted === 2) window.__shotReady = true;
      requestAnimationFrame(paint);
    }
    requestAnimationFrame(paint);
  } catch (error) {
    window.__shotError = String(error && error.stack ? error.stack : error);
  }
}

if (shot) runShot(shot);
else runGame();
