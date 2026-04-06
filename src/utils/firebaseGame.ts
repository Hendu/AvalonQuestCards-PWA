// =============================================================================
// firebaseGame.ts
//
// All Firestore operations for multiplayer rooms.
//
// ROOM DOCUMENT STRUCTURE (v3):
//
//   rooms/{roomCode}
//     hostDeviceId: string
//     totalPlayers: number
//     players: Player[]
//       { deviceId, name, joinedAt }
//     currentQuest: number          (1-5)
//     goodWins: number
//     evilWins: number
//     questOutcomes: QuestOutcome[]
//     phase: GamePhase
//     missionPlayerIds: string[]    (deviceIds on THIS mission)
//     votes: { deviceId, vote }[]
//     lastQuestResult: QuestResult | null
//     winner: GameWinner
//     createdAt: timestamp
//     heartbeats: { [deviceId]: lastSeenTimestamp }
//     disconnectedPlayer: string | null
//
//     -- v3 additions --
//     availableCharacters: CharacterName[]    host's optional selection (stored for reference)
//     characters: { [deviceId]: CharacterName }  assigned at game start
//     confirmedRoleReveal: string[]           deviceIds who tapped "Next" on role reveal
//     leaderIndex: number                     index into players[] for current team leader
//     proposalVotes: { [deviceId]: boolean }  approve=true, reject=false
//     proposalCount: number                   proposals made on current quest (max 5)
//     assassinTarget: string | null           deviceId chosen by the Assassin
//
// PHASE FLOW (v3 network):
//   lobby -> role-reveal -> team-propose -> team-vote -> team-vote-results
//         -> voting -> results -> [next quest or assassination] -> gameover
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
import {
  VoteResult,
  QuestOutcome,
  QuestResult,
  GameWinner,
  GamePhase,
  CharacterName,
  shuffleArray,
} from './gameLogic';


// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------

export interface Player {
  deviceId: string;
  name:     string;
  joinedAt: number;
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
  heartbeats:          Record<string, number>;
  disconnectedPlayer:  string | null;

  // v3 fields
  availableCharacters: CharacterName[];
  characters:          Record<string, CharacterName>;
  confirmedRoleReveal: string[];
  leaderIndex:         number;
  proposalVotes:       Record<string, boolean>;
  proposalCount:       number;
  assassinTarget:      string | null;
}


// -----------------------------------------------------------------------------
// createRoom
//
// Called by host. Creates the room document.
// characters and leaderIndex are empty until host hits Start Game.
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
    // v3 initial values
    availableCharacters: [],
    characters:          {},
    confirmedRoleReveal: [],
    leaderIndex:         0,
    proposalVotes:       {},
    proposalCount:       0,
    assassinTarget:      null,
  };

  await setDoc(roomRef, initialData);
}


// -----------------------------------------------------------------------------
// joinRoom
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

  const alreadyIn = data.players.find(function(p) { return p.deviceId === deviceId; });
  if (alreadyIn) {
    return { success: true };
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
// updateAvailableCharacters
//
// Host only. Called as they toggle characters in the lobby picker.
// Saves their current optional selection so it persists in Firestore.
// (Merlin + Assassin are always implicit -- not stored separately.)
// -----------------------------------------------------------------------------
export async function updateAvailableCharacters(
  roomCode:   string,
  characters: CharacterName[]
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  await updateDoc(roomRef, {
    availableCharacters: characters,
  });
}


// -----------------------------------------------------------------------------
// startGame
//
// Host only. Assigns characters, sets leaderIndex to 0, moves to role-reveal.
// The full character assignment is computed on the host's device and written
// to Firestore. Players are sorted by joinedAt before assignment so order
// is deterministic.
// -----------------------------------------------------------------------------
export async function startGame(
  roomCode:          string,
  characters:        Record<string, CharacterName>,  // pre-computed by host
  availableChars:    CharacterName[]                  // optional selection for storage
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  await updateDoc(roomRef, {
    characters:          characters,
    availableCharacters: availableChars,
    leaderIndex:         0,
    proposalCount:       0,
    phase:               'role-reveal',
  });
}


// -----------------------------------------------------------------------------
// confirmRoleReveal
//
// Called by each player when they tap "Next" on their role card.
// Adds their deviceId to confirmedRoleReveal[].
// The host's device watches this array; when length === totalPlayers,
// it automatically advances to team-propose.
// -----------------------------------------------------------------------------
export async function confirmRoleReveal(
  roomCode: string,
  deviceId: string
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  await updateDoc(roomRef, {
    confirmedRoleReveal: arrayUnion(deviceId),
  });
}


// -----------------------------------------------------------------------------
// advanceToTeamPropose
//
// Host only. Called after all players have confirmed role reveal.
// Clears proposal state for the new proposal round.
// -----------------------------------------------------------------------------
export async function advanceToTeamPropose(
  roomCode: string
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  await updateDoc(roomRef, {
    missionPlayerIds: [],
    proposalVotes:    {},
    phase:            'team-propose',
  });
}


// -----------------------------------------------------------------------------
// submitTeamProposal
//
// Leader only. Saves the proposed team and moves everyone to team-vote.
// -----------------------------------------------------------------------------
export async function submitTeamProposal(
  roomCode:         string,
  missionPlayerIds: string[]
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  await updateDoc(roomRef, {
    missionPlayerIds: missionPlayerIds,
    proposalVotes:    {},  // clear any leftover votes
    phase:            'team-vote',
  });
}


// -----------------------------------------------------------------------------
// castProposalVote
//
// Called by each player to vote approve/reject on the proposed team.
// Uses a map field (proposalVotes.deviceId = bool) so each player
// can only vote once and re-submitting overwrites cleanly.
// -----------------------------------------------------------------------------
export async function castProposalVote(
  roomCode: string,
  deviceId: string,
  approve:  boolean
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  await updateDoc(roomRef, {
    [`proposalVotes.${deviceId}`]: approve,
  });
}


// -----------------------------------------------------------------------------
// resolveTeamVote
//
// Host only. Called after all proposal votes are in.
// If approved: move to team-vote-results (then on to voting).
// If rejected: increment proposalCount + leaderIndex, back to team-propose.
// If this was the 5th rejection: evil wins automatically.
// -----------------------------------------------------------------------------
export async function resolveTeamVote(
  roomCode:      string,
  approved:      boolean,
  nextLeaderIdx: number,
  newProposalCount: number,
  evilAutoWin:   boolean   // true if this rejection was the 5th
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);

  if (evilAutoWin) {
    // 5 rejections -- evil wins
    await updateDoc(roomRef, {
      winner:        'evil',
      phase:         'gameover',
      proposalCount: newProposalCount,
    });
    return;
  }

  if (approved) {
    // Move to results display before mission voting.
    // Also update leaderIndex and proposalCount now so that when the next
    // quest begins (after advanceToNextQuest), the leader is already correct.
    // proposalCount is NOT reset here -- it resets in advanceToNextQuest.
    // leaderIndex increments so the next quest starts with a new leader.
    await updateDoc(roomRef, {
      phase:         'team-vote-results',
      leaderIndex:   nextLeaderIdx,
      proposalCount: newProposalCount,
    });
  } else {
    // Rejection: pass leadership, reset proposal
    await updateDoc(roomRef, {
      leaderIndex:      nextLeaderIdx,
      proposalCount:    newProposalCount,
      missionPlayerIds: [],
      proposalVotes:    {},
      phase:            'team-propose',
    });
  }
}


// -----------------------------------------------------------------------------
// advanceToMissionVoting
//
// Host only. Called from team-vote-results screen after everyone has seen
// who voted what. Moves into actual success/fail voting.
// Clears mission votes from previous quests.
// -----------------------------------------------------------------------------
export async function advanceToMissionVoting(
  roomCode: string
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  await updateDoc(roomRef, {
    votes: [],
    phase: 'voting',
  });
}


// -----------------------------------------------------------------------------
// selectMissionPlayers (kept for compatibility but replaced by submitTeamProposal)
// -----------------------------------------------------------------------------
export async function selectMissionPlayers(
  roomCode:         string,
  missionPlayerIds: string[]
): Promise<void> {
  return submitTeamProposal(roomCode, missionPlayerIds);
}


// -----------------------------------------------------------------------------
// submitVote
//
// Called by a mission player when they tap a card (success/fail).
// -----------------------------------------------------------------------------
export async function submitVote(
  roomCode: string,
  deviceId: string,
  vote:     VoteResult
): Promise<void> {
  const roomRef    = doc(db, 'rooms', roomCode);
  const playerVote: PlayerVote = { deviceId, vote };
  await updateDoc(roomRef, {
    votes: arrayUnion(playerVote),
  });
}


// -----------------------------------------------------------------------------
// revealResults
//
// Host only. Evaluates mission votes and writes results.
// If good wins 3 quests, moves to assassination instead of gameover.
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
  const roomRef = doc(db, 'rooms', roomCode);
  const shuffledVotes = shuffleArray(votes);

  // If good would win, go to assassination phase first -- the winner is not
  // declared until the assassination resolves. We do NOT write winner: 'good'
  // here because that would trigger the good-wins background and music on all
  // devices before the Assassin has taken their shot.
  let nextPhase: GamePhase;
  let pendingWinner: GameWinner;

  if (winner === 'good') {
    nextPhase     = 'assassination';
    pendingWinner = null;   // winner stays null until assassination resolves
  } else if (winner === 'evil') {
    nextPhase     = 'gameover';
    pendingWinner = 'evil';
  } else {
    nextPhase     = 'results';
    pendingWinner = null;
  }

  await updateDoc(roomRef, {
    votes:           shuffledVotes,
    lastQuestResult: questResult,
    goodWins:        goodWins,
    evilWins:        evilWins,
    questOutcomes:   questOutcomes,
    phase:           nextPhase,
    winner:          pendingWinner,
  });
}


// -----------------------------------------------------------------------------
// advanceToNextQuest
//
// Host only. Resets mission/vote state for the next quest.
// leaderIndex continues incrementing from where it left off.
// proposalCount resets to 0 for the new quest.
// -----------------------------------------------------------------------------
export async function advanceToNextQuest(
  roomCode:        string,
  nextQuestNumber: number,
  nextLeaderIndex: number
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  await updateDoc(roomRef, {
    currentQuest:     nextQuestNumber,
    missionPlayerIds: [],
    votes:            [],
    proposalVotes:    {},
    proposalCount:    0,
    leaderIndex:      nextLeaderIndex,
    lastQuestResult:  null,
    phase:            'team-propose',
  });
}


// -----------------------------------------------------------------------------
// submitAssassinationTarget
//
// Assassin only. Writes their chosen target and resolves the game.
// If they picked Merlin, evil wins. Otherwise good wins.
// -----------------------------------------------------------------------------
export async function submitAssassinationTarget(
  roomCode:       string,
  targetDeviceId: string,
  winner:         GameWinner
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  await updateDoc(roomRef, {
    assassinTarget: targetDeviceId,
    winner:         winner,
    phase:          'gameover',
  });
}


// -----------------------------------------------------------------------------
// deleteRoom
// -----------------------------------------------------------------------------
export async function deleteRoom(roomCode: string): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  await deleteDoc(roomRef);
}


// -----------------------------------------------------------------------------
// sendHeartbeat
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
// -----------------------------------------------------------------------------
export async function markPlayerDisconnected(
  roomCode:                 string,
  playerName:               string,
  isDisconnectedPlayerHost: boolean
): Promise<void> {
  if (isDisconnectedPlayerHost) {
    await deleteDoc(doc(db, 'rooms', roomCode));
  } else {
    await updateDoc(doc(db, 'rooms', roomCode), {
      disconnectedPlayer: playerName,
    });
  }
}


// -----------------------------------------------------------------------------
// subscribeToRoom
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
