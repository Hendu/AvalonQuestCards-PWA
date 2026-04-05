// =============================================================================
// useGameState.ts
//
// Central state hook. Handles local mode and network mode.
//
// NETWORK GAME PHASES:
//   'lobby'          -- waiting for all players to join
//   'mission-select' -- host picks which players go on the mission
//   'voting'         -- mission players vote on their own devices
//   'results'        -- quest outcome revealed on all screens
//   'gameover'       -- one side won
//
// KEY CONCEPT -- "am I a mission player?":
//   Each device knows its own deviceId. When phase is 'voting', the device
//   checks if its deviceId is in missionPlayerIds. If yes -- show vote cards.
//   If no -- show "waiting for mission players to vote".
//
// KEY CONCEPT -- "have I voted?":
//   The votes array contains { deviceId, vote } objects. Before revealing,
//   a mission player can check if their deviceId already appears in votes.
//   If it does, they've voted and should see "waiting for others".
// =============================================================================

import { useState, useEffect, useRef } from 'react';

import {
  VoteResult,
  QuestOutcome,
  QuestResult,
  GameWinner,
  GamePhase,
  GameMode,
  getMissionSize,
  shuffleArray,
  evaluateVotes,
  checkForWinner,
  generateRoomCode,
} from '../utils/gameLogic';

import {
  Player,
  PlayerVote,
  RoomData,
  createRoom,
  joinRoom,
  startGame,
  selectMissionPlayers,
  submitVote,
  revealResults,
  advanceToNextQuest as firebaseAdvance,
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
  totalPlayers:     number;
  currentQuest:     number;
  goodWins:         number;
  evilWins:         number;
  questOutcomes:    QuestOutcome[];
  phase:            GamePhase;
  lastQuestResult:  QuestResult | null;
  winner:           GameWinner;
  soundEnabled:     boolean;

  // Network-specific
  gameMode:         GameMode;
  roomCode:         string | null;
  myDeviceId:       string;
  myName:           string;
  isHost:           boolean;
  players:          Player[];           // all players in the room
  missionPlayerIds: string[];           // deviceIds selected for this mission
  votes:            PlayerVote[];       // votes collected so far
  errorMessage:       string | null;
  isLoading:          boolean;
  disconnectMessage:  string | null;  // set when someone drops, sends everyone home

  // Derived convenience flags (computed from above, not stored separately)
  // These are computed in the hook and exposed for components to use:
  //   amIOnMission    -- is MY deviceId in missionPlayerIds?
  //   haveIVoted      -- does MY deviceId appear in votes?
  //   allVotesIn      -- votes.length === missionPlayerIds.length?
  amIOnMission:     boolean;
  haveIVoted:       boolean;
  allVotesIn:       boolean;
}

function getInitialState(deviceId: string): GameState {
  return {
    totalPlayers:     5,
    currentQuest:     1,
    goodWins:         0,
    evilWins:         0,
    questOutcomes:    [null, null, null, null, null],
    phase:            'setup',
    lastQuestResult:  null,
    winner:           null,
    soundEnabled:     true,
    gameMode:         'local',
    roomCode:         null,
    myDeviceId:       deviceId,
    myName:           '',
    isHost:           false,
    players:          [],
    missionPlayerIds: [],
    votes:            [],
    errorMessage:       null,
    isLoading:          false,
    disconnectMessage:  null,
    amIOnMission:     false,
    haveIVoted:       false,
    allVotesIn:       false,
  };
}


// -----------------------------------------------------------------------------
// useGameState hook
// -----------------------------------------------------------------------------
export function useGameState() {
  const myDeviceId = useRef(getDeviceId()).current;

  const [state, setState] = useState<GameState>(getInitialState(myDeviceId));
  const unsubscribeRef    = useRef<(() => void) | null>(null);

  // Cleanup listener on unmount
  useEffect(function() {
    return function() {
      if (unsubscribeRef.current) unsubscribeRef.current();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // HEARTBEAT: Send our timestamp to Firestore every 30 seconds so others
  // know we are still connected. Only runs during an active network game.
  // ---------------------------------------------------------------------------
  useEffect(function() {
    if (state.gameMode !== 'network' || state.phase === 'setup' || !state.roomCode) return;

    const roomCode = state.roomCode;
    const deviceId = myDeviceId;

    // Send immediately on join, then every 30 seconds
    sendHeartbeat(roomCode, deviceId);
    const interval = setInterval(function() {
      sendHeartbeat(roomCode, deviceId);
    }, 10000);

    return function() { clearInterval(interval); };
  }, [state.gameMode, state.phase, state.roomCode]);


  // ---------------------------------------------------------------------------
  // DISCONNECT DETECTION: Host checks all players heartbeats every 10 seconds.
  // If any player's lastSeen is more than 75 seconds ago, they are considered
  // disconnected (75 = 30s interval + 45s grace for slow connections).
  // ---------------------------------------------------------------------------
  useEffect(function() {
    if (!state.isHost || state.gameMode !== 'network' || state.phase === 'setup') return;

    const interval = setInterval(function() {
      const s = stateRef.current;
      if (!s.roomCode || s.phase === 'setup' || s.phase === 'gameover') return;

      // Get heartbeats from Firestore snapshot (stored in state via applyRoomData)
      const heartbeats = (s as any)._heartbeats as Record<string, number> | undefined;
      if (!heartbeats) return;

      const now           = Date.now();
      const TIMEOUT_MS    = 25000; // 25 seconds -- fast detection since any dropout breaks the game

      for (const player of s.players) {
        const lastSeen = heartbeats[player.deviceId] || 0;
        if (now - lastSeen > TIMEOUT_MS) {
          const isHost = player.deviceId === s.players[0]?.deviceId;
          markPlayerDisconnected(s.roomCode!, player.name, isHost);
          break; // handle one at a time
        }
      }
    }, 10000);

    return function() { clearInterval(interval); };
  }, [state.isHost, state.gameMode, state.phase]);


  // ---------------------------------------------------------------------------
  // AUTO-REVEAL: When all votes are in (network mode), automatically reveal
  // results without requiring host intervention.
  // We use a ref to avoid stale closures in the effect.
  // ---------------------------------------------------------------------------
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(function() {
    if (
      state.gameMode === 'network' &&
      state.isHost &&
      state.phase === 'voting' &&
      state.allVotesIn
    ) {
      // Small delay so the last voter sees their card flip before results appear
      const timer = setTimeout(function() {
        const s = stateRef.current;
        if (s.allVotesIn && s.phase === 'voting' && s.isHost) {
          // Compute result and write to Firestore
          const voteValues  = s.votes.map(function(v) { return v.vote; });
          const questResult = evaluateVotes(voteValues, s.totalPlayers, s.currentQuest);
          const newGoodWins = s.goodWins + (questResult.missionPassed ? 1 : 0);
          const newEvilWins = s.evilWins + (questResult.missionPassed ? 0 : 1);
          const newOutcomes = [...s.questOutcomes] as QuestOutcome[];
          newOutcomes[s.currentQuest - 1] = questResult.missionPassed ? 'good' : 'evil';
          const winner      = checkForWinner(newGoodWins, newEvilWins);
          if (s.roomCode) {
            revealResults(s.roomCode, s.votes, questResult, newGoodWins, newEvilWins, newOutcomes, winner);
          }
        }
      }, 800);
      return function() { clearTimeout(timer); };
    }
  }, [state.allVotesIn, state.phase, state.isHost, state.gameMode]);


  // ---------------------------------------------------------------------------
  // LOCAL GAME
  // ---------------------------------------------------------------------------

  function startLocalGame(totalPlayers: number): void {
    const newState          = getInitialState(myDeviceId);
    newState.totalPlayers   = totalPlayers;
    newState.phase          = 'voting';
    newState.gameMode       = 'local';
    // In local mode everyone votes on one device, so all players are on every mission
    newState.missionPlayerIds = [myDeviceId];
    newState.amIOnMission   = true;
    setState(newState);
  }

  // Local voting -- tracks how many votes have been cast on this device
  // We use a simple counter stored in state since it's all one device
  const localVotesRef = useRef<VoteResult[]>([]);

  function castLocalVote(result: VoteResult): void {
    setState(function(prev) {
      const missionSize = getMissionSize(prev.totalPlayers, prev.currentQuest);
      const newVotes    = [...localVotesRef.current, result];
      localVotesRef.current = newVotes;

      if (newVotes.length < missionSize) {
        // More votes needed -- update vote count display but stay in voting
        const fakePlayerVotes: PlayerVote[] = newVotes.map(function(v, i) {
          return { deviceId: `local-${i}`, vote: v };
        });
        return { ...prev, votes: fakePlayerVotes };
      }

      // All votes in -- evaluate
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
      return {
        ...prev,
        votes:        [],
        allVotesIn:   false,
        haveIVoted:   false,
        phase:        'voting',
      };
    });
  }


  // ---------------------------------------------------------------------------
  // NETWORK GAME -- HOST ACTIONS
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

  async function hostStartGame(): Promise<void> {
    if (!state.roomCode) return;
    await startGame(state.roomCode);
    // Firestore listener moves everyone to 'mission-select'
  }

  // Host selects which players go on the mission and sends them
  async function sendOnMission(selectedDeviceIds: string[]): Promise<void> {
    if (!state.roomCode) return;
    await selectMissionPlayers(state.roomCode, selectedDeviceIds);
    // Firestore listener moves everyone to 'voting'
    // Mission players will see vote cards; others see waiting message
  }

  // Host reveals results after all votes are in
  async function hostRevealResults(): Promise<void> {
    if (!state.roomCode) return;

    const votes        = state.votes;
    const voteValues   = votes.map(function(v) { return v.vote; });
    const questResult  = evaluateVotes(voteValues, state.totalPlayers, state.currentQuest);
    const newGoodWins  = state.goodWins + (questResult.missionPassed ? 1 : 0);
    const newEvilWins  = state.evilWins + (questResult.missionPassed ? 0 : 1);
    const newOutcomes  = [...state.questOutcomes] as QuestOutcome[];
    newOutcomes[state.currentQuest - 1] = questResult.missionPassed ? 'good' : 'evil';
    const winner       = checkForWinner(newGoodWins, newEvilWins);

    await revealResults(
      state.roomCode,
      votes,
      questResult,
      newGoodWins,
      newEvilWins,
      newOutcomes,
      winner
    );
  }

  async function advanceNetworkQuest(): Promise<void> {
    if (!state.roomCode) return;
    await firebaseAdvance(state.roomCode, state.currentQuest + 1);
  }


  // ---------------------------------------------------------------------------
  // NETWORK GAME -- GUEST ACTIONS
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

  // Mission player submits their vote
  async function castNetworkVote(result: VoteResult): Promise<void> {
    if (!state.roomCode) return;
    await submitVote(state.roomCode, myDeviceId, result);
    // Firestore listener will update votes array for everyone
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
  // When Firestore sends an update, we compute the derived flags and merge
  // everything into local state. This drives all devices in sync.
  // ---------------------------------------------------------------------------
  function applyRoomData(data: RoomData): void {
    // If a player was marked disconnected, show the message and go home
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

    const amIOnMission = data.missionPlayerIds.includes(myDeviceId);
    const haveIVoted   = data.votes.some(function(v) { return v.deviceId === myDeviceId; });
    const allVotesIn   = (
      data.missionPlayerIds.length > 0 &&
      data.votes.length >= data.missionPlayerIds.length
    );
    const isHost       = (data.hostDeviceId === myDeviceId);

    setState(function(prev) {
      return {
        ...prev,
        totalPlayers:     data.totalPlayers,
        currentQuest:     data.currentQuest,
        goodWins:         data.goodWins,
        evilWins:         data.evilWins,
        questOutcomes:    data.questOutcomes,
        phase:            data.phase,
        lastQuestResult:  data.lastQuestResult,
        winner:           data.winner,
        players:          data.players,
        missionPlayerIds: data.missionPlayerIds,
        votes:            data.votes,
        isHost:           isHost,
        amIOnMission:     amIOnMission,
        haveIVoted:       haveIVoted,
        allVotesIn:       allVotesIn,
        // Store heartbeats in a hidden field for the disconnect checker
        _heartbeats:      data.heartbeats || {},
      } as any;
    });
  }

  function handleRoomGone(): void {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    // Room was deleted -- host disconnected or ended the game
    setState(function(prev) {
      const fresh = getInitialState(myDeviceId);
      // Only show disconnect message if we were in an active game
      // (not if host deliberately ended it via resetGame)
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
    hostStartGame,
    sendOnMission,
    hostRevealResults,
    advanceNetworkQuest,
    // Network -- guest
    joinNetworkGame,
    castNetworkVote,
    // Shared
    toggleSound,
    resetGame,
  };
}