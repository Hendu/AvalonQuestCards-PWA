# Avalon Quest Cards — PWA

Cross-platform progressive web app companion for the Avalon board game.
Works on Android and iOS. Friends install by visiting the URL and tapping "Add to Home Screen."

Current version: **v3.9.3**

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Set up Firebase

**Create a project:**
1. Go to https://firebase.google.com and sign in with your Google account
2. Click **Add project** → name it anything → click through the prompts
3. Once created, click the **</>** (web) icon to add a web app
4. Give it a nickname, click **Register app**
5. Copy the `firebaseConfig` object values shown

**Enable Firestore:**
1. In the Firebase console left sidebar: **Build → Firestore Database**
2. Click **Create database**
3. Choose **Start in test mode** (fine for private use among friends)
4. Pick any region (us-east1 is fine)

**Paste your config:**
Open `src/utils/firebase.ts` and replace the placeholder values with your real ones.

### 3. Run locally
```bash
npm start
```
Opens at http://localhost:5173

---

## Deploy to Netlify (free)

### Option A: Drag and drop (easiest)
```bash
npm run build
```
Then go to https://app.netlify.com, drag the `dist/` folder onto the page. Done.
You get a URL like `https://amazing-avalon-123.netlify.app` to share with friends.

### Option B: Connect to GitHub (auto-deploys on push)
1. Push this project to a GitHub repo
2. Go to https://app.netlify.com → **Add new site → Import from Git**
3. Connect your repo
4. Build command: `npm run build`
5. Publish directory: `dist`
6. Click Deploy

### Alternative hosts
The app is a plain static site — any static host works. Drop-in alternatives to Netlify:
- **Cloudflare Pages** — free, unlimited bandwidth, same Git-connect workflow
- **Vercel** — free tier, excellent DX, connect repo and deploy
- **GitHub Pages** — free, requires a small SPA routing workaround for direct URL access

---

## How friends install it (Add to Home Screen)

**Android (Chrome):**
- Visit the URL → tap the three-dot menu → **Add to Home Screen**

**iOS (Safari — must use Safari, not Chrome):**
- Visit the URL in Safari → tap the Share button → **Add to Home Screen**

---

## Architecture overview

### Tech stack
- **Frontend:** React 18 + TypeScript, built with Vite
- **Backend/realtime:** Firebase Firestore (v10 modular SDK)
- **Hosting:** Netlify (static site — just the `dist/` folder)
- **No server:** all game logic runs on client devices; Firestore is the source of truth

### Game modes
- **Local mode** — all voting on one device, passed around. No Firebase involved.
- **Network mode** — each player uses their own device. State synced via Firestore `onSnapshot`.

### Network game phase flow
```
lobby → role-reveal → team-propose → team-vote → team-vote-results
      → voting → results → [repeat for next quest]
                         → assassination → gameover
```
All phase transitions are written to Firestore by the **host's device** and propagated
to all clients via the real-time listener. The host acts as the game engine.

### Firestore document structure
One document per room: `rooms/{roomCode}`

Key fields:
- `phase` — current game phase (string, drives all UI routing)
- `players[]` — `{ deviceId, name, joinedAt }` — sorted by `joinedAt` for leader rotation
- `characters{}` — `{ [deviceId]: CharacterName }` — assigned at game start
- `heartbeats{}` — `{ [deviceId]: timestamp }` — updated every 3s by each client
- `pendingDisconnect` — `{ deviceId, name, detectedAt }` or null — see Disconnect section
- `disconnectedPlayer` — string or null — "kick everyone" signal for deliberate quits
- `proposalVotes{}` — `{ [deviceId]: boolean }` — team approve/reject votes
- `missionPlayerIds[]` — deviceIds on the current mission
- `votes[]` — `{ deviceId, vote }` — success/fail mission votes (shuffled before write)
- `leaderIndex` — index into players-sorted-by-joinedAt for current team proposer
- `proposalCount` — proposals made on current quest (5 rejections = evil auto-win)

### Player identity
Each device gets a random 12-character ID stored in `localStorage` (`avalon_device_id`).
This is how the app knows "which player am I?" across page refreshes. Not authentication —
just a stable identifier for the session. If localStorage is cleared, the device gets a
new ID, which is handled by the rejoin-by-name matching in `rejoinRoom()`.

### Host responsibilities
The host's device runs several `useEffect` auto-advances that no other device runs:
- `role-reveal → team-propose` when all players confirm their role
- `team-vote → team-vote-results` when all proposal votes are in
- `voting → results` when all mission votes are in

This means if the host drops mid-game, these auto-advances stop firing. The reconnect
system (see below) handles this gracefully by freezing the game rather than ending it.

### Disconnect & reconnect system (v3.9)

**Mid-game guest disconnects:**
- Host detects via heartbeat timeout (25s) and writes `pendingDisconnect` to Firestore
- All clients freeze (modal overlay) — host sees countdown + Wait Longer / End Game
- Disconnected player is booted to start screen with a "Rejoin Game" banner
- On rejoin: `rejoinRoom()` rewrites their old `deviceId` → new `deviceId` across all
  Firestore fields and clears `pendingDisconnect` — everyone's modal disappears

**Mid-game host disconnects:**
- Guests detect via their own heartbeat watcher (also 25s)
- First guest to notice writes `pendingDisconnect` (same freeze path)
- All guests see the freeze modal with Wait Longer / End Game options
- Host can rejoin via the same Rejoin button — on return, their device resumes running
  the auto-advance effects naturally (they're reactive `useEffect`s)

**Lobby disconnects:**
- Guests who drop in lobby are silently removed from the player list (8s timeout)
- Host dropping in lobby deletes the room

**Deliberate quit:**
- Writes `disconnectedPlayer` (with " quit the game" suffix) → kicks everyone immediately
- No reconnect offered — this was intentional

### Character knowledge rules
Defined in `gameLogic.ts → getCharacterVision()`:
- **Merlin** sees all evil except Mordred
- **Percival** sees Merlin and Morgana but not which is which
- **Evil** (except Oberon) see each other but not Oberon
- **Oberon** sees nobody; nobody sees Oberon
- **Loyal Servants** see nobody

---

## Project structure

```
src/
  App.tsx                      -- root; routes to correct screen based on phase
  hooks/
    useGameState.ts            -- central state hook; all local + network logic
  utils/
    firebase.ts                -- Firebase init (put your config here)
    firebaseGame.ts            -- all Firestore operations
    gameLogic.ts               -- pure game logic: tables, types, pure functions
    theme.ts                   -- COLORS and SPACING constants
    deviceId.ts                -- localStorage-based device identity
  screens/
    StartScreen.tsx            -- mode select, host/join, rejoin banner
    LobbyScreen.tsx            -- waiting room + character picker
    RoleRevealScreen.tsx       -- each player sees their character privately
    TeamProposeScreen.tsx      -- leader picks mission team
    TeamVoteScreen.tsx         -- all players vote approve/reject simultaneously
    TeamVoteResultsScreen.tsx  -- reveal who voted what
    GameBoardScreen.tsx        -- mission voting, results, gameover
    AssassinationScreen.tsx    -- assassin picks their Merlin guess
    MissionSelectScreen.tsx    -- legacy, unused in network mode
  components/
    QuestTracker.tsx           -- the 5 circular quest slots
    VoteCards.tsx              -- 3D flip card secret voting mechanic
    VoteResults.tsx            -- vote progress and revealed results
    CharacterBadge.tsx         -- small character indicator in top bar
    QuitButton.tsx             -- X button with confirm modal
    DisconnectWaitModal.tsx    -- freeze overlay during disconnect/reconnect
public/
  assets/
    images/                    -- backgrounds, card backs, character portraits
    images/characters/         -- per-character PNG portraits
    images/tokens/             -- approve/reject SVG tokens
    sounds/                    -- ff-fanfare.mp3, tpirhorns.wav
  manifest.json                -- PWA install metadata
```

---

## Key design decisions worth knowing

**Why does the host act as game engine?**
Simpler than distributed consensus. All auto-advances are `useEffect`s that only
fire on `state.isHost === true`. This means host reconnect restores full function
automatically — no special "resume" logic needed.

**Why `pendingDisconnect` instead of deleting the room on drop?**
Deleting the room is irreversible. `pendingDisconnect` freezes the game state without
destroying it, giving the dropped player a window to come back. The room document
(and all game state) is fully preserved.

**Why match rejoin by name instead of deviceId?**
If a player cleared their localStorage or switched browsers, their deviceId changed.
Name matching is the fallback. If two players have the same name (not prevented),
the first match wins — not ideal, so don't do that.

**Why shuffle mission votes before writing to Firestore?**
Mission votes are success/fail but anonymous — players shouldn't know who voted what.
The host shuffles the array before writing `revealResults`, so no client can infer
vote order from submission timing.