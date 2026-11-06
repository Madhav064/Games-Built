# Wall Duel

A two-player strategy race for the browser. Move your pawn to the far side of a 9×9 board, or spend a turn dropping a wall to send your rival the long way round. Walls may cross and overlap, but never shut a pawn in.

Built with React, TypeScript, Vite and an HTML canvas board. Integrated with the CrazyGames SDK v3.

## Modes

- **Tutorial**: new players land straight in a guided first match.
- **Ladder**: 15 computer rivals in 5 tiers. Up to 3 stars each.
- **Quick vs Computer**: Easy, Medium, Hard, Nightmare.
- **Online**: quick match (offers a computer match after 20 s with nobody around) or a private room shared by invite link / code.
- **Same device**: pass and play.

Progression: XP and levels, rank tiers (Bronze → Diamond), coins from matches, stars, level-ups and rank-ups, and a shop with pawns, wall skins, board themes, avatars and emotes.

## Develop

```bash
npm install
npm run dev
```

Online play and the leaderboard need Supabase. Copy `.env.example` to `.env` and fill in your project URL and anon key. Without them the game still runs; the online screens show that online play isn't available.

## Build for CrazyGames

```bash
npm run build
```

Zip the **contents** of `dist/` (not the folder itself) and upload it in the CrazyGames Developer Portal. See `documentation.md` for the SDK integration and the publishing checklist.

## Where things live

| Path | What |
| --- | --- |
| `src/config/balance.ts` | Every tunable number: coins, XP, timers, ad pacing |
| `src/config/brand.ts` | Game name, storage prefix, channel names |
| `src/game/` | Rules, pathfinding, match manager |
| `src/game/ai/` | AI engine (runs in a Web Worker) |
| `src/progression/` | Ladder rivals, XP and ranks |
| `src/store/` | Cosmetics catalog, profile and rewards |
| `src/sdk/` | CrazyGames SDK, Supabase, multiplayer, leaderboard |
| `src/components/` | Screens and game UI |
| `branding/` | Logo source (SVG) and 1024×1024 PNG |
