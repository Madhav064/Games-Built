# Solar Strike

A planet destruction sandbox for the web (CrazyGames). Three.js + TypeScript + Vite. No asset files: planets, clouds and sounds are all generated in code.

```bash
npm install
npm run dev      # http://localhost:5173 (or the port Vite prints)
npm run build    # dist/ is the CrazyGames upload
```

## How it works

| System | File | Notes |
| --- | --- | --- |
| Voxel planet | `src/engine/voxelPlanet.ts` | 96³ signed-distance field in 16³ chunks. Weapons carve spheres; dirty chunks re-mesh within a per-frame time budget. Tracks mass and core integrity. |
| Mesher | `src/engine/surfaceNets.ts` | Surface Nets, smooth watertight meshes, gradient normals. |
| Planet look | `src/engine/planets.ts`, `planetMaterial.ts` | Noise terrain baked into a lat/long lookup. Surface colour is sampled per pixel; craters show crust → mantle → glowing core by depth. Heat glows and leaves scorch marks. |
| Effects | `src/engine/effects.ts` | Additive particles, instanced rock debris with gravity and landing, flashes, surface shockwave rings, beams. |
| Break-up | `src/engine/shatter.ts` | Voronoi split of the remaining field into ~28 glowing fragments. |
| Scenery | `src/engine/scenery.ts` | Starfield, sun, atmosphere rim, cloud layer that explosions punch holes in. |
| Game | `src/game/game.ts` | Input, weapons, impacts, shockwave fire fronts, destruction rules, XP events. |
| Population | `src/game/population.ts` | Cities light the night side and die when carved or burned. |
| Weapons | `src/game/weapons.ts` | Data-driven: beam or projectile + impact spec. |
| Progress | `src/game/progress.ts` | XP/levels, saved via the CrazyGames data module (localStorage fallback). |
| SDK | `src/sdk/crazygames.ts` | SDK v3 wrapper (gameplay start/stop, break + rewarded ads, happytime, data). |
| Audio | `src/audio/sfx.ts` | WebAudio synthesised explosions, whooshes, beam hum. |
| UI | `src/ui/hud.ts`, `styles.css` | Title, planet select, HUD, weapon bar, results, toasts. |

Planet is destroyed when core integrity < 80 % or total mass < 60 %.

## Monetisation hooks (CrazyGames)

- Break ad when rebuilding / changing planet after a destruction (not in the first 90 s, at most every 2 min).
- Rewarded: double XP after destroying a planet; trial a locked weapon on the current planet.
- `happytime()` on planet destroyed and level up.

## Design reference (from REA analysis of the genre leader)

Concepts used, not copied: voxel planet + marching/surface-net meshing, damage radius + falloff ring + heat/scorch, shockwave spread, core temperature, population counter, weapon customisation (colour/intensity/speed/cluster), XP-gated unlocks, rewarded weapon trials, interstitial cooldown, N-body "system" mode (planned for v2). All names, weapons, planets, art and audio in this game are our own.

## Renaming

The name lives in `src/config/brand.ts` and `index.html`.
