// Costa Luna — the gta6-01 entry program (Node 22, standard library only).
//
// The game lives in this repository's game/ folder as plain static files that a
// desktop browser loads offline (game/index.html plus its ES modules and the
// vendored three.js build under game/vendor/). This program hands the game in:
// it copies game/ and screenshots/ from beside this file into the output
// directory and writes dossier.json there, the summary the judge reads, using
// buildDossier from the vendored make.fun library.
//
// Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// and serve the game itself with `node serve.ts` (http://localhost:8080).

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(repoRoot, 'game');
const shotsDir = join(repoRoot, 'screenshots');

function countFiles(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    total += entry.isDirectory() ? countFiles(path) : 1;
  }
  return total;
}

function dirBytes(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    total += entry.isDirectory() ? dirBytes(path) : statSync(path).size;
  }
  return total;
}

// Refuse to hand in an entry the sealed scorer would refuse outright, so a
// mistake in the repository fails here instead of on the server.
const MAX_GAME_FILES = 993;
const MAX_GAME_BYTES = 48 * 1024 * 1024;
const MAX_SHOTS = 4;
const MAX_SHOT_BYTES = 256 * 1024;

const gameFiles = countFiles(gameDir);
if (gameFiles > MAX_GAME_FILES) {
  throw new Error(`game/ holds ${gameFiles} files, over the ${MAX_GAME_FILES} cap`);
}
const gameBytes = dirBytes(gameDir);
if (gameBytes > MAX_GAME_BYTES) {
  throw new Error(`game/ is ${gameBytes} bytes, over the ${MAX_GAME_BYTES} cap`);
}
const shotNames = existsSync(shotsDir)
  ? readdirSync(shotsDir).filter((name) => !name.startsWith('.'))
  : [];
if (shotNames.length < 3 || shotNames.length > MAX_SHOTS) {
  throw new Error(`screenshots/ holds ${shotNames.length} images, need 3 or 4`);
}
for (const name of shotNames) {
  const size = statSync(join(shotsDir, name)).size;
  if (size > MAX_SHOT_BYTES) {
    throw new Error(`screenshots/${name} is ${size} bytes, over the ${MAX_SHOT_BYTES} cap`);
  }
}

mkdirSync(outputDir, { recursive: true });
cpSync(gameDir, join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
}

writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: MAX_SHOTS, max_bytes: MAX_SHOT_BYTES },
    game_max_files: MAX_GAME_FILES,
    game_max_bytes: MAX_GAME_BYTES,
    game_path_max_bytes: 1000,
  }),
);

console.log(
  `handed in Costa Luna: ${gameFiles} game files (${gameBytes} bytes), ` +
  `${shotNames.length} screenshots -> ${outputDir}`,
);
