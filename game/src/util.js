// Solmar — shared helpers: math, random picks and canvas textures.
// Every helper here is written for this game; nothing is copied in.

const SolmarUtil = (() => {
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
  function randInt(lo, hi) { return Math.floor(rand(lo, hi + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
  function angleLerp(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }
  function angleDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  // Make a canvas of the given size and hand back its 2d context.
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return { canvas: c, ctx: c.getContext('2d') };
  }

  // Turn a canvas into a THREE.CanvasTexture with sane defaults.
  function canvasTexture(canvas, repeatX, repeatY) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    if (repeatX) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeatX, repeatY || repeatX); }
    return tex;
  }

  // A small palette the whole city shares, so the art direction stays coherent.
  const PALETTE = {
    asphalt: '#3a3f4a', asphaltLine: '#e8d44d', sidewalk: '#9a938a',
    sand: '#e3c98f', ocean: '#1f7fa8', grass: '#5d9b4a',
    buildingFaces: ['#c9a37e', '#b98d6e', '#a8b6c4', '#d4b48c', '#8fa3b8', '#c48a7a', '#7e9b8a'],
    glass: '#2c4a63', carColors: [0xd23b2e, 0x2e7fd2, 0xe8b93a, 0x3aa655, 0x7a4fd0, 0xe8e8e8, 0x222226, 0xe87a2a, 0x37c2c9],
    neon: ['#ff2e88', '#00e5ff', '#ffd319', '#7cff00'],
  };

  return { clamp, lerp, rand, randInt, pick, dist2, angleLerp, angleDiff, makeCanvas, canvasTexture, PALETTE };
})();
