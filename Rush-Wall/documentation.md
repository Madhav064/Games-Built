# Rush Wall — Technical Documentation

## Overview
Rush Wall is a competitive HTML5 browser strategy game inspired by Quoridor. Players race to navigate their pawn across a 9×9 grid while strategically placing walls to block their opponent's path. The game supports a Local 2-Player mode and a tiered AI (Easy, Medium, Hard). It is fully integrated with the CrazyGames SDK for game lifecycle events, Data Module persistence, and ad breaks.

## Technology Stack
- **Framework:** React 18 with Vite
- **Language:** TypeScript
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
│   └── screens/          # App screens (Home, Game, Shop, Profile, HowToPlay)
├── context/
│   └── GameContext.tsx   # React global state (GameManager sync, SDK events)
├── game/
│   ├── ai.ts             # Minimax algorithm & difficulty tiers
│   ├── board.ts          # Core board logic & placement rules
│   ├── gameManager.ts    # Game loop, turn timer, state machine
│   ├── pathfinding.ts    # BFS path validation (ensuring a goal is always reachable)
│   ├── rules.ts          # Pawn move & wall placement validation
│   └── types.ts          # Shared TypeScript interfaces & types
├── sdk/
│   └── crazygames.ts     # Wrapper for CrazyGames SDK v2 (ads, lifecycle, data module)
└── store/
    └── cosmetics.ts      # Virtual economy, items, and profile saving logic
```

## Architecture

### 1. Game Engine & State Management
The game logic is strictly separated from the React UI. `src/game/gameManager.ts` acts as the single source of truth (singleton pattern), holding the game state, turn timers, and handling AI timeouts. 

The React UI (`GameContext.tsx`) subscribes to events emitted by the `GameManager` using a simple event emitter pattern, ensuring that complex game logic and pathfinding do not clutter the render cycle.

### 2. Pathfinding & Validation
The most critical rule in Rush Wall is that **a player's path to the goal can never be entirely blocked**.
Whenever a wall placement is attempted, the engine performs a Breadth-First Search (BFS) in `pathfinding.ts` to ensure that both players still have a valid route to their respective goal rows. If `hasPathToGoal()` returns false, the move is rejected.

### 3. AI Implementation
The AI (`ai.ts`) operates on three difficulty tiers:
- **Easy:** Random valid moves (favors moving the pawn).
- **Medium:** Greedy approach; uses BFS to find the shortest path to its own goal, and occasionally places random blocking walls.
- **Hard:** Minimax with Alpha-Beta Pruning. Evaluates board states based on the difference in shortest path lengths between the AI and the player. Limits depth to maintain a fast framerate on web browsers.

### 4. Canvas Renderer
The 9×9 grid is rendered natively using the HTML5 Canvas API in `GameBoard.tsx` rather than DOM elements. This allows for rich glow effects (using `ctx.shadowColor`), sub-pixel rendering, and excellent mobile performance. Pointer coordinates are translated to grid spaces with detection for whether the cursor is hovering over a "gap" (for wall placement) or a "cell" (for pawn movement).

### 5. Procedural Audio
To maintain an ultra-low bundle size for rapid browser loading (<20MB goal), Rush Wall avoids large `.mp3` or `.wav` files. Instead, `soundManager.ts` dynamically synthesizes blips, boops, and UI clicks using the native Web Audio API (`AudioContext`).

## CrazyGames SDK Integration
- **Game Lifecycle:** Properly calls `loadingStart/Stop()` during init and `gameplayStart/Stop()` when entering and leaving the Game Screen.
- **Ads:** Calls `requestAdBreak()` gracefully at the end of a match before the Game Over screen appears.
- **Data Module:** The player's currency, stats, and unlocked cosmetics are serialized and synced to the CrazyGames account via `loadData()` and `saveData()` inside `cosmetics.ts`.

## Building for Production
To build the game for distribution on CrazyGames:
```bash
npm run build
```
This outputs an optimized, minified bundle in the `/dist` directory. Zip the contents of the `/dist` folder and upload to the CrazyGames Developer Portal.
