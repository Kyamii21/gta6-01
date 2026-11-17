// Mira's three jobs, played in order: a harbor courier run, a chase to win back a
// stolen ledger, and a minute of harbor heat before the safehouse. Each mission
// is a small stage machine with a beacon in the world, a timer, and a cash reward.
// Cash bags scattered around the city are a side hustle.
import * as THREE from 'three';
import { CITY, MISSIONS } from './config.js';

const PICKUP_SPOT = { x: -60, z: 196 };
const DROP_SPOT = { x: 120, z: -160 };
const SAFEHOUSE = { x: -160, z: -160 };

function makeBeacon(color) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 34, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  beam.position.y = 17;
  group.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.4, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  group.add(ring);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color }),
  );
  diamond.position.y = 8;
  group.add(diamond);
  group.userData.diamond = diamond;
  return group;
}

function makeCashBagMesh() {
  const group = new THREE.Group();
  const bag = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.5, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x2e9e4f }),
  );
  bag.position.y = 0.5;
  bag.castShadow = true;
  group.add(bag);
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.12, 0.52),
    new THREE.MeshBasicMaterial({ color: 0xd8c13c }),
  );
  band.position.y = 0.5;
  group.add(band);
  return group;
}

export function createMissions(scene, city, vehicles, rng) {
  const beacon = makeBeacon(0xffd23c);
  beacon.visible = false;
  scene.add(beacon);
  const targetBeacon = makeBeacon(0xff3b30);
  targetBeacon.visible = false;
  scene.add(targetBeacon);

  const state = {
    index: 0,
    started: false,
    stage: 0,
    timer: 0,
    surviveTimer: 0,
    hits: 0,
    carrying: false,
    done: false,
    allDone: false,
    targetCar: null,
    hitCooldown: 0,
    objectiveText: '',
    objectivePos: null,
  };

  // Start marker: Mira's garage, where each job begins.
  const startMarker = makeBeacon(0x37e6ff);
  startMarker.position.set(40, 0, 160);
  scene.add(startMarker);
  const startPos = { x: 40, z: 160 };

  const bags = [];
  for (let i = 0; i < 6; i += 1) {
    const mesh = makeCashBagMesh();
    scene.add(mesh);
    bags.push({ mesh, x: 0, z: 0, active: false, respawn: 0 });
  }
  function placeBag(bag) {
    const line = rng.pick(CITY.roadLines);
    const along = rng.range(-CITY.half + 30, CITY.half - 30);
    const side = rng.chance(0.5) ? 1 : -1;
    if (rng.chance(0.5)) {
      bag.x = line + side * (CITY.roadWidth / 2 + 3);
      bag.z = along;
    } else {
      bag.x = along;
      bag.z = line + side * (CITY.roadWidth / 2 + 3);
    }
    bag.mesh.position.set(bag.x, 0, bag.z);
    bag.active = true;
  }
  for (const bag of bags) placeBag(bag);

  function mission() {
    return MISSIONS[state.index];
  }

  function setObjective(text, pos) {
    state.objectiveText = text;
    state.objectivePos = pos;
    if (pos) {
      beacon.visible = true;
      beacon.position.set(pos.x, 0, pos.z);
    } else {
      beacon.visible = false;
    }
  }

  function startMission(index, events) {
    state.index = index;
    state.started = true;
    state.stage = 0;
    state.hits = 0;
    state.carrying = false;
    state.targetCar = null;
    const m = MISSIONS[index];
    state.timer = m.timeLimit;
    if (index === 0) {
      setObjective('Pick up the crate at the harbor warehouse', PICKUP_SPOT);
    } else if (index === 1) {
      const car = vehicles.addCar('traffic', 0xd8a13c, 0, 80, 0);
      car.cruise = 17;
      car.health = 300;
      state.targetCar = car;
      targetBeacon.visible = true;
      setObjective('Chase the gold sedan — ram it 3 times', { x: car.x, z: car.z });
    } else {
      state.surviveTimer = 60;
      events.push({ type: 'setWanted', stars: 3 });
      setObjective('Lose the heat — survive 60 seconds', null);
    }
    events.push({ type: 'missionStart', mission: m });
  }

  function completeMission(events) {
    const m = MISSIONS[state.index];
    events.push({ type: 'missionComplete', mission: m, reward: m.reward });
    state.started = false;
    state.stage = 0;
    setObjective('', null);
    targetBeacon.visible = false;
    if (state.targetCar) {
      const i = vehicles.cars.indexOf(state.targetCar);
      if (i >= 0) {
        scene.remove(state.targetCar.mesh);
        vehicles.cars.splice(i, 1);
      }
      state.targetCar = null;
    }
    if (state.index + 1 < MISSIONS.length) {
      state.index += 1;
      events.push({ type: 'toast', text: `Next job: ${MISSIONS[state.index].title} — go to Mira's garage (cyan beacon)` });
    } else {
      state.allDone = true;
      events.push({ type: 'storyComplete' });
    }
  }

  function failMission(events, reason) {
    const m = MISSIONS[state.index];
    events.push({ type: 'missionFailed', mission: m, reason });
    state.started = false;
    state.stage = 0;
    setObjective('', null);
    targetBeacon.visible = false;
    if (state.targetCar) {
      const i = vehicles.cars.indexOf(state.targetCar);
      if (i >= 0) {
        scene.remove(state.targetCar.mesh);
        vehicles.cars.splice(i, 1);
      }
      state.targetCar = null;
    }
    events.push({ type: 'toast', text: 'Job failed — return to Mira\u2019s garage to try again' });
  }

  /** The player pressed E: start a job, pick up, or finish a stage. */
  function interact(playerPos, events) {
    if (!state.started) {
      if (Math.hypot(playerPos.x - startPos.x, playerPos.z - startPos.z) < 7 && !state.allDone) {
        events.push({ type: 'briefing', mission: MISSIONS[state.index] });
        return true;
      }
      return false;
    }
    if (state.index === 0 && state.stage === 1) {
      if (Math.hypot(playerPos.x - PICKUP_SPOT.x, playerPos.z - PICKUP_SPOT.z) < 5) {
        state.carrying = true;
        state.stage = 2;
        state.timer = MISSIONS[0].timeLimit;
        setObjective('Deliver the crate to the neon garage', DROP_SPOT);
        events.push({ type: 'toast', text: 'Crate secured — deliver it before the patrol sweeps the pier' });
        return true;
      }
    }
    if (state.index === 1 && state.stage === 1 && state.targetCar) {
      const t = state.targetCar;
      if (Math.hypot(playerPos.x - t.x, playerPos.z - t.z) < 5) {
        completeMission(events);
        return true;
      }
    }
    return false;
  }

  function acceptBriefing(events) {
    startMission(state.index, events);
  }

  function update(dt, playerPos, playerCar, events) {
    beacon.rotation.y += dt * 0.8;
    if (beacon.userData.diamond) beacon.userData.diamond.rotation.y += dt * 2;
    if (targetBeacon.userData.diamond) targetBeacon.userData.diamond.rotation.y += dt * 2;
    startMarker.rotation.y += dt * 0.5;

    // Cash bags.
    for (const bag of bags) {
      if (bag.active) {
        bag.mesh.rotation.y += dt;
        if (Math.hypot(playerPos.x - bag.x, playerPos.z - bag.z) < 2.2) {
          bag.active = false;
          bag.mesh.visible = false;
          bag.respawn = 45;
          events.push({ type: 'cashBag', amount: 50 });
        }
      } else {
        bag.respawn -= dt;
        if (bag.respawn <= 0) {
          placeBag(bag);
          bag.mesh.visible = true;
        }
      }
    }

    if (!state.started || state.allDone) return;
    const m = MISSIONS[state.index];
    state.timer -= dt;
    if (state.hitCooldown > 0) state.hitCooldown -= dt;

    if (state.index === 0) {
      if (state.stage === 0) {
        if (Math.hypot(playerPos.x - PICKUP_SPOT.x, playerPos.z - PICKUP_SPOT.z) < 5) {
          state.stage = 1;
          events.push({ type: 'toast', text: 'Press E to pick up the crate' });
        }
      } else if (state.stage === 2) {
        if (Math.hypot(playerPos.x - DROP_SPOT.x, playerPos.z - DROP_SPOT.z) < 6) {
          completeMission(events);
          return;
        }
      }
    } else if (state.index === 1) {
      const target = state.targetCar;
      if (!target) return;
      targetBeacon.position.set(target.x, 0, target.z);
      state.objectivePos = { x: target.x, z: target.z };
      if (state.stage === 0) {
        // The getaway car flees along the roads; ramming it slows it down.
        if (playerCar) {
          const d = Math.hypot(playerCar.x - target.x, playerCar.z - target.z);
          if (d < 5 && Math.abs(playerCar.speed) > 7 && state.hitCooldown <= 0) {
            state.hitCooldown = 1.2;
            state.hits += 1;
            target.speed = Math.max(0, target.speed - 6);
            target.cruise = Math.max(4, target.cruise - 4);
            events.push({ type: 'toast', text: `Hit ${state.hits} of 3 — keep on him!` });
            events.push({ type: 'crash' });
            if (state.hits >= 3) {
              state.stage = 1;
              target.cruise = 0;
              target.speed = 0;
              setObjective('Get out and take the ledger back (press E)', { x: target.x, z: target.z });
              events.push({ type: 'toast', text: 'He stopped! Get out and grab the ledger' });
            }
          }
        }
        // Keep the target on the road grid: it drives like traffic, faster.
        if (target.cruise > 0) {
          const along = target.axis === 'x' ? target.x : target.z;
          for (const line of CITY.roadLines) {
            if (Math.abs(along - line) < 1.5 && target.turnCooldown <= 0 && rng.chance(0.5)) {
              target.turnCooldown = 2;
              target.axis = target.axis === 'x' ? 'z' : 'x';
              target.dir = rng.chance(0.5) ? 1 : -1;
              target.line = line;
              if (target.axis === 'x') {
                target.z = line + (target.dir > 0 ? 4 : -4);
                target.heading = target.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
              } else {
                target.x = line + (target.dir > 0 ? 4 : -4);
                target.heading = target.dir > 0 ? 0 : Math.PI;
              }
              break;
            }
          }
        }
      } else if (state.stage === 1) {
        setObjective('Get out and take the ledger back (press E)', { x: target.x, z: target.z });
      }
    } else if (state.index === 2) {
      if (state.stage === 0) {
        state.surviveTimer -= dt;
        setObjective(`Lose the heat — survive ${Math.ceil(state.surviveTimer)}s`, null);
        if (state.surviveTimer <= 0) {
          state.stage = 1;
          setObjective('Slip into the safehouse on the north pier', SAFEHOUSE);
          events.push({ type: 'toast', text: 'Heat is off your tail — get to the safehouse!' });
        }
      } else if (state.stage === 1) {
        if (Math.hypot(playerPos.x - SAFEHOUSE.x, playerPos.z - SAFEHOUSE.z) < 6) {
          completeMission(events);
          return;
        }
      }
    }

    if (state.timer <= 0) {
      failMission(events, 'Time ran out');
    }
  }

  function timeLeft() {
    return Math.max(0, Math.ceil(state.timer));
  }

  return {
    state,
    startPos,
    interact,
    acceptBriefing,
    update,
    timeLeft,
    mission,
  };
}
