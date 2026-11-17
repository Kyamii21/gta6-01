// Marco on foot: a box-built third-person character with a walk cycle, and
// the orbit camera rig that follows him — and the car — around the city.
import * as THREE from 'three';
import { clamp, angleLerp } from './rng.js';
import { resolveCircleCollision } from './city.js';

const SHIRT = 0x2e86c1;
const PANTS = 0x2c3e50;
const SKIN = 0xd9a066;

export function createPlayer(scene) {
  const group = new THREE.Group();
  group.name = 'marco';
  const shirt = new THREE.MeshLambertMaterial({ color: SHIRT });
  const pants = new THREE.MeshLambertMaterial({ color: PANTS });
  const skin = new THREE.MeshLambertMaterial({ color: SKIN });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.18;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.4), skin);
  head.position.y = 1.78;
  head.castShadow = true;
  group.add(head);
  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.42), hair);
  hairTop.position.y = 2.02;
  group.add(hairTop);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.78, 0.26), pants);
  legL.position.set(-0.17, 0.39, 0);
  legL.castShadow = true;
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.17;
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.66, 0.22), shirt);
  armL.position.set(-0.43, 1.22, 0);
  armL.castShadow = true;
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.43;
  group.add(armR);
  // A white tee stripe so Marco reads at a glance on the minimap and in shots.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.14, 0.36), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  stripe.position.y = 1.34;
  group.add(stripe);

  group.position.set(0, 0, 0);
  scene.add(group);
  return {
    group, legL, legR, armL, armR,
    x: 0, z: 0, heading: 0, speed: 0, walkPhase: 0,
    health: 100, visible: true,
  };
}

export function setPlayerPos(player, x, z, heading) {
  player.x = x;
  player.z = z;
  player.heading = heading;
  player.group.position.set(x, 0, z);
  player.group.rotation.y = heading;
  player.group.visible = true;
  player.visible = true;
}

// WASD moves relative to the camera yaw; Shift runs. Returns true while moving.
export function updatePlayer(player, input, camYaw, dt, colliders) {
  const fwd = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const moving = fwd !== 0 || strafe !== 0;
  const run = input.run ? 9.5 : 5.2;
  const targetSpeed = moving ? run : 0;
  player.speed += clamp(targetSpeed - player.speed, -30 * dt, 22 * dt);
  if (moving) {
    const moveAngle = camYaw + Math.atan2(strafe, fwd);
    player.heading = angleLerp(player.heading, moveAngle, Math.min(1, dt * 10));
    const nx = player.x + Math.sin(player.heading) * player.speed * dt;
    const nz = player.z + Math.cos(player.heading) * player.speed * dt;
    const hit = resolveCircleCollision(nx, nz, 0.6, colliders);
    player.x = clamp(hit.x, -235, 235);
    player.z = clamp(hit.z, -235, 700);
    player.walkPhase += dt * player.speed * 1.6;
  }
  const swing = moving ? Math.sin(player.walkPhase) * 0.7 : 0;
  player.legL.rotation.x = swing;
  player.legR.rotation.x = -swing;
  player.armL.rotation.x = -swing * 0.8;
  player.armR.rotation.x = swing * 0.8;
  player.group.position.set(player.x, 0, player.z);
  player.group.rotation.y = player.heading;
  return moving;
}

// --- camera rig -------------------------------------------------------------
export function createCameraRig(camera) {
  return {
    camera, yaw: 2.9, pitch: 0.32, distance: 8,
    targetYaw: 2.9, targetPitch: 0.32, targetDistance: 8,
    pos: new THREE.Vector3(0, 6, -8), look: new THREE.Vector3(),
    dragging: false, lastX: 0, lastY: 0,
  };
}

export function rigPointerDown(rig, x, y) {
  rig.dragging = true;
  rig.lastX = x;
  rig.lastY = y;
}

export function rigPointerMove(rig, x, y) {
  if (!rig.dragging) return;
  rig.targetYaw -= (x - rig.lastX) * 0.005;
  rig.targetPitch = clamp(rig.targetPitch + (y - rig.lastY) * 0.004, 0.06, 1.1);
  rig.lastX = x;
  rig.lastY = y;
}

export function rigPointerUp(rig) {
  rig.dragging = false;
}

// Follow a target (player or car). In a car the camera sits further back and
// lower; on foot it is closer and higher. The rig eases toward its targets so
// the camera never snaps.
export function updateCameraRig(rig, tx, ty, tz, heading, inCar, dt) {
  rig.targetDistance = inCar ? 11.5 : 7.5;
  if (inCar) {
    // Chase cam: swing behind the car's heading unless the player drags.
    if (!rig.dragging) rig.targetYaw = angleLerp(rig.targetYaw, heading + Math.PI, Math.min(1, dt * 1.4));
  }
  rig.yaw = angleLerp(rig.yaw, rig.targetYaw, Math.min(1, dt * 8));
  rig.pitch = rig.pitch + (rig.targetPitch - rig.pitch) * Math.min(1, dt * 8);
  rig.distance = rig.distance + (rig.targetDistance - rig.distance) * Math.min(1, dt * 4);
  const cd = rig.distance;
  const cx = tx - Math.sin(rig.yaw) * Math.cos(rig.pitch) * cd;
  const cz = tz - Math.cos(rig.yaw) * Math.cos(rig.pitch) * cd;
  const cy = ty + 2.2 + Math.sin(rig.pitch) * cd;
  rig.pos.x += (cx - rig.pos.x) * Math.min(1, dt * 10);
  rig.pos.y += (cy - rig.pos.y) * Math.min(1, dt * 10);
  rig.pos.z += (cz - rig.pos.z) * Math.min(1, dt * 10);
  rig.look.set(tx, ty + 1.6, tz);
  rig.camera.position.copy(rig.pos);
  rig.camera.lookAt(rig.look);
}
