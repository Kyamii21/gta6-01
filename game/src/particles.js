// Particles: one pooled THREE.Points cloud for skid smoke, crash sparks,
// pickup sparkles and splashes. Cheap, and it makes the action read.
import * as THREE from 'three';

const MAX = 420;

export function createParticles(scene) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.9, vertexColors: true, transparent: true, opacity: 0.9,
    depthWrite: false, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  return {
    points, positions, colors,
    vel: new Float32Array(MAX * 3),
    life: new Float32Array(MAX),
    maxLife: new Float32Array(MAX),
    head: 0,
  };
}

function spawn(sys, x, y, z, vx, vy, vz, r, g, b, life) {
  const i = sys.head;
  sys.head = (sys.head + 1) % MAX;
  sys.positions[i * 3] = x;
  sys.positions[i * 3 + 1] = y;
  sys.positions[i * 3 + 2] = z;
  sys.vel[i * 3] = vx;
  sys.vel[i * 3 + 1] = vy;
  sys.vel[i * 3 + 2] = vz;
  sys.colors[i * 3] = r;
  sys.colors[i * 3 + 1] = g;
  sys.colors[i * 3 + 2] = b;
  sys.life[i] = life;
  sys.maxLife[i] = life;
}

export function burst(sys, x, y, z, kind, count = 14) {
  for (let n = 0; n < count; n++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 2 + Math.random() * 6;
    if (kind === 'spark') {
      spawn(sys, x, y, z, Math.cos(a) * sp, 2 + Math.random() * 5, Math.sin(a) * sp, 1, 0.65, 0.15, 0.5 + Math.random() * 0.4);
    } else if (kind === 'smoke') {
      spawn(sys, x, y + 0.2, z, Math.cos(a) * sp * 0.4, 0.8 + Math.random(), Math.sin(a) * sp * 0.4, 0.55, 0.55, 0.55, 0.9 + Math.random() * 0.7);
    } else if (kind === 'gold') {
      spawn(sys, x, y, z, Math.cos(a) * sp * 0.5, 2.5 + Math.random() * 3, Math.sin(a) * sp * 0.5, 1, 0.85, 0.25, 0.7 + Math.random() * 0.5);
    } else if (kind === 'splash') {
      spawn(sys, x, y, z, Math.cos(a) * sp, 3 + Math.random() * 4, Math.sin(a) * sp, 0.6, 0.8, 1, 0.6 + Math.random() * 0.4);
    }
  }
}

export function updateParticles(sys, dt) {
  let any = false;
  for (let i = 0; i < MAX; i++) {
    if (sys.life[i] <= 0) continue;
    any = true;
    sys.life[i] -= dt;
    sys.positions[i * 3] += sys.vel[i * 3] * dt;
    sys.positions[i * 3 + 1] += sys.vel[i * 3 + 1] * dt;
    sys.positions[i * 3 + 2] += sys.vel[i * 3 + 2] * dt;
    sys.vel[i * 3 + 1] -= 6 * dt;
    if (sys.life[i] <= 0) sys.positions[i * 3 + 1] = -50;
  }
  if (any) {
    sys.points.geometry.attributes.position.needsUpdate = true;
    sys.points.geometry.attributes.color.needsUpdate = true;
  }
}
