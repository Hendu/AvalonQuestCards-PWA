// =============================================================================
// firebaseGame.ts  (v3.9 -- reconnect support)
//
// All Firestore operations for multiplayer rooms.
//
// NEW in v3.9:
//   pendingDisconnect: PendingDisconnect | null
//     Non-null freezes gameplay for everyone; host sees a wait modal.
//     Cleared when the dropped player rejoins OR the host gives up.
//
//   setPendingDisconnect()   -- host calls this when heartbeat times out mid-game
//   hostGiveUpOnReconnect()  -- host gives up; kicks everyone via disconnectedPlayer
//   rejoinRoom()             -- dropped player rejoins; rewrites their deviceId everywhere
// =============================================================================

import {
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  deleteDoc,
  arrayUnion,
  arrayRemove,
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
  isBot:    boolean;   // v4.1: true for AI-controlled players
}

export interface PlayerVote {
  deviceId: string;
  vote:     VoteResult;
}

// v3.9: Pending disconnect -- freeze gameplay, wait for rejoin
export interface PendingDisconnect {
  deviceId:   string;   // dropped player's last-known deviceId
  name:       string;   // display name (used for rejoin matching)
  detectedAt: number;   // timestamp when host detected the drop
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

  // v3.9 reconnect
  pendingDisconnect:   PendingDisconnect | null;

  // v4: Lady of the Lake
  ladyOfTheLakeEnabled: boolean;
  ladyDeviceId:         string | null;     // current token holder's deviceId
  ladyHistory:          string[];          // all deviceIds who have held the token (public)
  ladyResult:           { targetDeviceId: string; alignment: 'good' | 'evil' } | null;
  //   ladyResult is written immediately after investigation so a reconnect doesn't
  //   let the token holder re-investigate. It's private -- never shown to others.

  // v4.1: Bots
  botsEnabled:          boolean;

  // v4.1.1: Team vote results always shown; this flag tells the results screen
  // whether to proceed to mission voting (true) or back to team-propose (false)
  lastProposalApproved: boolean;
}


// -----------------------------------------------------------------------------
// createRoom
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
    isBot:    false,
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
    availableCharacters: [],
    characters:          {},
    confirmedRoleReveal: [],
    leaderIndex:         0,
    proposalVotes:       {},
    proposalCount:       0,
    assassinTarget:      null,
    pendingDisconnect:   null,
    ladyOfTheLakeEnabled: false,
    ladyDeviceId:         null,
    ladyHistory:          [],
    ladyResult:           null,
    botsEnabled:          false,
    lastProposalApproved: false,
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

  // v4.1: If bots are enabled, human slots are locked -- no new humans can join
  if (data.botsEnabled) {
    return { success: false, error: 'That room is using bot players and is not accepting new players.' };
  }

  const alreadyIn = data.players.find(function(p) { return p.deviceId === deviceId; });
  if (alreadyIn) {
    return { success: true };
  }

  const newPlayer: Player = {
    deviceId: deviceId,
    name:     name,
    joinedAt: Date.now(),
    isBot:    false,
  };

  await updateDoc(roomRef, {
    players: arrayUnion(newPlayer),
  });

  return { success: true };
}


// -----------------------------------------------------------------------------
// rejoinRoom  (v3.9)
//
// Called when a disconnected player taps "Rejoin Game" on the start screen.
//
// Matches the player by name (case-insensitive) OR by unchanged deviceId.
// Rewrites their old deviceId to the new one in every field that stores it,
// then clears pendingDisconnect so everyone's freeze modal disappears.
// -----------------------------------------------------------------------------
export async function rejoinRoom(
  roomCode:    string,
  newDeviceId: string,
  playerName:  string
): Promise<{ success: boolean; error?: string; wasHost?: boolean }> {
  const roomRef  = doc(db, 'rooms', roomCode);
  const snapshot = await getDoc(roomRef);

  if (!snapshot.exists()) {
    return { success: false, error: 'Room no longer exists.' };
  }

  const data = snapshot.data() as RoomData;

  // Match by name (primary -- handles cleared localStorage) or unchanged deviceId
  const oldPlayer = data.players.find(function(p) {
    return (
      p.name.toLowerCase() === playerName.toLowerCase() ||
      p.deviceId === newDeviceId
    );
  });

  if (!oldPlayer) {
    return { success: false, error: 'Could not find your player slot in this room.' };
  }

  const oldDeviceId = oldPlayer.deviceId;

  // If deviceId hasn't changed, just clear pendingDisconnect and refresh heartbeat
  if (oldDeviceId === newDeviceId) {
    await updateDoc(roomRef, {
      [`heartbeats.${newDeviceId}`]: Date.now(),
      pendingDisconnect: null,
    });
    return { success: true, wasHost: data.hostDeviceId === newDeviceId };
  }

  // ------------------------------------------------------------------
  // Rewrite oldDeviceId -> newDeviceId throughout the document.
  // ------------------------------------------------------------------

  // 1. players[] -- replace the player object
  const newPlayers = data.players.map(function(p) {
    if (p.deviceId !== oldDeviceId) return p;
    return { ...p, deviceId: newDeviceId };
  });

  // 2. characters{} -- rename the key
  const newCharacters: Record<string, CharacterName> = {};
  for (const [id, char] of Object.entries(data.characters || {})) {
    newCharacters[id === oldDeviceId ? newDeviceId : id] = char;
  }

  // 3. heartbeats{} -- add new key, drop old
  const newHeartbeats: Record<string, number> = { ...(data.heartbeats || {}) };
  newHeartbeats[newDeviceId] = Date.now();
  delete newHeartbeats[oldDeviceId];

  // 4. confirmedRoleReveal[] -- replace id if present
  const newConfirmed = (data.confirmedRoleReveal || []).map(function(id) {
    return id === oldDeviceId ? newDeviceId : id;
  });

  // 5. proposalVotes{} -- rename key if present
  const newProposalVotes: Record<string, boolean> = {};
  for (const [id, vote] of Object.entries(data.proposalVotes || {})) {
    newProposalVotes[id === oldDeviceId ? newDeviceId : id] = vote;
  }

  // 6. missionPlayerIds[] -- replace if present
  const newMissionIds = (data.missionPlayerIds || []).map(function(id) {
    return id === oldDeviceId ? newDeviceId : id;
  });

  // 7. votes[] -- replace deviceId in vote objects
  const newVotes = (data.votes || []).map(function(v) {
    if (v.deviceId !== oldDeviceId) return v;
    return { ...v, deviceId: newDeviceId };
  });

  // 8. hostDeviceId -- if somehow this was the host
  const newHostDeviceId = data.hostDeviceId === oldDeviceId ? newDeviceId : data.hostDeviceId;

  // 9. v4: ladyDeviceId -- rewrite if token holder disconnected
  const newLadyDeviceId = (data.ladyDeviceId === oldDeviceId) ? newDeviceId : (data.ladyDeviceId ?? null);

  // 10. v4: ladyHistory[] -- rewrite if old deviceId appears in public history
  const newLadyHistory = (data.ladyHistory || []).map(function(id) {
    return id === oldDeviceId ? newDeviceId : id;
  });

  // 11. v4: ladyResult -- if the disconnected player was being investigated, rewrite targetDeviceId
  let newLadyResult = data.ladyResult ?? null;
  if (newLadyResult && newLadyResult.targetDeviceId === oldDeviceId) {
    newLadyResult = { ...newLadyResult, targetDeviceId: newDeviceId };
  }

  await updateDoc(roomRef, {
    hostDeviceId:        newHostDeviceId,
    players:             newPlayers,
    characters:          newCharacters,
    heartbeats:          newHeartbeats,
    confirmedRoleReveal: newConfirmed,
    proposalVotes:       newProposalVotes,
    missionPlayerIds:    newMissionIds,
    votes:               newVotes,
    ladyDeviceId:        newLadyDeviceId,
    ladyHistory:         newLadyHistory,
    ladyResult:          newLadyResult,
    pendingDisconnect:   null,
  });

  return { success: true, wasHost: newHostDeviceId === newDeviceId };
}


// -----------------------------------------------------------------------------
// setPendingDisconnect  (v3.9)
//
// Host calls this when a guest's heartbeat times out mid-game.
// Writes pendingDisconnect to Firestore, which causes all clients to freeze
// and show a wait modal. Does NOT delete the room.
// -----------------------------------------------------------------------------
export async function setPendingDisconnect(
  roomCode: string,
  player:   Player
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  const pd: PendingDisconnect = {
    deviceId:   player.deviceId,
    name:       player.name,
    detectedAt: Date.now(),
  };
  await updateDoc(roomRef, {
    pendingDisconnect: pd,
  });
}


// -----------------------------------------------------------------------------
// hostGiveUpOnReconnect  (v3.9)
//
// Host tapped "End Game" in the wait modal.
// Deletes the room entirely -- this triggers onNotFound() → handleRoomGone()
// on every subscribed client, which is the cleanest way to kick everyone.
// Writing disconnectedPlayer was the original approach but proved unreliable
// because the host's own applyRoomData would unsubscribe before the write
// fully propagated to all guests. Deletion is atomic and guaranteed.
// -----------------------------------------------------------------------------
export async function hostGiveUpOnReconnect(
  roomCode:   string,
  playerName: string
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  await deleteDoc(roomRef);
}


// -----------------------------------------------------------------------------
// updateAvailableCharacters
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
// updateLadyOfTheLakeEnabled
// -----------------------------------------------------------------------------
export async function updateLadyOfTheLakeEnabled(
  roomCode: string,
  enabled:  boolean
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  await updateDoc(roomRef, {
    ladyOfTheLakeEnabled: enabled,
  });
}



// -----------------------------------------------------------------------------
// updateBotsEnabled  (v4.1)
//
// Host toggles bots on/off. When turned on, bot players are written into the
// players array immediately to fill remaining slots. When turned off, bot
// players are removed and slots reopen for humans.
// -----------------------------------------------------------------------------
export async function updateBotsEnabled(
  roomCode:    string,
  enabled:     boolean,
  currentPlayers: Player[],
  totalPlayers:   number,
  botPlayersToAdd: Player[]   // pre-built bot Player objects (from hostToggleBots)
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);

  if (enabled) {
    // Add bot players to fill remaining slots
    const allPlayers = [...currentPlayers, ...botPlayersToAdd];
    await updateDoc(roomRef, {
      botsEnabled: true,
      players:     allPlayers,
    });
  } else {
    // Remove all bot players, reopen slots
    const humanPlayers = currentPlayers.filter(function(p) { return !p.isBot; });
    await updateDoc(roomRef, {
      botsEnabled: false,
      players:     humanPlayers,
    });
  }
}



export async function startGame(
  roomCode:       string,
  characters:     Record<string, CharacterName>,
  availableChars: CharacterName[],
  initialLadyId:  string | null    // v4: randomly chosen initial token holder (null if LoTL off)
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  await updateDoc(roomRef, {
    characters:          characters,
    availableCharacters: availableChars,
    leaderIndex:         0,
    proposalCount:       0,
    // v4: seed initial lady token holder; history starts with just her
    ladyDeviceId:        initialLadyId,
    ladyHistory:         initialLadyId ? [initialLadyId] : [],
    ladyResult:          null,
    phase:               'role-reveal',
  });
}


// -----------------------------------------------------------------------------
// confirmRoleReveal
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
// -----------------------------------------------------------------------------
export async function submitTeamProposal(
  roomCode:         string,
  missionPlayerIds: string[]
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  await updateDoc(roomRef, {
    missionPlayerIds: missionPlayerIds,
    proposalVotes:    {},
    phase:            'team-vote',
  });
}


// -----------------------------------------------------------------------------
// castProposalVote
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
// -----------------------------------------------------------------------------
export async function resolveTeamVote(
  roomCode:         string,
  approved:         boolean,
  nextLeaderIdx:    number,
  newProposalCount: number,
  evilAutoWin:      boolean
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);

  if (evilAutoWin) {
    await updateDoc(roomRef, {
      winner:        'evil',
      phase:         'gameover',
      proposalCount: newProposalCount,
    });
    return;
  }

  // Always route through team-vote-results so all players can see who voted
  // what before proceeding — whether the vote passed OR failed.
  // The results screen reads lastProposalApproved to know where to go next.
  await updateDoc(roomRef, {
    phase:               'team-vote-results',
    leaderIndex:         nextLeaderIdx,
    proposalCount:       newProposalCount,
    lastProposalApproved: approved,
  });
}


// -----------------------------------------------------------------------------
// advanceFromVoteResults  (v4.1.1)
//
// Host taps Continue on the team-vote-results screen.
// Routes to mission voting if the proposal was approved, or back to
// team-propose (clearing the rejected team) if it was rejected.
// -----------------------------------------------------------------------------
export async function advanceFromVoteResults(
  roomCode: string,
  approved: boolean
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  if (approved) {
    await updateDoc(roomRef, {
      votes: [],
      phase: 'voting',
    });
  } else {
    await updateDoc(roomRef, {
      missionPlayerIds: [],
      proposalVotes:    {},
      phase:            'team-propose',
    });
  }
}



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
// selectMissionPlayers (kept for compatibility)
// -----------------------------------------------------------------------------
export async function selectMissionPlayers(
  roomCode:         string,
  missionPlayerIds: string[]
): Promise<void> {
  return submitTeamProposal(roomCode, missionPlayerIds);
}


// -----------------------------------------------------------------------------
// submitVote
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

  let nextPhase: GamePhase;
  let pendingWinner: GameWinner;

  if (winner === 'good') {
    nextPhase     = 'assassination';
    pendingWinner = null;
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
// v4: When ladyOfTheLakeEnabled is true and it's not quest 5, route to
// 'lady-of-the-lake' instead of 'team-propose'. The lady phase itself
// is responsible for advancing to 'team-propose' via submitLadyResult().
// ladyDeviceId is NOT changed here -- it carries over from the previous
// assignment (or game start). The LoTL screen handles the handoff.
// -----------------------------------------------------------------------------
export async function advanceToNextQuest(
  roomCode:             string,
  nextQuestNumber:      number,
  nextLeaderIndex:      number,
  ladyOfTheLakeEnabled: boolean,
  currentLadyDeviceId:  string | null   // needed to set phase correctly
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);

  // Lady of the Lake fires after quests 1-4 only (not after quest 5).
  // Quest 5 always goes straight to team-propose (or gameover -- caller handles that).
  const useLady = ladyOfTheLakeEnabled && nextQuestNumber <= 5 && (nextQuestNumber - 1) <= 4;
  // More precisely: LoTL fires between quest results. nextQuestNumber is the upcoming
  // quest. If ladyEnabled and the completed quest was NOT quest 4 (last one before 5),
  // we use LoTL. Actually rule: after quests 1–4 results, before quest 2–5 team-propose.
  // So: use LoTL when nextQuestNumber is 2, 3, 4, or 5 AND ladyEnabled.
  // (nextQuestNumber === 5 is fine -- LoTL still fires before quest 5 team-propose)
  // But after quest 5 the game ends -- advanceToNextQuest is never called for quest 6.
  const nextPhase: GamePhase = (ladyOfTheLakeEnabled && nextQuestNumber >= 2 && nextQuestNumber <= 5)
    ? 'lady-of-the-lake'
    : 'team-propose';

  await updateDoc(roomRef, {
    currentQuest:     nextQuestNumber,
    missionPlayerIds: [],
    votes:            [],
    proposalVotes:    {},
    proposalCount:    0,
    leaderIndex:      nextLeaderIndex,
    lastQuestResult:  null,
    ladyResult:       null,   // clear any leftover investigation result
    phase:            nextPhase,
  });
}


// -----------------------------------------------------------------------------
// advanceToLadyOfTheLake
//
// Host calls this after quest results when LoTL is enabled.
// (In practice advanceToNextQuest already sets the phase directly;
// this function exists as a standalone escape hatch and is not currently
// called from useGameState -- advanceToNextQuest handles the routing.)
// -----------------------------------------------------------------------------
export async function advanceToLadyOfTheLake(
  roomCode:      string,
  ladyDeviceId:  string
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  await updateDoc(roomRef, {
    ladyDeviceId: ladyDeviceId,
    ladyResult:   null,
    phase:        'lady-of-the-lake',
  });
}


// -----------------------------------------------------------------------------
// submitLadyResult
//
// Called by the token holder's device after they select a target to investigate.
// Writes the result immediately (so a reconnect shows the already-revealed result
// rather than allowing a re-investigation), appends current holder to ladyHistory,
// passes the token to the target, and advances to 'team-propose'.
//
// currentLadyDeviceId: the player who currently holds the token (making this call).
// targetDeviceId:      the player they chose to investigate.
// alignment:           computed client-side from CHARACTERS[characters[targetDeviceId]].alignment
// -----------------------------------------------------------------------------
export async function submitLadyResult(
  roomCode:            string,
  currentLadyDeviceId: string,
  targetDeviceId:      string,
  alignment:           'good' | 'evil'
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);

  // We need to read the current ladyHistory to append to it atomically.
  // arrayUnion handles deduplication safely.
  await updateDoc(roomRef, {
    // Store the result privately -- only the current token holder reads this field.
    // It's cleared when the phase advances, and on the next advanceToNextQuest.
    ladyResult:   { targetDeviceId, alignment },
    // Append the current holder to the public history (the target will be added
    // when THEY investigate, i.e. when they become the new currentLady)
    ladyHistory:  arrayUnion(currentLadyDeviceId),
    // Hand the token to the investigated player
    ladyDeviceId: targetDeviceId,
    // Advance the game -- investigation is complete
    phase:        'team-propose',
  });
}


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
    // Room deleted -- silently ignore
  }
}


// -----------------------------------------------------------------------------
// removePlayerFromLobby
// -----------------------------------------------------------------------------
export async function removePlayerFromLobby(
  roomCode: string,
  player:   Player
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  await updateDoc(roomRef, {
    players: arrayRemove(player),
  });
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
// markPlayerQuit
// -----------------------------------------------------------------------------
export async function markPlayerQuit(
  roomCode:   string,
  playerName: string,
  isHost:     boolean
): Promise<void> {
  if (isHost) {
    await deleteDoc(doc(db, 'rooms', roomCode));
  } else {
    await updateDoc(doc(db, 'rooms', roomCode), {
      disconnectedPlayer: `${playerName} quit the game`,
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