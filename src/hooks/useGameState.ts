// =============================================================================
// useGameState.ts  (v4.0 -- Lady of the Lake)
//
// Central state hook. Handles local mode (unchanged) and network mode.
//
// NEW in v4.0:
//   Lady of the Lake (LoTL) mechanic:
//     - Host can toggle ladyOfTheLakeEnabled in the lobby.
//     - On game start, a random initial token holder is chosen and written to
//       Firestore alongside the character assignment.
//     - After quests 1–4, advanceToNextQuest routes to 'lady-of-the-lake' when
//       LoTL is enabled instead of going straight to 'team-propose'.
//     - The token holder's device calls submitLadyInvestigation(targetDeviceId),
//       which computes alignment client-side, writes the result to Firestore,
//       passes the token, and advances to 'team-propose'. No host auto-advance
//       is needed -- same pattern as playerConfirmRoleReveal.
//     - New GameState fields: ladyOfTheLakeEnabled, ladyDeviceId, ladyHistory,
//       ladyResult, amILady.
//
// Previous versions:
//   v3.9 -- reconnect support (pendingDisconnect, rejoinNetworkGame)
// =============================================================================

import { useState, useEffect, useRef } from 'react';

import {
  VoteResult,
  QuestOutcome,
  QuestResult,
  GameWinner,
  GamePhase,
  GameMode,
  CharacterName,
  getMissionSize,
  shuffleArray,
  evaluateVotes,
  evaluateProposalVotes,
  checkForWinner,
  generateRoomCode,
  assignCharacters,
  getFullCharacterList,
  resolveAssassination,
  CHARACTERS,
} from '../utils/gameLogic';

import {
  Player,
  PlayerVote,
  PendingDisconnect,
  RoomData,
  createRoom,
  joinRoom,
  rejoinRoom,
  startGame,
  updateAvailableCharacters,
  updateLadyOfTheLakeEnabled,
  updateBotsEnabled,
  confirmRoleReveal,
  advanceToTeamPropose,
  submitTeamProposal,
  castProposalVote,
  resolveTeamVote,
  advanceFromVoteResults,
  advanceToMissionVoting,
  submitVote,
  revealResults,
  advanceToNextQuest as firebaseAdvanceToNextQuest,
  submitLadyResult,
  submitAssassinationTarget,
  deleteRoom,
  subscribeToRoom,
  sendHeartbeat,
  markPlayerQuit,
  removePlayerFromLobby,
  setPendingDisconnect,
  hostGiveUpOnReconnect,
} from '../utils/firebaseGame';

import {
  isBotDeviceId,
  makeBotPlayer,
  pickBotNames,
  botThinkDelay,
  BOT_DELAYS,
  MissionRecord,
  VoteRecord,
  computeHeatmap,
  computeProposalSuspicion,
  decideBotProposal,
  decideBotProposalVote,
  decideBotMissionVote,
  decideBotLadyTarget,
  decideBotAssassination,
} from '../utils/botBrain';

import { getDeviceId } from '../utils/deviceId';


// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------

// Info needed for the StartScreen to offer a "Rejoin Game" button
export interface RejoinInfo {
  roomCode:   string;
  playerName: string;
}

export interface GameState {
  // Core game data
  totalPlayers:        number;
  currentQuest:        number;
  goodWins:            number;
  evilWins:            number;
  questOutcomes:       QuestOutcome[];
  phase:               GamePhase;
  lastQuestResult:     QuestResult | null;
  winner:              GameWinner;
  soundEnabled:        boolean;

  // Network-specific
  gameMode:            GameMode;
  roomCode:            string | null;
  myDeviceId:          string;
  myName:              string;
  isHost:              boolean;
  players:             Player[];
  missionPlayerIds:    string[];
  votes:               PlayerVote[];
  errorMessage:        string | null;
  isLoading:           boolean;
  disconnectMessage:   string | null;

  // v3: Character data
  myCharacter:         CharacterName | null;
  characters:          Record<string, CharacterName>;
  availableCharacters: CharacterName[];
  confirmedRoleReveal: string[];

  // v3: Leader / proposal data
  leaderIndex:         number;
  proposalVotes:       Record<string, boolean>;
  proposalCount:       number;
  assassinTarget:      string | null;

  // v3.9: Reconnect
  pendingDisconnect:   PendingDisconnect | null;
  rejoinInfo:          RejoinInfo | null;   // set when THIS device is booted for disconnect

  // v4: Lady of the Lake
  ladyOfTheLakeEnabled: boolean;
  ladyDeviceId:         string | null;
  ladyHistory:          string[];
  ladyResult:           { targetDeviceId: string; alignment: 'good' | 'evil' } | null;
  amILady:              boolean;

  // v4.1: Bots
  botsEnabled:          boolean;

  // v4.1.1: always shown after team vote, regardless of outcome
  lastProposalApproved: boolean;

  // Derived convenience flags
  amIOnMission:           boolean;
  haveIVoted:             boolean;
  allVotesIn:             boolean;
  amILeader:              boolean;
  amIAssassin:            boolean;
  leaderDeviceId:         string;
  allRoleRevealsConfirmed: boolean;
  allProposalVotesIn:     boolean;
  haveICastProposalVote:  boolean;
}

function getInitialState(deviceId: string): GameState {
  return {
    totalPlayers:        5,
    currentQuest:        1,
    goodWins:            0,
    evilWins:            0,
    questOutcomes:       [null, null, null, null, null],
    phase:               'setup',
    lastQuestResult:     null,
    winner:              null,
    soundEnabled:        false,
    gameMode:            'local',
    roomCode:            null,
    myDeviceId:          deviceId,
    myName:              '',
    isHost:              false,
    players:             [],
    missionPlayerIds:    [],
    votes:               [],
    errorMessage:        null,
    isLoading:           false,
    disconnectMessage:   null,
    myCharacter:         null,
    characters:          {},
    availableCharacters: [],
    confirmedRoleReveal: [],
    leaderIndex:         0,
    proposalVotes:       {},
    proposalCount:       0,
    assassinTarget:      null,
    pendingDisconnect:   null,
    rejoinInfo:          null,
    // v4 LoTL
    ladyOfTheLakeEnabled: false,
    ladyDeviceId:         null,
    ladyHistory:          [],
    ladyResult:           null,
    amILady:              false,
    // v4.1 Bots
    botsEnabled:          false,
    lastProposalApproved: false,
    // Derived flags
    amIOnMission:           false,
    haveIVoted:             false,
    allVotesIn:             false,
    amILeader:              false,
    amIAssassin:            false,
    leaderDeviceId:         '',
    allRoleRevealsConfirmed: false,
    allProposalVotesIn:     false,
    haveICastProposalVote:  false,
  };
}

function getSortedPlayers(players: Player[]): Player[] {
  return [...players].sort(function(a, b) { return a.joinedAt - b.joinedAt; });
}


// -----------------------------------------------------------------------------
// useGameState hook
// -----------------------------------------------------------------------------
export function useGameState() {
  const myDeviceId = useRef(getDeviceId()).current;
  const [state, setState] = useState<GameState>(getInitialState(myDeviceId));
  const unsubscribeRef    = useRef<(() => void) | null>(null);
  const stateRef          = useRef(state);
  stateRef.current        = state;

  // ---------------------------------------------------------------------------
  // WAKE LOCK
  // ---------------------------------------------------------------------------
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  async function requestWakeLock(): Promise<void> {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
    } catch (e) {}
  }

  function releaseWakeLock(): void {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  }

  useEffect(function() {
    if (state.phase !== 'setup' && state.phase !== 'lobby') {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
  }, [state.phase]);

  useEffect(function() {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && state.phase !== 'setup' && state.phase !== 'lobby') {
        requestWakeLock();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return function() {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.phase]);

  useEffect(function() {
    return function() {
      if (unsubscribeRef.current) unsubscribeRef.current();
    };
  }, []);


  // ---------------------------------------------------------------------------
  // HEARTBEAT
  // ---------------------------------------------------------------------------
  useEffect(function() {
    if (state.gameMode !== 'network' || state.phase === 'setup' || !state.roomCode) return;
    const roomCode = state.roomCode;
    const deviceId = myDeviceId;
    sendHeartbeat(roomCode, deviceId);
    const interval = setInterval(function() {
      sendHeartbeat(roomCode, deviceId);
    }, 3000);
    return function() { clearInterval(interval); };
  }, [state.gameMode, state.phase, state.roomCode]);


  // ---------------------------------------------------------------------------
  // DISCONNECT DETECTION -- GUEST WATCHES HOST (v3.9)
  // ---------------------------------------------------------------------------
  useEffect(function() {
    if (state.isHost || state.gameMode !== 'network' || state.phase === 'setup' || state.phase === 'lobby') return;
    const interval = setInterval(function() {
      const s = stateRef.current;
      if (!s.roomCode || s.phase === 'setup' || s.phase === 'gameover' || s.isHost) return;
      if (s.pendingDisconnect) return;
      const heartbeats = (s as any)._heartbeats as Record<string, number> | undefined;
      if (!heartbeats) return;
      const sortedPlayers = getSortedPlayers(s.players);
      const hostPlayer    = sortedPlayers[0];
      if (!hostPlayer) return;
      const lastSeen = heartbeats[hostPlayer.deviceId] || 0;
      if (Date.now() - lastSeen > 25000) {
        setPendingDisconnect(s.roomCode!, hostPlayer);
      }
    }, 3000);
    return function() { clearInterval(interval); };
  }, [state.isHost, state.gameMode, state.phase]);


  // ---------------------------------------------------------------------------
  // DISCONNECT DETECTION (host only)
  // ---------------------------------------------------------------------------
  useEffect(function() {
    if (!state.isHost || state.gameMode !== 'network' || state.phase === 'setup') return;
    const interval = setInterval(function() {
      const s = stateRef.current;
      if (!s.roomCode || s.phase === 'setup' || s.phase === 'gameover') return;
      if (s.pendingDisconnect) return;
      const heartbeats = (s as any)._heartbeats as Record<string, number> | undefined;
      if (!heartbeats) return;
      const now        = Date.now();
      const inLobby    = s.phase === 'lobby';
      const TIMEOUT_MS = inLobby ? 8000 : 25000;
      for (const player of s.players) {
        // Bots have no heartbeat -- never evict them
        if (isBotDeviceId(player.deviceId)) continue;
        const lastSeen      = heartbeats[player.deviceId] || 0;
        const sortedPlayers = getSortedPlayers(s.players);
        const hostDeviceId  = sortedPlayers[0]?.deviceId;
        const isPlayerHost  = player.deviceId === hostDeviceId;
        if (now - lastSeen > TIMEOUT_MS) {
          if (inLobby && !isPlayerHost) {
            removePlayerFromLobby(s.roomCode!, player);
          } else if (!isPlayerHost) {
            setPendingDisconnect(s.roomCode!, player);
          }
          break;
        }
      }
    }, 3000);
    return function() { clearInterval(interval); };
  }, [state.isHost, state.gameMode, state.phase]);


  // ---------------------------------------------------------------------------
  // AUTO-ADVANCE: role-reveal -> team-propose
  // ---------------------------------------------------------------------------
  useEffect(function() {
    if (
      state.gameMode === 'network' &&
      state.isHost &&
      state.phase === 'role-reveal' &&
      state.allRoleRevealsConfirmed &&
      !state.pendingDisconnect
    ) {
      advanceToTeamPropose(state.roomCode!);
    }
  }, [state.allRoleRevealsConfirmed, state.phase, state.isHost, state.gameMode, state.pendingDisconnect]);


  // ---------------------------------------------------------------------------
  // AUTO-RESOLVE: team-vote -> team-vote-results or team-propose
  // ---------------------------------------------------------------------------
  useEffect(function() {
    if (
      state.gameMode === 'network' &&
      state.isHost &&
      state.phase === 'team-vote' &&
      state.allProposalVotesIn &&
      !state.pendingDisconnect
    ) {
      const timer = setTimeout(function() {
        const s = stateRef.current;
        if (!s.allProposalVotesIn || s.phase !== 'team-vote' || !s.isHost || s.pendingDisconnect) return;
        const result      = evaluateProposalVotes(s.proposalVotes);
        const newCount    = s.proposalCount + 1;
        const evilAutoWin = !result.approved && newCount >= 5;
        const sorted        = getSortedPlayers(s.players);
        const nextLeaderIdx = (s.leaderIndex + 1) % sorted.length;
        // Capture current leader before index advances — needed for mission record
        if (result.approved) {
          const currentLeader = sorted[s.leaderIndex % sorted.length];
          if (currentLeader) lastApprovedLeaderRef.current = currentLeader.deviceId;
        }
        resolveTeamVote(s.roomCode!, result.approved, nextLeaderIdx, newCount, evilAutoWin);
      }, 800);
      return function() { clearTimeout(timer); };
    }
  }, [state.allProposalVotesIn, state.phase, state.isHost, state.gameMode, state.pendingDisconnect]);


  // ---------------------------------------------------------------------------
  // AUTO-REVEAL: voting -> results
  // ---------------------------------------------------------------------------
  useEffect(function() {
    if (
      state.gameMode === 'network' &&
      state.isHost &&
      state.phase === 'voting' &&
      state.allVotesIn &&
      !state.pendingDisconnect
    ) {
      const timer = setTimeout(function() {
        const s = stateRef.current;
        if (!s.allVotesIn || s.phase !== 'voting' || !s.isHost || s.pendingDisconnect) return;
        const voteValues  = s.votes.map(function(v) { return v.vote; });
        const questResult = evaluateVotes(voteValues, s.totalPlayers, s.currentQuest);
        const newGoodWins = s.goodWins + (questResult.missionPassed ? 1 : 0);
        const newEvilWins = s.evilWins + (questResult.missionPassed ? 0 : 1);
        const newOutcomes = [...s.questOutcomes] as QuestOutcome[];
        newOutcomes[s.currentQuest - 1] = questResult.missionPassed ? 'good' : 'evil';
        const winner = checkForWinner(newGoodWins, newEvilWins);
        if (s.roomCode) {
          revealResults(s.roomCode, s.votes, questResult, newGoodWins, newEvilWins, newOutcomes, winner);
        }
      }, 800);
      return function() { clearTimeout(timer); };
    }
  }, [state.allVotesIn, state.phase, state.isHost, state.gameMode, state.pendingDisconnect]);


  // ---------------------------------------------------------------------------
  // BOT ENGINE  (v4.1 — tuned, simulation-validated)
  //
  // All bot actions run on the host only. Each useEffect watches for a phase
  // where a bot needs to act, waits a role-appropriate delay, then fires the
  // Firestore write on behalf of that bot.
  //
  // missionHistoryRef: full history of all completed missions — team, leader,
  // outcome, quest index. Used for recency-weighted heatmap and proposal suspicion.
  // merlinRejectRef: per-bot running reject ratio used by Merlin's blending.
  // ---------------------------------------------------------------------------
  const missionHistoryRef    = useRef<MissionRecord[]>([]);
  const voteHistoryRef       = useRef<VoteRecord[]>([]);
  const ladyKnowledgeRef     = useRef<Record<string, Record<string, 'good' | 'evil'>>>({});
  const merlinRejectRef      = useRef<Record<string, { rejects: number; total: number }>>({});
  const lastApprovedLeaderRef = useRef<string | null>(null);

  function getHeatmap(): Record<string, number> {
    return computeHeatmap(missionHistoryRef.current);
  }

  function getProposalSuspicion(): Record<string, number> {
    return computeProposalSuspicion(missionHistoryRef.current);
  }

  function getMerlinRejectRatio(botDeviceId: string): number {
    const r = merlinRejectRef.current[botDeviceId];
    if (!r || r.total === 0) return 0;
    return r.rejects / r.total;
  }

  function trackBotVote(botDeviceId: string, approved: boolean): void {
    const existing = merlinRejectRef.current[botDeviceId] || { rejects: 0, total: 0 };
    merlinRejectRef.current[botDeviceId] = {
      rejects: existing.rejects + (approved ? 0 : 1),
      total:   existing.total + 1,
    };
  }


  // BOT: role-reveal — bots auto-confirm after a short staggered delay
  useEffect(function() {
    if (
      !state.isHost ||
      state.gameMode !== 'network' ||
      state.phase !== 'role-reveal' ||
      !state.botsEnabled ||
      state.pendingDisconnect
    ) return;

    const botPlayers  = state.players.filter(function(p) { return isBotDeviceId(p.deviceId); });
    const unconfirmed = botPlayers.filter(function(p) {
      return !state.confirmedRoleReveal.includes(p.deviceId);
    });
    if (unconfirmed.length === 0) return;

    const timers = unconfirmed.map(function(bot, idx) {
      const delay = botThinkDelay(BOT_DELAYS.roleReveal.min, BOT_DELAYS.roleReveal.max) + idx * 300;
      return setTimeout(function() {
        const s = stateRef.current;
        if (s.phase !== 'role-reveal' || !s.roomCode) return;
        import('../utils/firebaseGame').then(function(fb) {
          fb.confirmRoleReveal(s.roomCode!, bot.deviceId);
        });
      }, delay);
    });

    return function() { timers.forEach(clearTimeout); };
  }, [state.phase, state.botsEnabled, state.isHost, state.confirmedRoleReveal.length]);


  // BOT: team-propose — if the current leader is a bot, propose a team
  useEffect(function() {
    if (
      !state.isHost ||
      state.gameMode !== 'network' ||
      state.phase !== 'team-propose' ||
      !state.botsEnabled ||
      state.pendingDisconnect
    ) return;

    const sortedPlayers = getSortedPlayers(state.players);
    const safeIdx       = state.leaderIndex % Math.max(sortedPlayers.length, 1);
    const leader        = sortedPlayers[safeIdx];
    if (!leader || !isBotDeviceId(leader.deviceId)) return;

    const missionSize = getMissionSize(state.totalPlayers, state.currentQuest);
    const leaderChar  = state.characters[leader.deviceId];
    if (!leaderChar) return;

    const timer = setTimeout(function() {
      const s = stateRef.current;
      if (s.phase !== 'team-propose' || !s.roomCode) return;
      const heatmap  = getHeatmap();
      const proposal = decideBotProposal(
        leader.deviceId, leaderChar, s.characters,
        s.players, heatmap, missionSize
      );
      submitTeamProposal(s.roomCode, proposal);
    }, botThinkDelay(BOT_DELAYS.leaderPropose.min, BOT_DELAYS.leaderPropose.max));

    return function() { clearTimeout(timer); };
  }, [state.phase, state.leaderIndex, state.botsEnabled, state.isHost]);


  // BOT: team-vote — each bot that hasn't voted casts its vote
  useEffect(function() {
    if (
      !state.isHost ||
      state.gameMode !== 'network' ||
      state.phase !== 'team-vote' ||
      !state.botsEnabled ||
      state.pendingDisconnect
    ) return;

    const botPlayers = state.players.filter(function(p) { return isBotDeviceId(p.deviceId); });
    const unvoted    = botPlayers.filter(function(p) {
      return !(p.deviceId in state.proposalVotes);
    });
    if (unvoted.length === 0) return;

    const timers = unvoted.map(function(bot, idx) {
      const delay = botThinkDelay(BOT_DELAYS.proposalVote.min, BOT_DELAYS.proposalVote.max) + idx * 150;
      return setTimeout(function() {
        const s = stateRef.current;
        if (s.phase !== 'team-vote' || !s.roomCode) return;
        if (bot.deviceId in s.proposalVotes) return;
        const botChar = s.characters[bot.deviceId];
        if (!botChar) return;

        const heatmap          = getHeatmap();
        const rejectRatio      = getMerlinRejectRatio(bot.deviceId);
        const ladyKnow         = ladyKnowledgeRef.current[bot.deviceId] || {};
        const merlinId         = Object.entries(s.characters).find(function([, c]) { return c === 'Merlin'; })?.[0] ?? null;
        const propSuspicion    = getProposalSuspicion();
        const sorted           = getSortedPlayers(s.players);
        const currentLeader    = sorted[s.leaderIndex % Math.max(sorted.length, 1)];
        const currentLeaderId  = currentLeader?.deviceId ?? '';
        const approve          = decideBotProposalVote(
          bot.deviceId, botChar, s.characters,
          s.missionPlayerIds, heatmap,
          s.proposalCount + 1,
          rejectRatio,
          voteHistoryRef.current,
          ladyKnow,
          merlinId,
          propSuspicion,
          currentLeaderId
        );

        if (botChar === 'Merlin') trackBotVote(bot.deviceId, approve);

        castProposalVote(s.roomCode!, bot.deviceId, approve);
      }, delay);
    });

    return function() { timers.forEach(clearTimeout); };
  }, [state.phase, state.botsEnabled, state.isHost,
      Object.keys(state.proposalVotes).length]);


  // BOT: mission voting — each bot on the mission casts their vote
  useEffect(function() {
    if (
      !state.isHost ||
      state.gameMode !== 'network' ||
      state.phase !== 'voting' ||
      !state.botsEnabled ||
      state.pendingDisconnect
    ) return;

    const botsOnMission = state.players.filter(function(p) {
      return isBotDeviceId(p.deviceId) && state.missionPlayerIds.includes(p.deviceId);
    });
    const unvoted = botsOnMission.filter(function(p) {
      return !state.votes.some(function(v) { return v.deviceId === p.deviceId; });
    });
    if (unvoted.length === 0) return;

    const timers = unvoted.map(function(bot, idx) {
      const delay = botThinkDelay(BOT_DELAYS.missionVote.min, BOT_DELAYS.missionVote.max) + idx * 500;
      return setTimeout(function() {
        const s = stateRef.current;
        if (s.phase !== 'voting' || !s.roomCode) return;
        if (s.votes.some(function(v) { return v.deviceId === bot.deviceId; })) return;
        const botChar = s.characters[bot.deviceId];
        if (!botChar) return;
        const vote = decideBotMissionVote(
          bot.deviceId, botChar, s.characters,
          s.evilWins, s.currentQuest, s.missionPlayerIds
        );
        submitVote(s.roomCode!, bot.deviceId, vote);
      }, delay);
    });

    return function() { timers.forEach(clearTimeout); };
  }, [state.phase, state.botsEnabled, state.isHost, state.votes.length]);


  // BOT: record failed mission teams for the heatmap when results come in
  useEffect(function() {
    if (state.phase !== 'results' || !state.lastQuestResult || !state.botsEnabled) return;
    const passed = state.lastQuestResult.missionPassed;

    // Record the completed mission with leader, team, outcome, and quest index
    const record: MissionRecord = {
      leaderDeviceId: lastApprovedLeaderRef.current ?? '',
      teamDeviceIds:  [...state.missionPlayerIds],
      missionPassed:  passed,
      questIndex:     state.currentQuest,
    };
    missionHistoryRef.current = [...missionHistoryRef.current, record];

    // Record each player's proposal vote alongside the mission outcome
    const newRecords: VoteRecord[] = Object.entries(state.proposalVotes).map(
      function([voterId, approved]) {
        return { voterId, approved, missionPassed: passed };
      }
    );
    voteHistoryRef.current = [...voteHistoryRef.current, ...newRecords];
  }, [state.phase]);


  // BOT: lady of the lake — if the token holder is a bot, investigate
  useEffect(function() {
    if (
      !state.isHost ||
      state.gameMode !== 'network' ||
      state.phase !== 'lady-of-the-lake' ||
      !state.botsEnabled ||
      state.pendingDisconnect
    ) return;

    if (!state.ladyDeviceId || !isBotDeviceId(state.ladyDeviceId)) return;

    const botId   = state.ladyDeviceId;
    const botChar = state.characters[botId];
    if (!botChar) return;

    const timer = setTimeout(function() {
      const s = stateRef.current;
      if (s.phase !== 'lady-of-the-lake' || !s.roomCode) return;
      if (!s.ladyDeviceId || !isBotDeviceId(s.ladyDeviceId)) return;

      const eligibleIds = s.players
        .map(function(p) { return p.deviceId; })
        .filter(function(id) {
          return !s.ladyHistory.includes(id) && id !== s.ladyDeviceId;
        });

      const heatmap  = getHeatmap();
      const targetId = decideBotLadyTarget(
        botId, botChar, s.characters, eligibleIds, heatmap
      );
      if (!targetId) return;

      const targetChar = s.characters[targetId];
      if (!targetChar) return;
      const alignment = CHARACTERS[targetChar].alignment;

      // Record this bot's lady knowledge so it can use it when voting
      ladyKnowledgeRef.current = {
        ...ladyKnowledgeRef.current,
        [botId]: {
          ...(ladyKnowledgeRef.current[botId] || {}),
          [targetId]: alignment,
        },
      };

      submitLadyResult(s.roomCode!, botId, targetId, alignment);
    }, botThinkDelay(BOT_DELAYS.ladyTarget.min, BOT_DELAYS.ladyTarget.max));

    return function() { clearTimeout(timer); };
  }, [state.phase, state.ladyDeviceId, state.botsEnabled, state.isHost]);


  // BOT: assassination — if the Assassin is a bot, fire after a dramatic pause
  useEffect(function() {
    if (
      !state.isHost ||
      state.gameMode !== 'network' ||
      state.phase !== 'assassination' ||
      !state.botsEnabled ||
      state.pendingDisconnect
    ) return;

    const assassinBot = state.players.find(function(p) {
      return isBotDeviceId(p.deviceId) && state.characters[p.deviceId] === 'Assassin';
    });
    if (!assassinBot) return;

    const timer = setTimeout(function() {
      const s = stateRef.current;
      if (s.phase !== 'assassination' || !s.roomCode) return;
      const heatmap  = getHeatmap();
      const targetId = decideBotAssassination(
        assassinBot.deviceId,
        s.characters[assassinBot.deviceId],
        s.characters,
        s.players,
        heatmap,
        voteHistoryRef.current
      );
      const winner = resolveAssassination(targetId, s.characters);
      submitAssassinationTarget(s.roomCode!, targetId, winner);
    }, botThinkDelay(BOT_DELAYS.assassination.min, BOT_DELAYS.assassination.max));

    return function() { clearTimeout(timer); };
  }, [state.phase, state.botsEnabled, state.isHost]);


  // ---------------------------------------------------------------------------
  // LOCAL GAME (unchanged from v3.9)
  // ---------------------------------------------------------------------------

  function startLocalGame(totalPlayers: number): void {
    const newState            = getInitialState(myDeviceId);
    newState.totalPlayers     = totalPlayers;
    newState.phase            = 'voting';
    newState.gameMode         = 'local';
    newState.missionPlayerIds = [myDeviceId];
    newState.amIOnMission     = true;
    setState(newState);
  }

  const localVotesRef = useRef<VoteResult[]>([]);

  function castLocalVote(result: VoteResult): void {
    setState(function(prev) {
      const missionSize = getMissionSize(prev.totalPlayers, prev.currentQuest);
      const newVotes    = [...localVotesRef.current, result];
      localVotesRef.current = newVotes;

      if (newVotes.length < missionSize) {
        const fakePlayerVotes: PlayerVote[] = newVotes.map(function(v, i) {
          return { deviceId: `local-${i}`, vote: v };
        });
        return { ...prev, votes: fakePlayerVotes };
      }

      const questResult = evaluateVotes(newVotes, prev.totalPlayers, prev.currentQuest);
      const newGoodWins = prev.goodWins + (questResult.missionPassed ? 1 : 0);
      const newEvilWins = prev.evilWins + (questResult.missionPassed ? 0 : 1);
      const newOutcomes = [...prev.questOutcomes] as QuestOutcome[];
      newOutcomes[prev.currentQuest - 1] = questResult.missionPassed ? 'good' : 'evil';
      const winner      = checkForWinner(newGoodWins, newEvilWins);

      const shuffledVotes: PlayerVote[] = shuffleArray(newVotes).map(function(v, i) {
        return { deviceId: `local-${i}`, vote: v };
      });
      localVotesRef.current = [];

      return {
        ...prev,
        votes:           shuffledVotes,
        goodWins:        newGoodWins,
        evilWins:        newEvilWins,
        questOutcomes:   newOutcomes,
        lastQuestResult: questResult,
        phase:           winner !== null ? 'gameover' : 'results',
        winner:          winner,
        allVotesIn:      true,
      };
    });
  }

  function advanceLocalQuest(): void {
    setState(function(prev) {
      const nextQuest = prev.currentQuest + 1;
      if (nextQuest > 5) return prev;
      localVotesRef.current = [];
      return {
        ...prev,
        currentQuest:    nextQuest,
        votes:           [],
        lastQuestResult: null,
        phase:           'voting',
        amIOnMission:    true,
        allVotesIn:      false,
        haveIVoted:      false,
      };
    });
  }

  function resetLocalVotes(): void {
    localVotesRef.current = [];
    setState(function(prev) {
      return { ...prev, votes: [], allVotesIn: false, haveIVoted: false, phase: 'voting' };
    });
  }


  // ---------------------------------------------------------------------------
  // NETWORK -- HOST ACTIONS
  // ---------------------------------------------------------------------------

  async function hostNetworkGame(hostName: string, totalPlayers: number): Promise<void> {
    setState(function(prev) { return { ...prev, isLoading: true, errorMessage: null }; });
    const roomCode = generateRoomCode();
    try {
      await createRoom(roomCode, myDeviceId, hostName, totalPlayers);
      const unsubscribe = subscribeToRoom(
        roomCode,
        function(data) { applyRoomData(data); },
        function()     { handleRoomGone(); }
      );
      unsubscribeRef.current = unsubscribe;
      setState(function(prev) {
        return {
          ...prev,
          gameMode:     'network',
          roomCode:     roomCode,
          isHost:       true,
          myName:       hostName,
          totalPlayers: totalPlayers,
          phase:        'lobby',
          isLoading:    false,
          soundEnabled: true,   // host gets sound on by default; guests default to off
        };
      });
    } catch (error) {
      setState(function(prev) {
        return { ...prev, isLoading: false, errorMessage: 'Failed to create room. Check your connection.' };
      });
    }
  }

  async function hostUpdateCharacters(optionalSelected: CharacterName[]): Promise<void> {
    if (!state.roomCode) return;
    setState(function(prev) { return { ...prev, availableCharacters: optionalSelected }; });
    await updateAvailableCharacters(state.roomCode, optionalSelected);
  }

  // v4: Toggle the Lady of the Lake mechanic on/off from the lobby (host only)
  async function hostToggleLadyOfTheLake(enabled: boolean): Promise<void> {
    if (!state.roomCode) return;
    setState(function(prev) { return { ...prev, ladyOfTheLakeEnabled: enabled }; });
    await updateLadyOfTheLakeEnabled(state.roomCode, enabled);
  }

  // v4.1: Host enables/disables bots. When enabled, fills all remaining player
  // slots with bot players immediately. When disabled, removes all bots.
  async function hostToggleBots(enabled: boolean): Promise<void> {
    if (!state.roomCode) return;
    setState(function(prev) { return { ...prev, botsEnabled: enabled }; });

    let botPlayersToAdd: Player[] = [];
    if (enabled) {
      const slotsNeeded = state.totalPlayers - state.players.length;
      if (slotsNeeded > 0) {
        const usedNames = state.players.map(function(p) { return p.name; });
        const names     = pickBotNames(slotsNeeded, usedNames);
        botPlayersToAdd = names.map(function(name) { return makeBotPlayer(name); });
      }
    }

    await updateBotsEnabled(
      state.roomCode,
      enabled,
      state.players,
      state.totalPlayers,
      botPlayersToAdd
    );
  }

  async function hostStartGame(): Promise<void> {
    if (!state.roomCode) return;
    const sorted    = getSortedPlayers(state.players);
    const deviceIds = sorted.map(function(p) { return p.deviceId; });
    const fullList  = getFullCharacterList(state.availableCharacters);
    const assignment = assignCharacters(deviceIds, fullList);

    // v4: If Lady of the Lake is enabled, pick a random initial token holder
    // from all players. The initial holder is added to ladyHistory immediately
    // (they hold it for quest 1 results -- cannot be investigated during that turn).
    let initialLadyId: string | null = null;
    if (state.ladyOfTheLakeEnabled && deviceIds.length > 0) {
      const shuffled = shuffleArray(deviceIds);
      initialLadyId  = shuffled[0];
    }

    await startGame(state.roomCode, assignment, state.availableCharacters, initialLadyId);
  }

  async function hostSubmitTeamProposal(selectedDeviceIds: string[]): Promise<void> {
    if (!state.roomCode) return;
    await submitTeamProposal(state.roomCode, selectedDeviceIds);
  }

  async function hostAdvanceFromVoteResults(): Promise<void> {
    if (!state.roomCode) return;
    await advanceFromVoteResults(state.roomCode, state.lastProposalApproved);
  }

  // v4: Pass LoTL flag so the firebase function can route to 'lady-of-the-lake'
  // instead of 'team-propose' when LoTL is enabled and quest is 1–4.
  async function advanceNetworkQuest(): Promise<void> {
    if (!state.roomCode) return;
    await firebaseAdvanceToNextQuest(
      state.roomCode,
      state.currentQuest + 1,
      state.leaderIndex,
      state.ladyOfTheLakeEnabled,
      state.ladyDeviceId
    );
  }

  async function hostEndGameAfterDisconnect(): Promise<void> {
    if (!state.roomCode || !state.pendingDisconnect) return;
    await hostGiveUpOnReconnect(state.roomCode, state.pendingDisconnect.name);
  }


  // ---------------------------------------------------------------------------
  // NETWORK -- ALL PLAYER ACTIONS
  // ---------------------------------------------------------------------------

  async function joinNetworkGame(playerName: string, roomCode: string): Promise<void> {
    setState(function(prev) { return { ...prev, isLoading: true, errorMessage: null }; });
    const cleanCode = roomCode.toUpperCase().trim();
    try {
      const result = await joinRoom(cleanCode, myDeviceId, playerName);
      if (!result.success) {
        setState(function(prev) {
          return { ...prev, isLoading: false, errorMessage: result.error || 'Could not join room.' };
        });
        return;
      }
      const unsubscribe = subscribeToRoom(
        cleanCode,
        function(data) { applyRoomData(data); },
        function()     { handleRoomGone(); }
      );
      unsubscribeRef.current = unsubscribe;
      setState(function(prev) {
        return {
          ...prev,
          gameMode:  'network',
          roomCode:  cleanCode,
          isHost:    false,
          myName:    playerName,
          phase:     'lobby',
          isLoading: false,
        };
      });
    } catch (error) {
      setState(function(prev) {
        return { ...prev, isLoading: false, errorMessage: 'Failed to join. Check your connection.' };
      });
    }
  }

  // v3.9: Called from StartScreen when the player taps "Rejoin Game".
  async function rejoinNetworkGame(playerName: string, roomCode: string): Promise<void> {
    setState(function(prev) { return { ...prev, isLoading: true, errorMessage: null, rejoinInfo: null }; });
    const cleanCode = roomCode.toUpperCase().trim();
    try {
      const result = await rejoinRoom(cleanCode, myDeviceId, playerName);
      if (!result.success) {
        setState(function(prev) {
          return {
            ...prev,
            isLoading:    false,
            errorMessage: result.error || 'Could not rejoin. The game may have ended.',
            rejoinInfo:   { roomCode: cleanCode, playerName },
          };
        });
        return;
      }
      const unsubscribe = subscribeToRoom(
        cleanCode,
        function(data) { applyRoomData(data); },
        function()     { handleRoomGone(); }
      );
      unsubscribeRef.current = unsubscribe;
      setState(function(prev) {
        return {
          ...prev,
          gameMode:   'network',
          roomCode:   cleanCode,
          isHost:     result.wasHost ?? false,
          myName:     playerName,
          isLoading:  false,
          rejoinInfo: null,
        };
      });
    } catch (error) {
      setState(function(prev) {
        return {
          ...prev,
          isLoading:    false,
          errorMessage: 'Failed to rejoin. Check your connection.',
          rejoinInfo:   { roomCode: cleanCode, playerName },
        };
      });
    }
  }

  async function playerConfirmRoleReveal(): Promise<void> {
    if (!state.roomCode) return;
    await confirmRoleReveal(state.roomCode, myDeviceId);
  }

  async function castTeamProposalVote(approve: boolean): Promise<void> {
    if (!state.roomCode) return;
    await castProposalVote(state.roomCode, myDeviceId, approve);
  }

  async function castNetworkVote(result: VoteResult): Promise<void> {
    if (!state.roomCode) return;
    await submitVote(state.roomCode, myDeviceId, result);
  }

  async function submitAssassination(targetDeviceId: string): Promise<void> {
    if (!state.roomCode) return;
    const winner = resolveAssassination(targetDeviceId, state.characters);
    await submitAssassinationTarget(state.roomCode, targetDeviceId, winner);
  }

  // v4: Token holder investigates a player.
  //
  // Alignment is computed here on the client -- the characters map is already
  // in local state on every device, so no additional Firestore read is needed.
  // The result is written to Firestore immediately before the phase advances,
  // so if the token holder disconnects and rejoins mid-investigation they see
  // the already-revealed result rather than being able to re-investigate.
  async function submitLadyInvestigation(targetDeviceId: string): Promise<void> {
    if (!state.roomCode || !state.ladyDeviceId) return;
    const targetCharacter = state.characters[targetDeviceId];
    if (!targetCharacter) return;
    const alignment = CHARACTERS[targetCharacter].alignment as 'good' | 'evil';
    await submitLadyResult(
      state.roomCode,
      state.ladyDeviceId,
      targetDeviceId,
      alignment
    );
  }


  // ---------------------------------------------------------------------------
  // SHARED ACTIONS
  // ---------------------------------------------------------------------------

  function toggleSound(): void {
    setState(function(prev) { return { ...prev, soundEnabled: !prev.soundEnabled }; });
  }

  function resetGame(): void {
    releaseWakeLock();
    if (state.gameMode === 'network' && state.roomCode) {
      if (state.isHost) {
        deleteRoom(state.roomCode);
      } else if (state.phase === 'lobby') {
        const myPlayer = state.players.find(function(p) { return p.deviceId === myDeviceId; });
        if (myPlayer) removePlayerFromLobby(state.roomCode, myPlayer);
      }
    }
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    localVotesRef.current            = [];
    missionHistoryRef.current        = [];
    voteHistoryRef.current           = [];
    ladyKnowledgeRef.current         = {};
    merlinRejectRef.current          = {};
    lastApprovedLeaderRef.current    = null;
    setState(getInitialState(myDeviceId));
  }

  async function quitGame(): Promise<void> {
    releaseWakeLock();
    if (state.gameMode === 'network' && state.roomCode) {
      await markPlayerQuit(state.roomCode, state.myName, state.isHost);
    }
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    localVotesRef.current = [];
    setState(getInitialState(myDeviceId));
  }


  // ---------------------------------------------------------------------------
  // applyRoomData
  //
  // Translates a raw Firestore RoomData snapshot into local GameState.
  //
  // v4 additions:
  //   - Read all four LoTL fields and map into state.
  //   - Derive amILady (ladyDeviceId === myDeviceId).
  // ---------------------------------------------------------------------------
  function applyRoomData(data: RoomData): void {

    // "Everyone get out" signal written by quit or host-gave-up
    if (data.disconnectedPlayer) {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      const raw = data.disconnectedPlayer;
      const msg = raw.endsWith(' quit the game') ? raw : `${raw} disconnected.`;
      setState(function() {
        const fresh = getInitialState(myDeviceId);
        fresh.disconnectMessage = msg;
        return fresh;
      });
      return;
    }

    // Removed from lobby (host silently pruned this device)
    const amIHost = data.hostDeviceId === myDeviceId;
    if (data.phase === 'lobby' && !amIHost) {
      const stillInRoom = data.players.some(function(p) { return p.deviceId === myDeviceId; });
      if (!stillInRoom) {
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }
        setState(function() {
          const fresh = getInitialState(myDeviceId);
          fresh.disconnectMessage = 'You were removed from the lobby (connection issue).';
          return fresh;
        });
        return;
      }
    }

    // v3.9: This device was the one that dropped -- boot to start screen with rejoin banner
    const pd = data.pendingDisconnect ?? null;
    if (pd && pd.deviceId === myDeviceId) {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      setState(function(prev) {
        const fresh      = getInitialState(myDeviceId);
        const roomCode   = prev.roomCode ?? '';
        fresh.rejoinInfo = { roomCode, playerName: prev.myName || pd.name };
        fresh.disconnectMessage = 'You were disconnected from the network game.';
        return fresh;
      });
      return;
    }

    // Normal update -- map all Firestore fields into local state
    const sortedPlayers  = getSortedPlayers(data.players);
    const safeLeaderIdx  = data.leaderIndex % Math.max(sortedPlayers.length, 1);
    const leaderDeviceId = sortedPlayers[safeLeaderIdx]?.deviceId ?? '';

    const myCharacter = data.characters[myDeviceId] ?? null;
    const amILeader   = leaderDeviceId === myDeviceId;
    const amIAssassin = myCharacter === 'Assassin';
    const isHost      = data.hostDeviceId === myDeviceId;

    const amIOnMission = data.missionPlayerIds.includes(myDeviceId);
    const haveIVoted   = data.votes.some(function(v) { return v.deviceId === myDeviceId; });
    const allVotesIn   = (
      data.missionPlayerIds.length > 0 &&
      data.votes.length >= data.missionPlayerIds.length
    );

    const allRoleRevealsConfirmed = (
      data.players.length > 0 &&
      data.confirmedRoleReveal.length >= data.players.length
    );

    const allProposalVotesIn = (
      data.players.length > 0 &&
      Object.keys(data.proposalVotes).length >= data.players.length
    );

    const haveICastProposalVote = myDeviceId in (data.proposalVotes || {});

    // v4: LoTL derived fields
    const ladyDeviceId = data.ladyDeviceId ?? null;
    const amILady      = ladyDeviceId === myDeviceId;
    // ladyResult is technically private (only the token holder should act on it)
    // but we store it in all clients' state -- it is never rendered for non-holders
    const ladyResult   = data.ladyResult ?? null;

    setState(function(prev) {
      return {
        ...prev,
        totalPlayers:          data.totalPlayers,
        currentQuest:          data.currentQuest,
        goodWins:              data.goodWins,
        evilWins:              data.evilWins,
        questOutcomes:         data.questOutcomes,
        phase:                 data.phase,
        lastQuestResult:       data.lastQuestResult,
        winner:                data.winner,
        players:               data.players,
        missionPlayerIds:      data.missionPlayerIds,
        votes:                 data.votes,
        isHost:                isHost,
        amIOnMission:          amIOnMission,
        haveIVoted:            haveIVoted,
        allVotesIn:            allVotesIn,
        myCharacter:           myCharacter,
        characters:            data.characters || {},
        availableCharacters:   data.availableCharacters || [],
        confirmedRoleReveal:   data.confirmedRoleReveal || [],
        leaderIndex:           data.leaderIndex,
        proposalVotes:         data.proposalVotes || {},
        proposalCount:         data.proposalCount,
        assassinTarget:        data.assassinTarget,
        amILeader:             amILeader,
        amIAssassin:           amIAssassin,
        leaderDeviceId:        leaderDeviceId,
        allRoleRevealsConfirmed: allRoleRevealsConfirmed,
        allProposalVotesIn:    allProposalVotesIn,
        haveICastProposalVote: haveICastProposalVote,
        // v3.9: pendingDisconnect freeze state
        pendingDisconnect:     pd,
        // Heartbeats stored as private field for disconnect checker intervals
        _heartbeats: data.heartbeats || {},
        // v4: LoTL fields
        ladyOfTheLakeEnabled:  data.ladyOfTheLakeEnabled ?? false,
        ladyDeviceId:          ladyDeviceId,
        ladyHistory:           data.ladyHistory ?? [],
        ladyResult:            ladyResult,
        amILady:               amILady,
        // v4.1: Bots
        botsEnabled:           data.botsEnabled ?? false,
        lastProposalApproved:  data.lastProposalApproved ?? false,
      } as any;
    });
  }

  function handleRoomGone(): void {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    setState(function(prev) {
      const fresh = getInitialState(myDeviceId);
      if (prev.phase !== 'setup' && !prev.isHost) {
        fresh.disconnectMessage = 'The host disconnected or ended the game.';
      }
      return fresh;
    });
  }


  return {
    state,
    // Local mode
    startLocalGame,
    castLocalVote,
    advanceLocalQuest,
    resetLocalVotes,
    // Network -- host
    hostNetworkGame,
    hostUpdateCharacters,
    hostToggleLadyOfTheLake,
    hostToggleBots,
    hostStartGame,
    hostSubmitTeamProposal,
    hostAdvanceFromVoteResults,
    advanceNetworkQuest,
    hostEndGameAfterDisconnect,
    // Network -- all players
    joinNetworkGame,
    rejoinNetworkGame,
    playerConfirmRoleReveal,
    castTeamProposalVote,
    castNetworkVote,
    submitAssassination,
    submitLadyInvestigation,
    // Shared
    toggleSound,
    resetGame,
    quitGame,
  };
}
