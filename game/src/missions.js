// Five jobs for Luna the fixer, played in order: steal a car, run a package,
// outrun the law, race the beach road, and pull the big score. Each mission
// is a chain of stages with a 3D beacon marking the target.
import * as THREE from 'three';
import { dist2d } from './rng.js';

// Mission targets (x, z) in world coordinates.
const SPOTS = {
  sportsCar: { x: 6, z: -14 },
  garage: { x: -86, z: -86 },
  pierEnd: { x: 48, z: 290 },
  gazebo: { x: -120, z: -28 }, // on the park path, clear of the gazebo posts
  bank: { x: 40, z: -24 },
  hideout: { x: -196, z: 196 },
  beachCp: [
    { x: -180, z: 252 }, { x: -90, z: 252 }, { x: 0, z: 252 },
    { x: 90, z: 252 }, { x: 180, z: 252 },
  ],
};

const MISSIONS = [
  {
    id: 'wheels', title: 'MISSION 1 — FIRST WHEELS',
    desc: 'Luna needs a driver. Steal the red sports car by the garage, then bring it to the lockup.',
    reward: 300,
    stages: [
      { label: 'Steal the red sports car (E to enter)', target: SPOTS.sportsCar, radius: 4, need: 'car' },
      { label: 'Drive the car to the lockup', target: SPOTS.garage, radius: 8, need: 'drive' },
    ],
  },
  {
    id: 'courier', title: 'MISSION 2 — COURIER RUN',
    desc: 'A package is waiting on the pier. Grab it and get it to the park gazebo — 90 seconds, no excuses.',
    reward: 500,
    stages: [
      { label: 'Pick up the package on the pier', target: SPOTS.pierEnd, radius: 5, need: 'reach' },
      { label: 'Deliver to the park gazebo', target: SPOTS.gazebo, radius: 7, need: 'reach', timer: 90 },
    ],
  },
  {
    id: 'getaway', title: 'MISSION 3 — GETAWAY',
    desc: 'The cops are onto you — 3 stars. Stay free for 45 seconds. Do not get busted.',
    reward: 800,
    stages: [
      { label: 'Lose the cops — stay free for 45 seconds', target: null, radius: 0, need: 'survive', timer: 45 },
    ],
  },
  {
    id: 'beach', title: 'MISSION 4 — BEACH DASH',
    desc: 'A rival crew races the beach road. Hit all 5 checkpoints before the clock runs out.',
    reward: 900,
    stages: SPOTS.beachCp.map((cp, i) => ({
      label: `Checkpoint ${i + 1} of 5 — beach road`, target: cp, radius: 8, need: 'drive', timer: i === 0 ? 75 : 0,
    })),
  },
  {
    id: 'score', title: 'MISSION 5 — THE BIG SCORE',
    desc: 'The bank on Meridian Avenue. Walk in, grab the cash, and get to the hideout with the whole city on your tail.',
    reward: 2500,
    stages: [
      { label: 'Get to the bank (on foot)', target: SPOTS.bank, radius: 7, need: 'reach' },
      { label: 'Grab the cash — stay in the vault', target: SPOTS.bank, radius: 7, need: 'hold', holdTime: 3 },
      { label: 'Escape to the hideout', target: SPOTS.hideout, radius: 9, need: 'reach' },
    ],
  },
];

function makeBeacon(scene) {
  const group = new THREE.Group();
  group.visible = false;
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true), beamMat);
  beam.position.y = 30;
  group.add(beam);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }),
  );
  gem.position.y = 7;
  gem.name = 'gem';
  group.add(gem);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3, 4.2, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  group.add(ring);
  scene.add(group);
  return group;
}

export function createMissionSystem(scene) {
  return {
    scene,
    index: 0, // next mission to start (0..5); 5 means all done
    stage: 0,
    timer: 0,
    hold: 0,
    active: false,
    done: false,
    beacon: makeBeacon(scene),
    pulse: 0,
  };
}

export function currentMission(sys) {
  return sys.index < MISSIONS.length ? MISSIONS[sys.index] : null;
}

export function currentStage(sys) {
  const m = currentMission(sys);
  return m ? m.stages[sys.stage] : null;
}

export function startMission(sys, index, ctx) {
  sys.index = index;
  sys.stage = 0;
  sys.active = true;
  sys.done = false;
  sys.hold = 0;
  const m = MISSIONS[index];
  const stage = m.stages[0];
  sys.timer = stage.timer || 0;
  if (m.id === 'getaway') ctx.setWanted(3);
  if (m.id === 'score') ctx.toast('The bank job. No turning back now.');
  updateBeacon(sys);
  return m;
}

function updateBeacon(sys) {
  const stage = currentStage(sys);
  if (!sys.active || !stage || !stage.target) {
    sys.beacon.visible = false;
    return;
  }
  sys.beacon.visible = true;
  sys.beacon.position.set(stage.target.x, 0, stage.target.z);
}

// Returns an event object when something notable happens, else null.
// ctx: {x, z, inCar, inSportsCar, setWanted, addWanted, banner, toast}
export function updateMissions(sys, dt, ctx) {
  const m = currentMission(sys);
  if (!m || !sys.active) return null;
  const stage = m.stages[sys.stage];
  sys.pulse += dt;
  const gem = sys.beacon.getObjectByName('gem');
  if (gem) {
    gem.rotation.y += dt * 2;
    gem.position.y = 7 + Math.sin(sys.pulse * 3) * 0.8;
  }
  if (sys.timer > 0) {
    sys.timer -= dt;
    if (sys.timer <= 0) {
      // Surviving the clock is the mission: the timer running out is a win.
      if (stage.need === 'survive') return advance(sys, m, ctx);
      sys.active = false;
      sys.beacon.visible = false;
      return { type: 'failed', mission: m, reason: 'Out of time.' };
    }
  }
  const d = stage.target ? dist2d(ctx.x, ctx.z, stage.target.x, stage.target.z) : Infinity;
  if (stage.need === 'car') {
    if (ctx.inSportsCar) return advance(sys, m, ctx);
  } else if (stage.need === 'drive') {
    if (ctx.inCar && d <= stage.radius) return advance(sys, m, ctx);
  } else if (stage.need === 'reach') {
    if (d <= stage.radius) return advance(sys, m, ctx);
  } else if (stage.need === 'hold') {
    if (d <= stage.radius) {
      sys.hold += dt;
      if (sys.hold >= (stage.holdTime || 3)) {
        ctx.setWanted(4);
        ctx.toast('ALARM TRIPPED — 4 stars! Run!');
        return advance(sys, m, ctx);
      }
    } else {
      sys.hold = 0;
    }
  } else if (stage.need === 'survive') {
    if (sys.timer <= 0) return advance(sys, m, ctx);
  }
  return null;
}

function advance(sys, m, ctx) {
  sys.stage += 1;
  sys.hold = 0;
  if (sys.stage >= m.stages.length) {
    sys.active = false;
    sys.beacon.visible = false;
    sys.index += 1;
    sys.done = sys.index >= MISSIONS.length;
    return { type: 'complete', mission: m, reward: m.reward, allDone: sys.done };
  }
  const next = m.stages[sys.stage];
  // A stage timer only starts the clock when it sets one; otherwise the
  // remaining time carries across stages (the beach dash shares one clock).
  if (next.timer > 0) sys.timer = next.timer;
  updateBeacon(sys);
  return { type: 'stage', mission: m, stage: sys.stage, label: next.label };
}

export function missionProgressText(sys) {
  const m = currentMission(sys);
  if (!m) return 'All jobs done — Costa Luna is yours.';
  const stage = m.stages[sys.stage];
  return stage ? stage.label : m.desc;
}

export function resetMissions(sys) {
  sys.index = 0;
  sys.stage = 0;
  sys.timer = 0;
  sys.hold = 0;
  sys.active = false;
  sys.done = false;
  sys.beacon.visible = false;
}
