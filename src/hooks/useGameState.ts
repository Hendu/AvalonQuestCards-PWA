// =============================================================================
// useGameState.ts  (v3.9 -- reconnect support)
//
// Central state hook. Handles local mode (unchanged) and network mode.
//
// NEW in v3.9:
//   pendingDisconnect in GameState -- mirrors Firestore field.
//     Non-null = game is frozen. Host sees wait modal; guests see freeze overlay.
//
//   Disconnect detection (host) mid-game:
//     Instead of calling markPlayerDisconnected (which kicks everyone),
//     calls setPendingDisconnect, which writes pendingDisconnect to Firestore.
//     The dropped player is booted to the start screen with rejoin info.
//     The host wait modal has a 30s "Wait Longer" button; "End Game" kicks all.
//
//   rejoinNetworkGame() -- called by the booted player from StartScreen.
//     Calls rejoinRoom() which rewrites their deviceId everywhere in Firestore
//     and clears pendingDisconnect. All freeze modals disappear.
//
//   Self-detection of disconnect:
//     When applyRoomData sees pendingDisconnect.deviceId === myDeviceId,
//     this client was the one who dropped. Boot to start screen immediately
//     with rejoinInfo set so the StartScreen can offer the Rejoin button.
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
  PendingDisconnect,
  RoomData,
  createRoom,
  joinRoom,
  rejoinRoom,
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
  markPlayerQuit,
  removePlayerFromLobby,
  setPendingDisconnect,
  hostGiveUpOnReconnect,
} from '../utils/firebaseGame';

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

  // Derived convenience flags
  amIOnMission:        boolean;
  haveIVoted:          boolean;
  allVotesIn:          boolean;
  amILeader:           boolean;
  amIAssassin:         boolean;
  leaderDeviceId:      string;
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
    pendingDisconnect:   null,
    rejoinInfo:          null,
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
  //
  // When the host's device drops, no one is running the heartbeat checker.
  // Each guest independently watches the host's heartbeat. If it goes silent
  // for 25s, the first guest to notice calls setPendingDisconnect, which
  // freezes the game and shows the wait modal -- giving the host a chance to
  // rejoin just like any other player.
  // ---------------------------------------------------------------------------
  useEffect(function() {
    if (state.isHost || state.gameMode !== 'network' || state.phase === 'setup' || state.phase === 'lobby') return;
    const interval = setInterval(function() {
      const s = stateRef.current;
      if (!s.roomCode || s.phase === 'setup' || s.phase === 'gameover' || s.isHost) return;
      // Don't stack pending disconnects
      if (s.pendingDisconnect) return;
      const heartbeats = (s as any)._heartbeats as Record<string, number> | undefined;
      if (!heartbeats) return;
      const sortedPlayers = getSortedPlayers(s.players);
      const hostPlayer    = sortedPlayers[0];
      if (!hostPlayer) return;
      const lastSeen = heartbeats[hostPlayer.deviceId] || 0;
      if (Date.now() - lastSeen > 25000) {
        // Host gone -- freeze and wait, same as guest disconnect
        setPendingDisconnect(s.roomCode!, hostPlayer);
      }
    }, 3000);
    return function() { clearInterval(interval); };
  }, [state.isHost, state.gameMode, state.phase]);


  // ---------------------------------------------------------------------------
  // DISCONNECT DETECTION (host only)
  //
  // Lobby: fast 8s timeout, silently remove the slot (unchanged).
  // Mid-game: setPendingDisconnect for all players including host detection
  //   handled above. Host-side checker only fires for guests now.
  // ---------------------------------------------------------------------------
  useEffect(function() {
    if (!state.isHost || state.gameMode !== 'network' || state.phase === 'setup') return;
    const interval = setInterval(function() {
      const s = stateRef.current;
      if (!s.roomCode || s.phase === 'setup' || s.phase === 'gameover') return;

      // Don't stack pending disconnects
      if (s.pendingDisconnect) return;

      const heartbeats = (s as any)._heartbeats as Record<string, number> | undefined;
      if (!heartbeats) return;

      const now     = Date.now();
      const inLobby = s.phase === 'lobby';
      const TIMEOUT_MS = inLobby ? 8000 : 25000;

      for (const player of s.players) {
        const lastSeen      = heartbeats[player.deviceId] || 0;
        const sortedPlayers = getSortedPlayers(s.players);
        const hostDeviceId  = sortedPlayers[0]?.deviceId;
        const isPlayerHost  = player.deviceId === hostDeviceId;

        if (now - lastSeen > TIMEOUT_MS) {
          if (inLobby && !isPlayerHost) {
            // Lobby drop: silently remove (unchanged behaviour)
            removePlayerFromLobby(s.roomCode!, player);
          } else if (!isPlayerHost) {
            // Mid-game guest dropped -- freeze and wait for rejoin
            setPendingDisconnect(s.roomCode!, player);
          }
          // Host drop detected by guests via the effect above
          break;
        }
      }
    }, 3000);
    return function() { clearInterval(interval); };
  }, [state.isHost, state.gameMode, state.phase]);


  // ---------------------------------------------------------------------------
  // AUTO-ADVANCE: role-reveal -> team-propose
  // Skip if game is frozen (pendingDisconnect)
  // ---------------------------------------------------------------------------
  useEffect(function() {
    if (
      state.gameMode === 'network' &&
      state.isHost &&
      state.phase === 'role-reveal' &&
      state.allRoleRevealsConfirmed &&
      !state.pendingDisconnect   // don't auto-advance while frozen
    ) {
      advanceToTeamPropose(state.roomCode!);
    }
  }, [state.allRoleRevealsConfirmed, state.phase, state.isHost, state.gameMode, state.pendingDisconnect]);


  // ---------------------------------------------------------------------------
  // AUTO-RESOLVE: team-vote -> resolve
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
  // LOCAL GAME (unchanged)
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

  async function hostUpdateCharacters(optionalSelected: CharacterName[]): Promise<void> {
    if (!state.roomCode) return;
    setState(function(prev) { return { ...prev, availableCharacters: optionalSelected }; });
    await updateAvailableCharacters(state.roomCode, optionalSelected);
  }

  async function hostStartGame(): Promise<void> {
    if (!state.roomCode) return;
    const sorted     = getSortedPlayers(state.players);
    const deviceIds  = sorted.map(function(p) { return p.deviceId; });
    const fullList   = getFullCharacterList(state.availableCharacters);
    const assignment = assignCharacters(deviceIds, fullList);
    await startGame(state.roomCode, assignment, state.availableCharacters);
  }

  async function hostSubmitTeamProposal(selectedDeviceIds: string[]): Promise<void> {
    if (!state.roomCode) return;
    await submitTeamProposal(state.roomCode, selectedDeviceIds);
  }

  async function hostAdvanceToMissionVoting(): Promise<void> {
    if (!state.roomCode) return;
    await advanceToMissionVoting(state.roomCode);
  }

  async function advanceNetworkQuest(): Promise<void> {
    if (!state.roomCode) return;
    await firebaseAdvanceToNextQuest(state.roomCode, state.currentQuest + 1, state.leaderIndex);
  }

  // Host gives up waiting for the disconnected player -- kicks everyone
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

  // ---------------------------------------------------------------------------
  // rejoinNetworkGame  (v3.9)
  //
  // Called from StartScreen when the player taps "Rejoin Game".
  // Uses the rejoinInfo that was stored when they were booted for disconnect.
  // ---------------------------------------------------------------------------
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
            // Preserve rejoinInfo so they can try again
            rejoinInfo:   { roomCode: cleanCode, playerName },
          };
        });
        return;
      }

      // Subscribe to the room -- applyRoomData will set our phase etc.
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
          isHost:    result.wasHost ?? false,
          myName:    playerName,
          isLoading: false,
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
    localVotesRef.current = [];
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
  // v3.9 additions:
  //   - Read pendingDisconnect from Firestore and store in state.
  //   - If pendingDisconnect.deviceId === myDeviceId, this client was the one
  //     that dropped. Boot ourselves to the start screen with rejoinInfo set.
  // ---------------------------------------------------------------------------
  function applyRoomData(data: RoomData): void {

    // --- Existing: handle "everyone get out" signal ---
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

    // --- Existing: removed from lobby ---
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

    // --- v3.9: Am I the one who just got marked as disconnected? ---
    // pendingDisconnect.deviceId matches my current deviceId.
    // Boot myself to the start screen immediately, preserving rejoinInfo.
    const pd = data.pendingDisconnect ?? null;
    if (pd && pd.deviceId === myDeviceId) {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      setState(function(prev) {
        const fresh         = getInitialState(myDeviceId);
        // Store rejoin info so the StartScreen can offer the Rejoin button
        fresh.rejoinInfo    = { roomCode: data.hostDeviceId ? (prev.roomCode ?? '') : '', playerName: prev.myName || pd.name };
        // Also store the roomCode properly -- pull it from prev since data doesn't have it
        const roomCode      = prev.roomCode ?? '';
        fresh.rejoinInfo    = { roomCode, playerName: prev.myName || pd.name };
        fresh.disconnectMessage = 'You were disconnected from the network game.';
        return fresh;
      });
      return;
    }

    // --- Normal update ---
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
        // v3.9: Carry pendingDisconnect into local state
        pendingDisconnect:     pd,
        // Store heartbeats for disconnect checker
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
    hostEndGameAfterDisconnect,
    // Network -- all players
    joinNetworkGame,
    rejoinNetworkGame,
    playerConfirmRoleReveal,
    castTeamProposalVote,
    castNetworkVote,
    submitAssassination,
    // Shared
    toggleSound,
    resetGame,
    quitGame,
  };
}
