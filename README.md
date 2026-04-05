# Avalon Quest Cards — PWA

Cross-platform progressive web app. Works on Android and iOS.
Friends install it by visiting the URL and tapping "Add to Home Screen."

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
Opens at http://localhost:3000

---

## Deploy to Netlify (free)

### Option A: Drag and drop (easiest)
```bash
npm run build
```
Then go to https://app.netlify.com, drag the `build/` folder onto the page. Done.
You get a URL like `https://amazing-avalon-123.netlify.app` to share with friends.

### Option B: Connect to GitHub (auto-deploys on push)
1. Push this project to a GitHub repo
2. Go to https://app.netlify.com → **Add new site → Import from Git**
3. Connect your repo
4. Build command: `npm run build`
5. Publish directory: `build`
6. Click Deploy

---

## How friends install it (Add to Home Screen)

**Android (Chrome):**
- Visit the URL → tap the three-dot menu → **Add to Home Screen**
- It installs like an app with the Avalon icon

**iOS (Safari -- must use Safari, not Chrome):**
- Visit the URL in Safari → tap the Share button (box with arrow) → **Add to Home Screen**

---

## How network play works

1. One person taps **Host Network Game**, picks player count, gets a 6-character room code
2. Everyone else taps **Join Network Game**, enters the code
3. Host taps **Start Game** when everyone's in the lobby
4. Voting happens on the host's device (pass the phone around secretly)
5. Results reveal simultaneously on all screens via Firebase real-time sync
6. Host controls advancing between quests

---

## Project structure

```
src/
  App.tsx                  -- root, routes between screens
  hooks/
    useGameState.ts        -- all state, local + network modes
  utils/
    firebase.ts            -- Firebase init (put your config here)
    firebaseGame.ts        -- all Firestore read/write operations
    gameLogic.ts           -- pure game logic (identical to RN version)
    theme.ts               -- colors and spacing
  screens/
    StartScreen.tsx        -- mode select, player count, join
    LobbyScreen.tsx        -- waiting room with room code display
    GameBoardScreen.tsx    -- main game UI
  components/
    QuestTracker.tsx       -- the 5 circular quest slots
    VoteCards.tsx          -- secret voting card interaction
    VoteResults.tsx        -- progress and revealed results
public/
  assets/
    images/                -- all card and background images
    sounds/                -- fanfare.mp3 and horns.wav
  index.html               -- PWA shell
  manifest.json            -- makes it installable
```
