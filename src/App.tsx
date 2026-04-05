// =============================================================================
// App.tsx
//
// Root component. Routes to the right screen based on game phase.
//
// PHASE → SCREEN:
//   'setup'          → StartScreen
//   'lobby'          → LobbyScreen
//   'mission-select' → MissionSelectScreen
//   'voting'         → GameBoardScreen
//   'results'        → GameBoardScreen
//   'gameover'       → GameBoardScreen
// =============================================================================

import React from 'react';
import { useGameState } from './hooks/useGameState';
import StartScreen        from './screens/StartScreen';
import LobbyScreen        from './screens/LobbyScreen';
import MissionSelectScreen from './screens/MissionSelectScreen';
import GameBoardScreen    from './screens/GameBoardScreen';
import { VoteResult } from './utils/gameLogic';

export default function App() {
  const {
    state,
    startLocalGame,
    castLocalVote,
    advanceLocalQuest,
    resetLocalVotes,
    hostNetworkGame,
    hostStartGame,
    sendOnMission,
    hostRevealResults,
    advanceNetworkQuest,
    joinNetworkGame,
    castNetworkVote,
    toggleSound,
    resetGame,
  } = useGameState();

  const { phase, gameMode, isHost } = state;

  // ---------------------------------------------------------------------------
  // Route to setup screen
  // ---------------------------------------------------------------------------
  if (phase === 'setup') {
    return (
      <StartScreen
        onStartLocal={startLocalGame}
        onHostNetwork={hostNetworkGame}
        onJoinNetwork={joinNetworkGame}
        isLoading={state.isLoading}
        errorMessage={state.errorMessage}
        disconnectMessage={state.disconnectMessage}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Route to lobby
  // ---------------------------------------------------------------------------
  if (phase === 'lobby') {
    return (
      <LobbyScreen
        roomCode={state.roomCode!}
        isHost={isHost}
        players={state.players}
        totalPlayers={state.totalPlayers}
        myDeviceId={state.myDeviceId}
        onStartGame={hostStartGame}
        onLeave={resetGame}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Route to mission selection
  // ---------------------------------------------------------------------------
  if (phase === 'mission-select') {
    return (
      <MissionSelectScreen
        isHost={isHost}
        players={state.players}
        currentQuest={state.currentQuest}
        totalPlayers={state.totalPlayers}
        goodWins={state.goodWins}
        evilWins={state.evilWins}
        questOutcomes={state.questOutcomes}
        myName={state.myName}
        onSendOnMission={sendOnMission}
        onResetGame={resetGame}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Route to game board (voting, results, gameover)
  // ---------------------------------------------------------------------------

  // onVote routes to local or network vote function
  function handleVote(result: VoteResult) {
    if (gameMode === 'local') {
      castLocalVote(result);
    } else {
      castNetworkVote(result);
    }
  }

  // onAdvanceToNextQuest routes to local or network advance function
  function handleAdvance() {
    if (gameMode === 'local') {
      advanceLocalQuest();
    } else {
      advanceNetworkQuest();
    }
  }

  return (
    <GameBoardScreen
      state={state}
      onVote={handleVote}
      onAdvanceToNextQuest={handleAdvance}
      onResetVotes={resetLocalVotes}
      onResetGame={resetGame}
      onToggleSound={toggleSound}
      onRevealResults={hostRevealResults}
    />
  );
}
