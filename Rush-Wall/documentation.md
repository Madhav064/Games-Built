# Wall Duel — Technical documentation

## Overview

Wall Duel is a turn-based race on a 9×9 grid. Each turn a player either moves their pawn one square (jumping an adjacent rival) or places one of their 10 walls. House rule: walls may overlap halfway or cross; only an exact duplicate is rejected, and a wall may never remove a pawn's last route to its goal (checked with BFS).

## Architecture

```
src/
├── App.tsx                  App shell: splash, screen switch, nav
├── styles.css               All styles; light/dark tokens; responsive layout
├── config/
│   ├── balance.ts           Coins, XP, timers, ad pacing, star margins
│   └── brand.ts             Name, storage prefix, Realtime channel names
├── context/GameContext.tsx  App state: boot, matches, rewards, ads, online wiring
├── game/
│   ├── types.ts             Core types and the default profile
│   ├── board.ts             Walls, movement blocking, adjacency
│   ├── rules.ts             Move validation, legal moves, win check
│   ├── pathfinding.ts       BFS shortest path (AI, wall legality, ladder stars)
│   ├── gameManager.ts       One match: turns, timer (with online grace), AI turns, events
│   └── ai/
│       ├── ai.ts            Easy / Medium / Hard / Nightmare engines
│       ├── aiWorker.ts      Web Worker entry
│       └── aiClient.ts      Worker client with main-thread fallback
├── progression/
│   ├── ladder.ts            15 rivals in 5 tiers, unlocks, stars
│   └── xp.ts                Levels and rank tiers
├── store/
│   ├── cosmetics.ts         Catalog with render specs (used by board and shop)
│   └── profile.ts           Save/load, shop, match rewards
├── sdk/
│   ├── crazygames.ts        CrazyGames SDK v3 wrapper (safe outside CrazyGames)
│   ├── supabase.ts          Lazy Supabase client + anonymous auth
│   ├── multiplayer.ts       Quick match, friend rooms, in-game channel
│   └── leaderboard.ts       Online wins table
└── components/
    ├── game/                Board canvas, player cards, tutorial coach, results
    ├── screens/             Home, Ladder, Shop, Profile, Online, Leaderboard, Rules, Game
    └── shared/              Nav bar, chips, modal
```

## AI

| Level | How it plays |
| --- | --- |
| Easy | Mostly steps along its route, sometimes wanders, rarely walls |
| Medium | Races its shortest route; when behind, drops the wall that hurts you most |
| Hard | Alpha-beta search 2 moves deep (its move + your reply) |
| Nightmare | Alpha-beta search 4 moves deep with a wide set of candidate walls |

Wall candidates are only walls that cut the rival's current shortest route, ranked by (rival path gain − own path loss). Ladder rivals add a `mistakeRate` (chance of a simple greedy move) to make a smooth difficulty curve. The search uses a typed-array board with make/undo moves (moves take well under 0.1 s) and runs in a Web Worker so the board never freezes. In test matches with random openings, Medium beat Easy 10/10, Hard beat Medium 14/20 and Nightmare beat Hard 10/12.

## CrazyGames SDK v3

`index.html` loads `https://sdk.crazygames.com/crazygames-sdk-v3.js`. `src/sdk/crazygames.ts`:

- `initSDK()` runs before anything else; `loadingStart/Stop` wrap profile loading.
- `gameplayStart()` when a match starts; `gameplayStop()` when it ends or the player leaves.
- **Data module**: the profile is saved with `SDK.data` (tied to the player's CrazyGames account); falls back to `localStorage` elsewhere. Saves from the old "Rush Wall" build are migrated once.
- **Break ad** (`midgame`): requested when leaving the results screen after every 3rd finished match (`MATCHES_PER_BREAK_AD`). CrazyGames also applies its own frequency cap.
- **Rewarded ad**: opt-in "Watch an ad: 2× coins" on the results screen. Coins are added only when `adFinished` fires.
- Audio is suspended while any ad plays, and follows the site's `settings.muteAudio`.
- `settings.disableChat` hides emotes in online matches.
- **Invites**: `inviteLink({ room })` builds the friend link; `getInviteParam('room')` opens the online screen and joins automatically.
- **Room Data** (CrazyGames multiplayer requirement): hosting a private room calls `updateRoom({ roomId, isJoinable: true, inviteParams: { room } })` so CrazyGames shows its invite button; a started match calls `updateRoom({ roomId, isJoinable: false })`; leaving calls `leftRoom()`. `addJoinRoomListener` takes a player who accepts an invite while the game is open straight to that room.
- **Instant Multiplayer**: when `isInstantMultiplayer` is true, the game skips the tutorial and opens a private, joinable room right away.
- **Rooms kept across rounds**: after an online match both players can press **Rematch** and play again over the same connection, with the other player moving first. "Find a new opponent" leaves the room.
- **Lobby size** for the submission form: min 2, max 2.
- `happytime()` fires on new ladder stars, rank-ups and finishing the tutorial.
- New players land directly in the tutorial match (CrazyGames "land in gameplay" requirement).
- **Accounts**: logged-in CrazyGames players automatically play under their CrazyGames username (not editable) and their profile picture is equipped the first time; they can still choose a shop avatar ("My CrazyGames picture" stays available in the Shop). Guests see a "Log in with CrazyGames" button on the Profile screen. The picture is shared with opponents and the leaderboard as its URL. In the SDK's local test mode you are logged in as the mock user "User1".

## Online (Supabase Realtime)

No game server: both clients run the same rules and exchange moves over broadcast channels.

- **Quick match** (`wallduel_lobby`): players ping every second; the lower user id hosts and confirms the match repeatedly. After 20 s the player is offered a clearly labelled computer match.
- **Friend rooms** (`wallduel_room_<CODE>`): the host waits; the guest sends `join` until the host answers `start`.
- **Game channel** (`wallduel_game_<id>`): `move` (with sequence numbers to drop duplicates), `emote`, `resign`, `timeout`, heartbeat `hb` every 3 s, and `leave` on tab close. 12 s without any message counts as a disconnect.
- **Timer**: each client runs the turn clock. The player whose clock hits zero loses on their own device and tells the other; the other side waits a 5 s grace period before claiming the win itself.
- The online guest sees the board rotated so their pawn starts at the bottom.

Leaderboard table `leaderboard` (Supabase): `user_id, username, wins, losses, coins, avatar, last_played_at`. Only online results change wins/losses.

## Economy & progression (see `config/balance.ts`)

- Coins: AI win 20/60/100/150 by difficulty, online win 80, same-device match 50, tutorial 100 (once), 25 per new ladder star, level-up 40 + 10 × level, rank-up 250.
- XP: AI win 30–120 by difficulty (+10 per star), AI loss 10, online win 90 / loss 25, tutorial 60 (once), same-device 0.
- Level n → n+1 needs 100 + 40 × (n − 1) XP. Ranks: Bronze 1, Silver 5, Gold 10, Platinum 18, Diamond 28.
- Ladder stars: win = 1; rival still 3+ squares from goal = 2; 6+ = 3.

## Publishing checklist

1. `npm run build`, zip the contents of `dist/`, upload in the Developer Portal.
2. In the portal, test in the QA tool at 800×450, 907×510 and fullscreen; check the event log shows `loadingStart/Stop` and `gameplayStart/Stop`.
3. Add covers (landscape 1920×1080, portrait 800×1200, square 800×800) and a preview video; `branding/logo.png` is the 1024×1024 source.
4. Fill in description and controls (mouse: click dots / click between squares; W wall mode, R rotate; touch: tap Wall, tap to aim, tap ✓).
5. Privacy: online play stores names, avatars and online results in Supabase, so the game shows a short notice on the Online and Leaderboard screens linking to an in-game Privacy policy screen (`src/components/screens/PrivacyScreen.tsx`, contact email at the top of that file). CrazyGames accepts an in-game policy. Opening the leaderboard only reads data; a row is created when you play online. Keep the policy text in sync if you change what is stored.
