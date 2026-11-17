[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Kyamii21/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Kyamii21/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

# SOLMAR — Open World

An original open-world crime game in the spirit of GTA 6, built for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01). It plays offline in a desktop browser from static files — no network requests, no build step.

You are **Leo Marin**, fresh out of the slammer and broke on the Solmar coast. Mama Rosa has five jobs for you: steal a car, run a package, lose the cops, collect what the storm washed up, and pull one last big score at Solmar National Bank.

## What is in the game

- **A city on foot and by car** — a 9×9 procedurally built coastal city with a beach, a pier, the docks and Palm Park, all in a warm sunset light
- **Driving** — steal any parked or moving car (E), arcade handling with handbrake drifts (Space), traffic that cruises the road grid and brakes for you
- **Wanted system and police** — 5 stars, pursuit cars that ram and box you in, busted on foot, heat that cools off when you lay low
- **Missions and a story** — 5 story jobs with beacons, timers, a vault crack and a getaway, plus cash rewards and a save (localStorage)
- **Pedestrians** — sidewalk walkers who flee from speeding cars and drop cash when punched
- **Combat** — fists on foot, cars as weapons, damage, smoke and explosions
- **HUD with a minimap** — money, wanted stars, health, speed, mission objective with a timer, and a live north-up minimap with mission, traffic and police blips
- **Sound** — fully synthesized WebAudio: engine hum, police sirens and a synthwave music loop; no audio files
- **Polish** — start menu, pause, WASTED / BUSTED screens with run stats, skid marks, dust, smoke, sparks and particles

## Play it

Open `game/index.html` in desktop Chrome (or run `node serve.ts` and open http://localhost:8080/game/index.html).

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive in a car |
| Shift | Run |
| E | Enter / exit a car, crack the vault |
| F | Punch |
| Space | Handbrake |
| Mouse drag | Look around, wheel zooms |
| Esc | Pause |
| M | Mute |

## How it is built

- `game/index.html` — the page, HUD and menus
- `game/src/main.js` — bootstrap, game loop, input, collisions, saving
- `game/src/city.js` — the procedural city, beach, pier and landmarks
- `game/src/vehicles.js` — cars, driving physics and traffic
- `game/src/player.js` — the on-foot character and cameras
- `game/src/police.js` — wanted levels, pursuit AI and pedestrians
- `game/src/missions.js` — the five story jobs
- `game/src/hud.js` — HUD, minimap and screens
- `game/src/audio.js` — synthesized sound and music
- `game/src/effects.js` — particles, skid marks, explosions
- `game/vendor/three.min.js` — Three.js r149 (MIT), vendored
- `main.ts` — hands the game in: copies `game/` and `screenshots/` to `/output` and writes `dossier.json` with `vendor/makefun-game.ts`

Everything in the city, the characters, the vehicles, the names, the story, the art and the music is original. Nothing is taken from any commercial game.

## License

MIT — see [LICENSE](LICENSE).
