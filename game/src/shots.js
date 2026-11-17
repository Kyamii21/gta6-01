// Deterministic screenshot setups: `?shot=cover|beach|mission|chase&seed=N`
// places the player, the cars, the police and the mission into a composed
// scene so every screenshot shows the game at its best. The same seed always
// rebuilds the same city, so the shots are reproducible.
export const SHOT_NAMES = ['cover', 'beach', 'mission', 'chase'];

// ctx is the live world from main.js:
// { player, rig, cityApi, traffic, policeSys, missions, spawnPlayerCar,
//   putPlayerInCar, setWanted, startMissionAt, setTimeOfDay, state }
export function setupShot(name, ctx) {
  const { player, rig } = ctx;
  if (name === 'cover') {
    // Downtown car chase: sports car, 3 stars, patrol cars closing in.
    ctx.setTimeOfDay(0.25);
    const car = ctx.spawnPlayerCar('sport', 0xc0392b, -6, 60, 0.15);
    ctx.putPlayerInCar(car);
    car.speed = 26;
    ctx.setWanted(3);
    ctx.startMissionAt(2);
    ctx.placePoliceNear(player.x, player.z, 3);
    rig.targetYaw = car.heading + Math.PI;
    rig.targetPitch = 0.3;
  } else if (name === 'beach') {
    // On foot on the sand facing the ocean and the pier at sunset.
    ctx.setTimeOfDay(0.62);
    ctx.placePlayerOnFoot(28, 282, 0);
    ctx.startMissionAt(1);
    rig.targetYaw = 0.15;
    rig.targetPitch = 0.26;
  } else if (name === 'mission') {
    // Courier run: driving to the pier with the beacon ahead.
    ctx.setTimeOfDay(0.1);
    const car = ctx.spawnPlayerCar('sedan', 0x2e86c1, -6, 170, 0.05);
    ctx.putPlayerInCar(car);
    car.speed = 18;
    ctx.startMissionAt(1);
    rig.targetYaw = car.heading + Math.PI;
    rig.targetPitch = 0.28;
  } else if (name === 'chase') {
    // Five stars on foot at the park's edge, patrol cars closing in.
    ctx.setTimeOfDay(0.45);
    ctx.placePlayerOnFoot(-104, -8, 0.8);
    ctx.startMissionAt(2);
    ctx.setWanted(5);
    ctx.placePoliceNear(player.x, player.z, 4);
    rig.targetYaw = 0.9;
    rig.targetPitch = 0.42;
  }
  // Let the world settle a moment before the screenshot is taken.
  ctx.state.shotSettledAt = performance.now();
  window.__costaShotReady = true;
}
