// =============================================================================
// firebaseGame.ts
//
// All Firestore operations for multiplayer rooms.
//
// ROOM DOCUMENT STRUCTURE:
//
//   rooms/{roomCode}
//     hostDeviceId: string          -- who controls the game
//     totalPlayers: number          -- how many players needed to start
//     players: Player[]             -- everyone who has joined
//       { deviceId, name, joinedAt }
//     currentQuest: number          -- 1-5
//     goodWins: number
//     evilWins: number
//     questOutcomes: QuestOutcome[]
//     phase: GamePhase
//     missionPlayerIds: string[]    -- deviceIds of players on THIS mission
//     votes: { deviceId, vote }[]   -- votes collected so far (shuffled on reveal)
//     lastQuestResult: QuestResult | null
//     winner: GameWinner
//     createdAt: timestamp
//
// VOTING FLOW:
//   1. Host selects mission players by tapping their names
//   2. Host taps "Send on Mission" -- missionPlayerIds written to Firestore
//   3. Each mission player's device sees vote cards (checked by deviceId)
//   4. Player taps a card -- their { deviceId, vote } pushed to votes array
//   5. When votes.length === missionPlayerIds.length, host sees "Reveal Results"
//   6. Host taps Reveal -- votes shuffled, lastQuestResult written, phase → results
//   7. All devices show results simultaneously
// =============================================================================

import {
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  deleteDoc,
  arrayUnion,
  serverTimestamp,
  getDoc,
  Unsubscribe,
} from 'firebase/firestore';

import { db } from './firebase';
import { VoteResult, QuestOutcome, QuestResult, GameWinner, GamePhase, shuffleArray } from './gameLogic';


// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------

export interface Player {
  deviceId: string;
  name:     string;
  joinedAt: number;  // timestamp for display order
}

export interface PlayerVote {
  deviceId: string;
  vote:     VoteResult;
}

export interface RoomData {
  hostDeviceId:        string;
  totalPlayers:        number;
  players:             Player[];
  currentQuest:        number;
  goodWins:            number;
  evilWins:            number;
  questOutcomes:       QuestOutcome[];
  phase:               GamePhase;
  missionPlayerIds:    string[];
  votes:               PlayerVote[];
  lastQuestResult:     QuestResult | null;
  winner:              GameWinner;
  createdAt:           any;
  // Heartbeat map: { [deviceId]: lastSeenTimestamp }
  heartbeats:          Record<string, number>;
  // Set when someone disconnects -- name of the player who left
  disconnectedPlayer:  string | null;
}


// -----------------------------------------------------------------------------
// createRoom
//
// Called by host. Creates the room document with them as Player 1.
// -----------------------------------------------------------------------------
export async function createRoom(
  roomCode:     string,
  hostDeviceId: string,
  hostName:     string,
  totalPlayers: number
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);

  const hostPlayer: Player = {
    deviceId: hostDeviceId,
    name:     hostName,
    joinedAt: Date.now(),
  };

  const now = Date.now();
  const initialData: RoomData = {
    hostDeviceId:        hostDeviceId,
    totalPlayers:        totalPlayers,
    players:             [hostPlayer],
    currentQuest:        1,
    goodWins:            0,
    evilWins:            0,
    questOutcomes:       [null, null, null, null, null],
    phase:               'lobby',
    missionPlayerIds:    [],
    votes:               [],
    lastQuestResult:     null,
    winner:              null,
    createdAt:           serverTimestamp(),
    heartbeats:          { [hostDeviceId]: now },
    disconnectedPlayer:  null,
  };

  await setDoc(roomRef, initialData);
}


// -----------------------------------------------------------------------------
// joinRoom
//
// Called by guests. Adds their Player entry to the players array.
// Returns false if the room doesn't exist or is already full/started.
// -----------------------------------------------------------------------------
export async function joinRoom(
  roomCode: string,
  deviceId: string,
  name:     string
): Promise<{ success: boolean; error?: string }> {
  const roomRef  = doc(db, 'rooms', roomCode);
  const snapshot = await getDoc(roomRef);

  if (!snapshot.exists()) {
    return { success: false, error: 'Room not found. Check the code and try again.' };
  }

  const data = snapshot.data() as RoomData;

  if (data.phase !== 'lobby') {
    return { success: false, error: 'That game has already started.' };
  }

  if (data.players.length >= data.totalPlayers) {
    return { success: false, error: 'That room is already full.' };
  }

  // Check if this device is already in the room (rejoining)
  const alreadyIn = data.players.find(function(p) { return p.deviceId === deviceId; });
  if (alreadyIn) {
    return { success: true }; // already joined, just reconnecting
  }

  const newPlayer: Player = {
    deviceId: deviceId,
    name:     name,
    joinedAt: Date.now(),
  };

  await updateDoc(roomRef, {
    players: arrayUnion(newPlayer),
  });

  return { success: true };
}


// -----------------------------------------------------------------------------
// startGame
//
// Host only. Moves phase from lobby to the mission selection phase.
// Only callable when players.length === totalPlayers.
// -----------------------------------------------------------------------------
export async function startGame(roomCode: string): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  await updateDoc(roomRef, {
    phase: 'mission-select',
  });
}


// -----------------------------------------------------------------------------
// selectMissionPlayers
//
// Host only. Saves the chosen mission player deviceIds and moves to voting phase.
// -----------------------------------------------------------------------------
export async function selectMissionPlayers(
  roomCode:         string,
  missionPlayerIds: string[]
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  await updateDoc(roomRef, {
    missionPlayerIds: missionPlayerIds,
    votes:            [],  // clear any previous votes
    phase:            'voting',
  });
}


// -----------------------------------------------------------------------------
// submitVote
//
// Called by a mission player when they tap a card.
// Adds their { deviceId, vote } to the votes array.
// -----------------------------------------------------------------------------
export async function submitVote(
  roomCode: string,
  deviceId: string,
  vote:     VoteResult
): Promise<void> {
  const roomRef   = doc(db, 'rooms', roomCode);
  const playerVote: PlayerVote = { deviceId, vote };

  await updateDoc(roomRef, {
    votes: arrayUnion(playerVote),
  });
}


// -----------------------------------------------------------------------------
// revealResults
//
// Host only. Called when all votes are in.
// Shuffles the votes (so order doesn't reveal who voted what),
// evaluates the result, and writes everything to Firestore.
// -----------------------------------------------------------------------------
export async function revealResults(
  roomCode:      string,
  votes:         PlayerVote[],
  questResult:   QuestResult,
  goodWins:      number,
  evilWins:      number,
  questOutcomes: QuestOutcome[],
  winner:        GameWinner
): Promise<void> {
  const roomRef   = doc(db, 'rooms', roomCode);
  const nextPhase: GamePhase = winner !== null ? 'gameover' : 'results';

  // Shuffle votes before writing so nobody can infer order
  const shuffledVotes = shuffleArray(votes);

  await updateDoc(roomRef, {
    votes:           shuffledVotes,
    lastQuestResult: questResult,
    goodWins:        goodWins,
    evilWins:        evilWins,
    questOutcomes:   questOutcomes,
    phase:           nextPhase,
    winner:          winner,
  });
}


// -----------------------------------------------------------------------------
// advanceToNextQuest
//
// Host only. Clears mission/vote state and moves to mission selection for next quest.
// -----------------------------------------------------------------------------
export async function advanceToNextQuest(
  roomCode:    string,
  nextQuestNumber: number
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  await updateDoc(roomRef, {
    currentQuest:     nextQuestNumber,
    missionPlayerIds: [],
    votes:            [],
    lastQuestResult:  null,
    phase:            'mission-select',
  });
}


// -----------------------------------------------------------------------------
// deleteRoom
//
// Host only. Cleans up Firestore when game ends.
// -----------------------------------------------------------------------------
export async function deleteRoom(roomCode: string): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  await deleteDoc(roomRef);
}


// -----------------------------------------------------------------------------
// sendHeartbeat
//
// Called every 30 seconds by each device to signal they are still connected.
// Writes their current timestamp into the heartbeats map.
// -----------------------------------------------------------------------------
export async function sendHeartbeat(
  roomCode: string,
  deviceId: string
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  try {
    await updateDoc(roomRef, {
      [`heartbeats.${deviceId}`]: Date.now(),
    });
  } catch (e) {
    // Room may have been deleted -- silently ignore
  }
}


// -----------------------------------------------------------------------------
// markPlayerDisconnected
//
// Called by the host when a player's heartbeat is too old.
// Writes their name to disconnectedPlayer so all devices see it.
// If the disconnected player IS the host, deletes the room entirely.
// -----------------------------------------------------------------------------
export async function markPlayerDisconnected(
  roomCode:       string,
  playerName:     string,
  isDisconnectedPlayerHost: boolean
): Promise<void> {
  if (isDisconnectedPlayerHost) {
    // Host left -- delete the room, everyone gets sent home
    await deleteDoc(doc(db, 'rooms', roomCode));
  } else {
    await updateDoc(doc(db, 'rooms', roomCode), {
      disconnectedPlayer: playerName,
    });
  }
}


// -----------------------------------------------------------------------------
// subscribeToRoom
//
// Real-time listener. Every device calls this after joining.
// onData fires whenever anything changes in the room document.
// -----------------------------------------------------------------------------
export function subscribeToRoom(
  roomCode:   string,
  onData:     (data: RoomData) => void,
  onNotFound: () => void
): Unsubscribe {
  const roomRef = doc(db, 'rooms', roomCode);

  return onSnapshot(roomRef, function(snapshot) {
    if (!snapshot.exists()) {
      onNotFound();
      return;
    }
    onData(snapshot.data() as RoomData);
  });
}
