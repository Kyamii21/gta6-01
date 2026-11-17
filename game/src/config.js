// Neon Harbor: every tuning number, colour and key binding in one place.
// The city is a 5x5 road grid; blocks sit between the roads. All distances are
// metres, all speeds metres per second, and the simulation steps at 1/60 s.

export const STEP = 1 / 60;

/** City layout: five roads each way, spaced 80 m apart, 16 m wide. */
export const CITY = {
  pitch: 80,
  roadWidth: 16,
  roadLines: [-160, -80, 0, 80, 160],
  half: 220,
  blockMargin: 12,
};

export const DAY = {
  /** Seconds for one full day/night cycle. */
  cycleSeconds: 300,
  /** Start of play: late golden hour, long shadows, neon just waking up. */
  startTime: 0.36,
};

export const PLAYER = {
  walkSpeed: 6.5,
  sprintSpeed: 10.5,
  accel: 42,
  radius: 0.55,
  height: 1.8,
  health: 100,
};

export const CAR = {
  accel: 16,
  brake: 30,
  reverseAccel: 10,
  maxSpeed: 34,
  maxReverse: 10,
  steer: 1.9,
  grip: 6.5,
  radius: 2.1,
  trafficSpeed: 11,
  trafficMax: 14,
  policeSpeed: 30,
};

export const WANTED = {
  maxStars: 5,
  /** Seconds with no new crime and no police nearby before one star fades. */
  decaySeconds: 26,
  /** How close a cop must be to start an arrest while the player is on foot. */
  arrestRange: 3.2,
  /** Seconds a cop must stay in arrest range to bust the player. */
  arrestSeconds: 1.6,
};

export const COMBAT = {
  punchDamage: 34,
  punchRange: 2.4,
  punchCooldown: 0.45,
  gunDamage: 55,
  gunRange: 90,
  gunCooldown: 0.28,
  clipSize: 24,
  reloadSeconds: 1.6,
};

export const MISSIONS = [
  {
    id: 'courier',
    title: 'Harbor Courier',
    giver: 'Mira',
    briefing:
      'Mira needs a sealed crate moved off the docks before the harbor patrol sweeps the pier. Pick it up at the warehouse, then drop it at the neon garage across town. Drive fast, stay clean.',
    reward: 300,
    timeLimit: 120,
  },
  {
    id: 'pursuit',
    title: 'Chase the Getaway',
    giver: 'Mira',
    briefing:
      'A courier named Dimas skipped town with Mira\u2019s ledger in a gold sedan. Ram his car three times to force him to stop, then walk up and take the ledger back. The harbor police will notice, so be quick.',
    reward: 500,
    timeLimit: 180,
  },
  {
    id: 'heat',
    title: 'Harbor Heat',
    giver: 'Raka',
    briefing:
      'The whole harbor precinct is on your tail. Lose the heat: stay out of the cops\u2019 hands for a full minute, then slip into the safehouse on the north pier. Finish this and the city is yours.',
    reward: 800,
    timeLimit: 150,
  },
];

export const PALETTE = {
  skyDay: '#7fb2e8',
  skyDusk: '#ff9a5c',
  skyNight: '#0b1026',
  fogDay: '#9fc3e8',
  fogDusk: '#e8906a',
  fogNight: '#0b1026',
  asphalt: '#3d4149',
  sidewalk: '#82868d',
  block: '#565a63',
  sun: '#ffd9a0',
  water: '#123a5c',
  neonPink: '#ff4fd8',
  neonCyan: '#37e6ff',
  neonAmber: '#ffb347',
  policeRed: '#ff2e2e',
  policeBlue: '#2e6bff',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save (cash, mission progress) is kept between visits. */
export const SAVE_KEY = 'neon-harbor.save.v1';

/** Key bindings (KeyboardEvent.code values). */
export const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  brake: ['Space'],
  interact: ['KeyE'],
  punch: ['KeyF'],
  shoot: ['KeyG'],
  reload: ['KeyR'],
  pause: ['KeyP', 'Escape'],
  mute: ['KeyM'],
  confirm: ['Enter', 'Space'],
};
