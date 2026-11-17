// Solmar — the program that hands the game in: it copies game/ and
// screenshots/ from this repository to the output directory and writes
// /output/dossier.json with buildDossier from vendor/makefun-game.ts.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.
import { cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const root = dirname(fileURLToPath(import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

// The gate's caps for gta6-01: dossier text 160 KiB, 4 screenshots of at
// most 256 KiB each, game/ at most 993 entries and 48 MiB, paths at most
// 1,000 UTF-8 bytes.
const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 48 * 1024 * 1024,
  game_path_max_bytes: 1000,
};

await mkdir(out, { recursive: true });
await cp(join(root, "game"), join(out, "game"), { recursive: true });
await cp(join(root, "screenshots"), join(out, "screenshots"), { recursive: true });
const dossier = buildDossier(out, caps);
await writeFile(join(out, "dossier.json"), dossier);
console.log("Solmar: wrote " + join(out, "dossier.json") + " (" + dossier.length + " bytes)");
