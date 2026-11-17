# Costa Luna — Make GTA 6

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Kyamii21/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Kyamii21/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An open-world crime game in the spirit of GTA 6, built for the
[make.fun GTA 6 bounty](https://make.fun/bounty/gta6-01). Explore the sun-soaked
coastal city of **Costa Luna** on foot and by car: steal cars, outrun the police,
run jobs for the fixer Luna, and climb from a nobody driver to the city's most
wanted wheelman.

## Play it

Serve `game/` with any static server and open `game/index.html` in a desktop
browser (Chrome recommended):

```sh
node serve.ts
# open http://localhost:8080
```

No network request is made by the game; three.js is vendored under
`game/vendor/`.

## What is in the game

- **A living city** — downtown towers, residential blocks, a park, a beach with
  an ocean and a pier, streetlights, palm trees, and a day sky that warms into
  sunset as you play.
- **On foot and by car** — third-person walking and running with an orbit
  camera, and driving with steering, acceleration, braking and a handbrake for
  drifting. Press **E** to steal any car on the street.
- **Traffic and pedestrians** — cars follow the street grid with working
  headlights, pedestrians stroll the sidewalks and scatter when trouble starts.
- **Wanted system and police** — 0 to 5 stars. Steal cars, hit pedestrians or
  ram through the city and the police respond; patrol cars chase, ram and try
  to bust you. Break line of sight to cool down.
- **Missions and a story** — five jobs for Luna the fixer, from your first
  stolen car to the big score, with 3D beacons, a HUD compass arrow, timers
  and cash rewards.
- **Combat** — a punch on foot when someone gets in your way (and the wanted
  level that follows).
- **HUD and minimap** — cash, wanted stars, health, speed, objective text and
  a live top-down minimap of the city, traffic and police.
- **Menus, save and sound** — start screen, pause, WASTED / BUSTED screens
  with run statistics, progress saved to localStorage, and fully synthesized
  WebAudio sound: engine, sirens, effects and a music loop.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move / drive |
| Mouse drag | Orbit camera |
| Shift | Run |
| E | Enter / steal car, exit car |
| Space | Handbrake (drift) |
| F | Punch (on foot) |
| P / Esc | Pause |
| M | Mute |
| R | Restart after WASTED / BUSTED |

## Files

- `main.ts` — the entry program: copies `game/` and `screenshots/` to
  `/output` and writes `/output/dossier.json` with the vendored make.fun
  library (`vendor/makefun-game.ts`).
- `game/` — the playable game as static files (`index.html`, `src/*.js`,
  `vendor/three.module.min.js`).
- `screenshots/` — four real renders of the game running.

## License

MIT — see `LICENSE`.
