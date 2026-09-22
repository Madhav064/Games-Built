# Rush Wall — Technical Documentation

## Overview
Rush Wall is a competitive HTML5 browser strategy game inspired by Quoridor. Players race to navigate their pawn across a 9×9 grid while strategically placing walls to block their opponent's path. 

The game supports:
1. **Local 2-Player Mode**
2. **Vs AI Mode** (Easy, Medium, Hard tiers)
3. **Online Multiplayer** (Global matchmaking using Supabase Realtime)

It is fully integrated with a custom Supabase backend for global leaderboards and matchmaking, while also supporting the CrazyGames SDK for game lifecycle events, Data Module persistence, and ad breaks.

## Technology Stack
- **Framework:** React 18 with Vite
- **Language:** TypeScript
- **Backend / Realtime:** Supabase (PostgreSQL, Auth, Realtime Channels)
- **Styling:** Vanilla CSS (CSS Variables, Glassmorphism, CSS Animations)
- **Renderer:** HTML5 `<canvas>` via React `useRef`
- **Audio:** Procedural Web Audio API (no external sound files required)

## Project Structure
```
src/
├── App.tsx               # Main Router and layout wrapper
├── index.css             # Global CSS Design System
├── audio/
│   └── soundManager.ts   # Procedural Web Audio API sound generation
├── components/
│   ├── game/             # Game UI (Canvas Board, Game Over modal)
│   └── screens/          # App screens (Home, Game, Shop, Profile, Leaderboard, Matchmaking)
├── context/
│   └── GameContext.tsx   # Global state machine linking React UI, GameManager, and SDKs
├── game/
│   ├── ai.ts             # Minimax algorithm & difficulty tiers
│   ├── board.ts          # Core board logic & placement rules
│   ├── gameManager.ts    # Game loop, turn timer, state machine
│   ├── pathfinding.ts    # BFS path validation (ensuring a goal is always reachable)
│   ├── rules.ts          # Pawn move & wall placement validation
│   └── types.ts          # Shared TypeScript interfaces & types
├── sdk/
│   ├── crazygames.ts     # Wrapper for CrazyGames SDK (ads, lifecycle)
│   ├── supabase.ts       # Supabase client & Anonymous Auth initialization
│   ├── multiplayer.ts    # Realtime networking, matchmaking logic, move syncing
│   └── leaderboard.ts    # Database interactions for global ranking & profile sync
└── store/
    └── cosmetics.ts      # Virtual economy, items, local storage sync
```

## Architecture & Core Systems

### 1. Game Engine & State Management
The game logic is strictly separated from the React UI. `src/game/gameManager.ts` acts as the single source of truth (singleton pattern), holding the game state, turn timers, and player metadata (avatars, skins).

The React UI (`GameContext.tsx`) subscribes to events emitted by the `GameManager` using an event emitter pattern. `GameContext.tsx` handles the overarching app state (which screen is active, who the local player is) and proxies online moves between the `GameManager` and the `multiplayer.ts` SDK.

### 2. Pathfinding & Validation
The most critical rule in Rush Wall is that **a player's path to the goal can never be entirely blocked**.
Whenever a wall placement is attempted, the engine performs a Breadth-First Search (BFS) in `pathfinding.ts` to ensure that both players still have a valid route to their respective goal rows. If `hasPathToGoal()` returns false, the move is rejected.

### 3. Online Multiplayer Networking (Supabase Realtime)
Online play is handled exclusively over WebSockets via Supabase Realtime (`multiplayer.ts`), circumventing the need for an authoritative custom game server.

- **Matchmaking (`joinQueue`):** 
  - Players join a global `matchmaking_lobby` channel and broadcast `ping` payloads containing their profile data (ID, name, equipped cosmetics, avatars) every second.
  - Upon receiving a ping, players identify a match. The player with the *lower* alphanumeric user ID is automatically assigned as the Host (Player 0) and generates a unique `gameId`.
  - The Host broadcasts a `match_made` event rapidly to ensure the Guest receives it. Both clients then transition into the game channel.
- **Game Channel (`game_${gameId}`):**
  - Used to synchronize standard gameplay events (`make_move`, `resign`, `emote`).
  - Includes a heartbeat system (`ping`/`pong`) that runs every 3 seconds to detect opponent disconnections and auto-resolve the match.

### 4. Global Leaderboard & Player Profiles
Backend persistence relies on a PostgreSQL `leaderboard` table accessed via Supabase (`leaderboard.ts`).
- **Authentication:** Handled seamlessly via Supabase Anonymous Auth linked to local storage sessions.
- **Data Syncing (`ensureLeaderboardEntry`):** When a user views the leaderboard or joins a match, their local profile (Username, Avatar, Coins) is safely `UPDATE`d in the database without overwriting their wins/losses. If they don't exist, they are `INSERT`ed.
- **Ranking Logic:** Ranks are determined by sorting `wins DESC`, then `coins DESC` (as a tie-breaker), then `last_played_at DESC`. Players with identical wins and coins are assigned the exact same numerical rank.

### 5. AI Implementation
The AI (`ai.ts`) operates on three difficulty tiers:
- **Easy:** Random valid moves (favors moving the pawn).
- **Medium:** Greedy approach; uses BFS to find the shortest path to its own goal, and occasionally places random blocking walls.
- **Hard:** Minimax with Alpha-Beta Pruning. Evaluates board states based on the difference in shortest path lengths between the AI and the player. Limits depth to maintain a fast framerate on web browsers.

### 6. Canvas Renderer
The 9×9 grid is rendered natively using the HTML5 Canvas API in `GameBoard.tsx`. This allows for rich glow effects, sub-pixel rendering, and excellent mobile performance. Pointer coordinates are translated to grid spaces with detection for whether the cursor is hovering over a "gap" (for wall placement) or a "cell" (for pawn movement). Avatars and Skins are dynamically passed from the state and rendered natively in the React HUD overlay.

### 7. Procedural Audio
To maintain an ultra-low bundle size for rapid browser loading, Rush Wall dynamically synthesizes blips, boops, and UI clicks using the native Web Audio API (`AudioContext`) in `soundManager.ts`.

## Deployment
To build the game for production (or for platforms like CrazyGames):
```bash
npm run build
```
This generates a minified bundle in the `/dist` directory that includes all assets, CSS, and JS chunks. Ensure that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are provided in `.env` or as environment variables during build time.
