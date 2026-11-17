// Procedural canvas textures: every surface the city shows is painted at
// runtime, so the game ships no image assets at all.
import * as THREE from 'three';
import { makeRng } from './rng.js';

function canvasTexture(width, height, painter) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  painter(canvas.getContext('2d'), width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// A building facade: lit and dark windows on a tinted wall. `floors` rows and
// `cols` columns of windows; `lit` is the fraction that glow warm.
export function buildingTexture(base, floors, cols, lit, seed) {
  const rng = makeRng(seed);
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    // Subtle vertical shading so flat walls read as concrete panels.
    for (let x = 0; x < w; x += 32) {
      ctx.fillStyle = `rgba(0,0,0,${0.04 + rng.next() * 0.05})`;
      ctx.fillRect(x, 0, 32, h);
    }
    const cw = w / cols;
    const ch = h / floors;
    for (let r = 0; r < floors; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw + cw * 0.22;
        const y = r * ch + ch * 0.22;
        const ww = cw * 0.56;
        const wh = ch * 0.56;
        if (rng.next() < lit) {
          ctx.fillStyle = rng.next() < 0.7 ? '#ffd98a' : '#9fd8ff';
          ctx.fillRect(x, y, ww, wh);
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillRect(x, y, ww, wh * 0.3);
        } else {
          ctx.fillStyle = '#101c28';
          ctx.fillRect(x, y, ww, wh);
        }
      }
    }
  });
}

// Asphalt with a dashed centre line and edge lines, tiled along the road.
export function roadTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#33363b';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.03})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    ctx.fillStyle = '#c8b25a';
    ctx.fillRect(w / 2 - 2, 8, 4, 40);
    ctx.fillRect(w / 2 - 2, 72, 4, 40);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(6, 0, 3, h);
    ctx.fillRect(w - 9, 0, 3, h);
  });
}

export function sidewalkTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#8d8578';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(0, (i * h) / 4); ctx.lineTo(w, (i * h) / 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo((i * w) / 4, 0); ctx.lineTo((i * w) / 4, h); ctx.stroke();
    }
  });
}

export function sandTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e3c98f';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const v = 190 + Math.random() * 50;
      ctx.fillStyle = `rgba(${v},${v - 25},${v - 80},0.5)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}

export function grassTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#4d8a3f';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2200; i++) {
      ctx.fillStyle = `rgba(${40 + Math.random() * 60},${110 + Math.random() * 60},${40 + Math.random() * 40},0.6)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 3);
    }
  });
}

// Deep blue water with soft moving-looking streaks; the ocean mesh scrolls its
// offset slowly for a gentle shimmer.
export function waterTexture() {
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1d7fb8');
    grad.addColorStop(0.5, '#14659b');
    grad.addColorStop(1, '#0f4f80');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      const y = Math.random() * h;
      ctx.beginPath();
      ctx.moveTo(Math.random() * w, y);
      ctx.bezierCurveTo(w * 0.3, y + 6, w * 0.6, y - 6, w, y + 3);
      ctx.stroke();
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// A warm stucco wall for low houses.
export function stuccoTexture(base, seed) {
  const rng = makeRng(seed);
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.03 + rng.next() * 0.05})`;
      ctx.fillRect(rng.next() * w, rng.next() * h, 3, 3);
    }
  });
}
