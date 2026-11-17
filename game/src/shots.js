// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one sets the
// game up from a fresh world with a fixed seed and plays the real rules forward
// for a fixed number of steps with a scripted driver, so the frame is what real
// play looks like and the same seed always gives the same frame.
import { STEP } from './config.js';

/** Drive straight down the road the car starts on, staying in its lane. */
function driveInput() {
  return { forward: true, back: false, left: false, right: false, sprint: false, brake: false };
}

/**
 * Set `api` to the named scene. `api` is the game object main.js builds:
 * setupStart/setupDrive/setupChase/setupMission place the scene, advance(seconds,
 * input) steps the real simulation, and render() paints one frame.
 */
export function stageShot(name, api) {
  if (name === 'drive') {
    api.setupDrive();
    api.advance(6, driveInput);
    api.render();
    return { screen: 'play' };
  }
  if (name === 'chase') {
    api.setupChase();
    api.advance(5, driveInput);
    api.render();
    return { screen: 'play' };
  }
  if (name === 'mission') {
    api.setupMission();
    api.advance(2.5, driveInput);
    api.render();
    return { screen: 'play' };
  }
  api.setupStart();
  api.advance(1.5, () => ({ forward: false, back: false, left: false, right: false, sprint: false, brake: false }));
  api.render();
  return { screen: 'title' };
}
