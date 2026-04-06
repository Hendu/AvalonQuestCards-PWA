// =============================================================================
// useGameState.ts
//
// Central state hook. Handles local mode (unchanged from v2) and network mode.
//
// NETWORK GAME PHASES (v3):
//   lobby             -> waiting room, host selects characters
//   role-reveal       -> each player sees their character card
//   team-propose      -> current leader proposes a team
//   team-vote         -> all players vote approve/reject
//   team-vote-results -> reveal who voted what
//   voting            -> mission players vote success/fail
//   results           -> quest outcome
//   assassination     -> assassin picks their Merlin guess
//   gameover          -> one side won
//
// KEY CONCEPTS:
//   - leaderDeviceId: players sorted by joinedAt, index by leaderIndex
//   - amILeader: my device is the current team proposer
//   - amIAssassin: my character is 'Assassin' (for assassination phase)
//   - myCharacter: my assigned CharacterName (from characters[myDeviceId])
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
} from '../utils/gameLogic';

import {
  Player,
  PlayerVote,
  RoomData,
  createRoom,
  joinRoom,
  startGame,
  updateAvailableCharacters,
  confirmRoleReveal,
  advanceToTeamPropose,
  submitTeamProposal,
  castProposalVote,
  resolveTeamVote,
  advanceToMissionVoting,
  submitVote,
  revealResults,
  advanceToNextQuest as firebaseAdvanceToNextQuest,
  submitAssassinationTarget,
  deleteRoom,
  subscribeToRoom,
  sendHeartbeat,
  markPlayerDisconnected,
} from '../utils/firebaseGame';

import { getDeviceId } from '../utils/deviceId';


// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------

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
  myCharacter:         CharacterName | null;   // this device's assigned character
  characters:          Record<string, CharacterName>;  // full map (all players)
  availableCharacters: CharacterName[];        // host's optional selection in lobby
  confirmedRoleReveal: string[];               // deviceIds who've tapped Next

  // v3: Leader / proposal data
  leaderIndex:         number;
  proposalVotes:       Record<string, boolean>;
  proposalCount:       number;
  assassinTarget:      string | null;

  // Derived convenience flags
  amIOnMission:        boolean;
  haveIVoted:          boolean;
  allVotesIn:          boolean;
  amILeader:           boolean;    // am I the current team proposer?
  amIAssassin:         boolean;    // is my character the Assassin?
  leaderDeviceId:      string;     // deviceId of current leader (for display)
  allRoleRevealsConfirmed: boolean;
  allProposalVotesIn:  boolean;
  haveICastProposalVote: boolean;
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
    soundEnabled:        true,
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
    amIOnMission:        false,
    haveIVoted:          false,
    allVotesIn:          false,
    amILeader:           false,
    amIAssassin:         false,
    leaderDeviceId:      '',
    allRoleRevealsConfirmed: false,
    allProposalVotesIn:  false,
    haveICastProposalVote: false,
  };
}

// Helper: get players sorted by joinedAt (determines leader rotation order)
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

  // Cleanup listener on unmount
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
    }, 10000);
    return function() { clearInterval(interval); };
  }, [state.gameMode, state.phase, state.roomCode]);


  // ---------------------------------------------------------------------------
  // DISCONNECT DETECTION
  // ---------------------------------------------------------------------------
  useEffect(function() {
    if (!state.isHost || state.gameMode !== 'network' || state.phase === 'setup') return;
    const interval = setInterval(function() {
      const s = stateRef.current;
      if (!s.roomCode || s.phase === 'setup' || s.phase === 'gameover') return;
      const heartbeats = (s as any)._heartbeats as Record<string, number> | undefined;
      if (!heartbeats) return;
      const now        = Date.now();
      const TIMEOUT_MS = 25000;
      for (const player of s.players) {
        const lastSeen = heartbeats[player.deviceId] || 0;
        if (now - lastSeen > TIMEOUT_MS) {
          const isPlayerHost = player.deviceId === s.players[0]?.deviceId;
          markPlayerDisconnected(s.roomCode!, player.name, isPlayerHost);
          break;
        }
      }
    }, 10000);
    return function() { clearInterval(interval); };
  }, [state.isHost, state.gameMode, state.phase]);


  // ---------------------------------------------------------------------------
  // AUTO-ADVANCE: role-reveal -> team-propose
  // When all players have confirmed role reveal, host moves to team-propose.
  // ---------------------------------------------------------------------------
  useEffect(function() {
    if (
      state.gameMode === 'network' &&
      state.isHost &&
      state.phase === 'role-reveal' &&
      state.allRoleRevealsConfirmed
    ) {
      advanceToTeamPropose(state.roomCode!);
    }
  }, [state.allRoleRevealsConfirmed, state.phase, state.isHost, state.gameMode]);


  // ---------------------------------------------------------------------------
  // AUTO-RESOLVE: team-vote -> resolve when all proposal votes are in
  // ---------------------------------------------------------------------------
  useEffect(function() {
    if (
      state.gameMode === 'network' &&
      state.isHost &&
      state.phase === 'team-vote' &&
      state.allProposalVotesIn
    ) {
      const timer = setTimeout(function() {
        const s = stateRef.current;
        if (!s.allProposalVotesIn || s.phase !== 'team-vote' || !s.isHost) return;

        const result       = evaluateProposalVotes(s.proposalVotes);
        const newCount     = s.proposalCount + 1;
        const evilAutoWin  = !result.approved && newCount >= 5;

        // Next leader index: always increments regardless of outcome
        const sorted       = getSortedPlayers(s.players);
        const nextLeaderIdx = (s.leaderIndex + 1) % sorted.length;

        resolveTeamVote(s.roomCode!, result.approved, nextLeaderIdx, newCount, evilAutoWin);
      }, 800);
      return function() { clearTimeout(timer); };
    }
  }, [state.allProposalVotesIn, state.phase, state.isHost, state.gameMode]);


  // ---------------------------------------------------------------------------
  // AUTO-REVEAL: voting -> results when all mission votes are in
  // ---------------------------------------------------------------------------
  useEffect(function() {
    if (
      state.gameMode === 'network' &&
      state.isHost &&
      state.phase === 'voting' &&
      state.allVotesIn
    ) {
      const timer = setTimeout(function() {
        const s = stateRef.current;
        if (!s.allVotesIn || s.phase !== 'voting' || !s.isHost) return;
        const voteValues   = s.votes.map(function(v) { return v.vote; });
        const questResult  = evaluateVotes(voteValues, s.totalPlayers, s.currentQuest);
        const newGoodWins  = s.goodWins + (questResult.missionPassed ? 1 : 0);
        const newEvilWins  = s.evilWins + (questResult.missionPassed ? 0 : 1);
        const newOutcomes  = [...s.questOutcomes] as QuestOutcome[];
        newOutcomes[s.currentQuest - 1] = questResult.missionPassed ? 'good' : 'evil';
        const winner       = checkForWinner(newGoodWins, newEvilWins);
        if (s.roomCode) {
          revealResults(s.roomCode, s.votes, questResult, newGoodWins, newEvilWins, newOutcomes, winner);
        }
      }, 800);
      return function() { clearTimeout(timer); };
    }
  }, [state.allVotesIn, state.phase, state.isHost, state.gameMode]);


  // ---------------------------------------------------------------------------
  // LOCAL GAME (unchanged from v2)
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
        };
      });
    } catch (error) {
      setState(function(prev) {
        return { ...prev, isLoading: false, errorMessage: 'Failed to create room. Check your connection.' };
      });
    }
  }

  // Host updates their character selection in real time as they toggle
  async function hostUpdateCharacters(optionalSelected: CharacterName[]): Promise<void> {
    if (!state.roomCode) return;
    setState(function(prev) { return { ...prev, availableCharacters: optionalSelected }; });
    await updateAvailableCharacters(state.roomCode, optionalSelected);
  }

  // Host hits Start Game: assign characters, move to role-reveal
  async function hostStartGame(): Promise<void> {
    if (!state.roomCode) return;

    // Sort players by joinedAt to get deterministic assignment order
    const sorted    = getSortedPlayers(state.players);
    const deviceIds = sorted.map(function(p) { return p.deviceId; });
    const fullList  = getFullCharacterList(state.availableCharacters);
    const assignment = assignCharacters(deviceIds, fullList);

    await startGame(state.roomCode, assignment, state.availableCharacters);
    // Firestore listener moves everyone to role-reveal
  }

  // Host or leader submits team proposal
  async function hostSubmitTeamProposal(selectedDeviceIds: string[]): Promise<void> {
    if (!state.roomCode) return;
    await submitTeamProposal(state.roomCode, selectedDeviceIds);
  }

  // Advance from team-vote-results to actual mission voting
  async function hostAdvanceToMissionVoting(): Promise<void> {
    if (!state.roomCode) return;
    await advanceToMissionVoting(state.roomCode);
  }

  // Host advances to next quest after results
  async function advanceNetworkQuest(): Promise<void> {
    if (!state.roomCode) return;
    // leaderIndex was already incremented by resolveTeamVote when the proposal
    // was approved. We just pass the current value through so it resets
    // proposalCount to 0 but keeps the leader rotation where it is.
    await firebaseAdvanceToNextQuest(state.roomCode, state.currentQuest + 1, state.leaderIndex);
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

  // Each player confirms they've seen their role card
  async function playerConfirmRoleReveal(): Promise<void> {
    if (!state.roomCode) return;
    await confirmRoleReveal(state.roomCode, myDeviceId);
  }

  // Each player casts their approve/reject vote on the proposed team
  async function castTeamProposalVote(approve: boolean): Promise<void> {
    if (!state.roomCode) return;
    await castProposalVote(state.roomCode, myDeviceId, approve);
  }

  // Mission player submits their success/fail vote
  async function castNetworkVote(result: VoteResult): Promise<void> {
    if (!state.roomCode) return;
    await submitVote(state.roomCode, myDeviceId, result);
  }

  // Assassin submits their target
  async function submitAssassination(targetDeviceId: string): Promise<void> {
    if (!state.roomCode) return;
    const winner = resolveAssassination(targetDeviceId, state.characters);
    await submitAssassinationTarget(state.roomCode, targetDeviceId, winner);
  }


  // ---------------------------------------------------------------------------
  // SHARED ACTIONS
  // ---------------------------------------------------------------------------

  function toggleSound(): void {
    setState(function(prev) { return { ...prev, soundEnabled: !prev.soundEnabled }; });
  }

  function resetGame(): void {
    if (state.gameMode === 'network' && state.isHost && state.roomCode) {
      deleteRoom(state.roomCode);
    }
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    localVotesRef.current = [];
    setState(getInitialState(myDeviceId));
  }


  // ---------------------------------------------------------------------------
  // FIRESTORE SYNC
  //
  // When Firestore sends an update, compute all derived flags and merge
  // into local state. This keeps all devices in sync.
  // ---------------------------------------------------------------------------
  function applyRoomData(data: RoomData): void {
    if (data.disconnectedPlayer) {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      const msg = `${data.disconnectedPlayer} disconnected or quit.`;
      setState(function() {
        const fresh = getInitialState(myDeviceId);
        fresh.disconnectMessage = msg;
        return fresh;
      });
      return;
    }

    // Sort players by joinedAt to determine leader rotation order
    const sortedPlayers  = getSortedPlayers(data.players);
    const safeLeaderIdx  = data.leaderIndex % Math.max(sortedPlayers.length, 1);
    const leaderDeviceId = sortedPlayers[safeLeaderIdx]?.deviceId ?? '';

    const myCharacter    = data.characters[myDeviceId] ?? null;
    const amILeader      = leaderDeviceId === myDeviceId;
    const amIAssassin    = myCharacter === 'Assassin';
    const isHost         = data.hostDeviceId === myDeviceId;

    const amIOnMission   = data.missionPlayerIds.includes(myDeviceId);
    const haveIVoted     = data.votes.some(function(v) { return v.deviceId === myDeviceId; });
    const allVotesIn     = (
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
        // v3 fields
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
        // Store heartbeats in hidden field for disconnect checker
        _heartbeats: data.heartbeats || {},
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
    // Local
    startLocalGame,
    castLocalVote,
    advanceLocalQuest,
    resetLocalVotes,
    // Network -- host
    hostNetworkGame,
    hostUpdateCharacters,
    hostStartGame,
    hostSubmitTeamProposal,
    hostAdvanceToMissionVoting,
    advanceNetworkQuest,
    // Network -- all players
    joinNetworkGame,
    playerConfirmRoleReveal,
    castTeamProposalVote,
    castNetworkVote,
    submitAssassination,
    // Shared
    toggleSound,
    resetGame,
  };
}
