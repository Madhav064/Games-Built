# Solar Strike

A planet destruction sandbox for the web (CrazyGames). Three.js + TypeScript + Vite. No asset files: planets, clouds and sounds are all generated in code.

```bash
npm install
npm run dev      # Vite prints the local URL (the Claude preview config runs it on port 5191)
npm run build    # dist/ is the CrazyGames upload
```

Dev only (none of this is in the production build):
- `?mute` silences all sound from the first frame and survives Vite reloads. Always test with it.
- `?coins=50000` adds coins on load.
- In the dev console: `__game`, `__hud`, `__progress`, `__sfx` and `__coins(n)`.

## How it works

| System | File | Notes |
| --- | --- | --- |
| Voxel planet | `src/engine/voxelPlanet.ts` | 96³ signed-distance field in 16³ chunks. Weapons carve spheres; dirty chunks re-mesh within a per-frame time budget. Tracks mass and core integrity. |
| Mesher | `src/engine/surfaceNets.ts` | Surface Nets, smooth watertight meshes, gradient normals. |
| Planet data | `src/engine/planetData.ts`, `planetWorker.ts`, `planetCache.ts` | Noise terrain and cloud patterns. Built ahead of time in a Web Worker for owned planets and cached, so switching planets doesn't freeze the game. The starting voxel field of the last planet is cached too, so rebuilding is a copy. |
| Planet look | `src/engine/planets.ts`, `planetMaterial.ts` | Planet definitions. Surface colour is sampled per pixel from a lat/long lookup; craters show crust → mantle → glowing core by depth. Heat glows and leaves scorch marks; Cryo frost shows as ice. |
| Effects | `src/engine/effects.ts` | Additive particles, instanced rock debris with gravity and landing, flashes, surface shockwave rings, beams. |
| Break-up | `src/engine/shatter.ts` | Voronoi split of the remaining field into ~28 glowing fragments. |
| Scenery | `src/engine/scenery.ts` | Starfield, sun, atmosphere rim, rings, cloud layer that explosions punch holes in. |
| Game | `src/game/game.ts` | Input, weapons, impacts, shockwave fire fronts, lava, lances, black holes, planet personalities (gas plumes, solar flares, permanent ice), stability, destruction rules, XP events. |
| Camera | `src/game/cameraRig.ts` | Orbit, zoom and screen shake. |
| Population | `src/game/population.ts` | Cities light the night side and die when carved or burned. |
| Weapons | `src/game/weapons.ts` | 11 weapons, each with its own mechanic (beam or projectile + impact spec), icon and per-hit `stability` drain. Laser and Missile are free. |
| Orbiters | `src/game/orbiters.ts` | Satellites, stations and moons circling some planets. Click one to aim at it; shooting one down pays bonus coins. |
| Missions | `src/game/missions.ts` | Three active goals (100-400 coins); a finished one is replaced right away. |
| Achievements | `src/game/achievements.ts` | Tiered lifetime goals that pay coins once per tier. |
| Progress | `src/game/progress.ts` | XP rank (Bronze I–III, Silver I–III, Gold I–III, Platinum), coins, owned weapons/planets, stats and settings. Saved via the CrazyGames data module (localStorage fallback). |
| SDK | `src/sdk/crazygames.ts` | SDK v3 wrapper: gameplay start/stop, break and rewarded ads, adblock check, device type, happytime, data, platform mute. |
| Audio | `src/audio/sfx.ts` | WebAudio synthesised explosions, per-weapon launch sounds, sizzles, cracks and rumbles, beam hum. Master/effects volume and mute. |
| UI | `src/ui/hud.ts`, `styles.css` | Main menu, planet select, shop, settings, goals (missions + achievements), HUD, weapon bar with reload sweep, results, dialogs, first-minute tips, planet-load fade, toasts and callouts. |
| Flow | `src/main.ts` | Wires game, UI, progress and SDK: pausing behind menus, ads, purchases, rank-ups. |

## Destruction rules

A planet breaks when any of these runs out:
- **Stability**: every hit drains it by the weapon's `stability` value (beams per second). Tough planets drain slower (`toughness`: gas giants 1.2-1.4, the Sun 1.6), small ones faster. Holding Missile breaks Earth in about 50 s; Nuke in about 15 s.
- **Mass** below 60 %, or **core** below 80 %.

The health bar shows whichever is closest to breaking. A brand-new player's first planet breaks twice as fast (stability drains 2x; mass 80 %, core 90 %).

Planet kinds (`kind` in `planets.ts`): **gas** giants billow gas and burst into a cloud, the **star** throws solar flares and ends in a supernova shell, **ice** worlds are always frozen so every hit shatters.

## First minute

New players start on the Missile with a pulsing "tap the planet" ring, then get two one-line tips (hold for a volley, try the Laser). The first results screen adds 300 starter coins. Older saves skip all of this.

## Economy

- Every point of XP earned (mass destroyed, people lost, +150 for destroying a planet) also gives one coin.
- Missions, achievements and shooting down orbiters (satellite 20, moon 40, station 60) also pay coins.
- Coins are the only way to unlock weapons and planets (in the shop, or by tapping a locked item).
- XP only moves the rank badge; it doesn't gate anything.

## Monetisation hooks (CrazyGames)

- Break ad only after a planet is destroyed, when the player rebuilds it or picks another planet. Not in the first 90 s, at most every 2 min, and skipped if a rewarded ad was already watched at that break.
- Rewarded (all optional, all hidden with an adblocker or when ads are disabled):
  - 2x coins and XP on the results screen;
  - free 150 coins in the shop, with a 3-minute cooldown;
  - try a locked weapon for the current planet. The game stays paused from the dialog until the ad is done.
- A spinner blocks input while an ad is being requested. Audio mutes and the game pauses only while the ad plays.
- `happytime()` only on rank-ups and achievement unlocks.
- `gameplayStart` / `gameplayStop` follow play vs. menus, dialogs, results and ads.

## Design reference (from REA analysis of the genre leader)

Concepts used, not copied: voxel planet + marching/surface-net meshing, damage radius + falloff ring + heat/scorch, shockwave spread, core temperature, population counter, unlocks, rewarded weapon trials, interstitial cooldown, N-body "system" mode (planned for v2). All names, weapons, planets, art and audio in this game are our own.

## Renaming

The name lives in `src/config/brand.ts` and `index.html`.
