// =============================================================================
// App.tsx
//
// Root component. Routes to the correct screen based on game phase.
//
// PHASE → SCREEN (v3):
//   'setup'             → StartScreen
//   'lobby'             → LobbyScreen (now includes character picker)
//   'role-reveal'       → RoleRevealScreen
//   'team-propose'      → TeamProposeScreen
//   'team-vote'         → TeamVoteScreen
//   'team-vote-results' → TeamVoteResultsScreen
//   'voting'            → GameBoardScreen (mission success/fail voting)
//   'results'           → GameBoardScreen
//   'assassination'     → AssassinationScreen
//   'gameover'          → GameBoardScreen
//
// Local mode bypasses everything above 'setup' and goes straight to 'voting'.
// =============================================================================

import React from 'react';
import { useGameState } from './hooks/useGameState';
import StartScreen           from './screens/StartScreen';
import LobbyScreen           from './screens/LobbyScreen';
import RoleRevealScreen      from './screens/RoleRevealScreen';
import TeamProposeScreen     from './screens/TeamProposeScreen';
import TeamVoteScreen        from './screens/TeamVoteScreen';
import TeamVoteResultsScreen from './screens/TeamVoteResultsScreen';
import GameBoardScreen       from './screens/GameBoardScreen';
import AssassinationScreen   from './screens/AssassinationScreen';
import { VoteResult }        from './utils/gameLogic';
import { evaluateProposalVotes } from './utils/gameLogic';

export default function App() {
  const {
    state,
    startLocalGame,
    castLocalVote,
    advanceLocalQuest,
    resetLocalVotes,
    hostNetworkGame,
    hostUpdateCharacters,
    hostStartGame,
    hostSubmitTeamProposal,
    hostAdvanceToMissionVoting,
    advanceNetworkQuest,
    joinNetworkGame,
    playerConfirmRoleReveal,
    castTeamProposalVote,
    castNetworkVote,
    submitAssassination,
    toggleSound,
    resetGame,
  } = useGameState();

  const { phase, gameMode, isHost } = state;

  // ---------------------------------------------------------------------------
  // Setup screen
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
  // Lobby (includes character picker for host)
  // ---------------------------------------------------------------------------
  if (phase === 'lobby') {
    return (
      <LobbyScreen
        roomCode={state.roomCode!}
        isHost={isHost}
        players={state.players}
        totalPlayers={state.totalPlayers}
        myDeviceId={state.myDeviceId}
        availableCharacters={state.availableCharacters}
        onUpdateCharacters={hostUpdateCharacters}
        onStartGame={hostStartGame}
        onLeave={resetGame}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Role reveal -- each player sees their character privately
  // ---------------------------------------------------------------------------
  if (phase === 'role-reveal') {
    // If we somehow don't have a character yet (race condition on initial load),
    // show a brief loading state rather than crashing.
    if (!state.myCharacter) {
      return (
        <div style={loadingStyle}>
          <p style={{ color: '#c9a96e' }}>Loading your character...</p>
        </div>
      );
    }
    return (
      <RoleRevealScreen
        myCharacter={state.myCharacter}
        myDeviceId={state.myDeviceId}
        players={state.players}
        characters={state.characters}
        confirmedRoleReveal={state.confirmedRoleReveal}
        totalPlayers={state.totalPlayers}
        onConfirm={playerConfirmRoleReveal}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Team proposal -- leader picks the mission team
  // ---------------------------------------------------------------------------
  if (phase === 'team-propose') {
    const sortedPlayers  = [...state.players].sort(function(a, b) { return a.joinedAt - b.joinedAt; });
    const safeLeaderIdx  = state.leaderIndex % Math.max(sortedPlayers.length, 1);
    const leaderPlayer   = sortedPlayers[safeLeaderIdx];
    const leaderName     = leaderPlayer ? leaderPlayer.name : 'Unknown';

    return (
      <TeamProposeScreen
        isLeader={state.amILeader}
        leaderName={leaderName}
        players={state.players}
        currentQuest={state.currentQuest}
        totalPlayers={state.totalPlayers}
        goodWins={state.goodWins}
        evilWins={state.evilWins}
        questOutcomes={state.questOutcomes}
        myName={state.myName}
        myCharacter={state.myCharacter}
        proposalCount={state.proposalCount}
        onSubmitProposal={hostSubmitTeamProposal}
        onResetGame={resetGame}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Team vote -- everyone votes approve/reject simultaneously
  // ---------------------------------------------------------------------------
  if (phase === 'team-vote') {
    const sortedPlayers = [...state.players].sort(function(a, b) { return a.joinedAt - b.joinedAt; });
    const safeLeaderIdx = state.leaderIndex % Math.max(sortedPlayers.length, 1);
    const leaderPlayer  = sortedPlayers[safeLeaderIdx];
    const leaderName    = leaderPlayer ? leaderPlayer.name : 'Unknown';

    return (
      <TeamVoteScreen
        players={state.players}
        missionPlayerIds={state.missionPlayerIds}
        proposalVotes={state.proposalVotes}
        myDeviceId={state.myDeviceId}
        myCharacter={state.myCharacter}
        myName={state.myName}
        leaderName={leaderName}
        currentQuest={state.currentQuest}
        proposalCount={state.proposalCount}
        totalPlayers={state.totalPlayers}
        haveICastProposalVote={state.haveICastProposalVote}
        onVote={castTeamProposalVote}
        onResetGame={resetGame}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Team vote results -- reveal who voted what
  // ---------------------------------------------------------------------------
  if (phase === 'team-vote-results') {
    const result = evaluateProposalVotes(state.proposalVotes);

    return (
      <TeamVoteResultsScreen
        players={state.players}
        proposalVotes={state.proposalVotes}
        missionPlayerIds={state.missionPlayerIds}
        myCharacter={state.myCharacter}
        isHost={isHost}
        approveCount={result.approveCount}
        rejectCount={result.rejectCount}
        onContinue={hostAdvanceToMissionVoting}
        onResetGame={resetGame}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Assassination phase
  // ---------------------------------------------------------------------------
  if (phase === 'assassination') {
    return (
      <AssassinationScreen
        players={state.players}
        characters={state.characters}
        myDeviceId={state.myDeviceId}
        myCharacter={state.myCharacter}
        amIAssassin={state.amIAssassin}
        onSubmitTarget={submitAssassination}
        onResetGame={resetGame}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Game board: voting, results, gameover
  // ---------------------------------------------------------------------------

  function handleVote(result: VoteResult) {
    if (gameMode === 'local') castLocalVote(result);
    else castNetworkVote(result);
  }

  function handleAdvance() {
    if (gameMode === 'local') advanceLocalQuest();
    else advanceNetworkQuest();
  }

  return (
    <GameBoardScreen
      state={state}
      onVote={handleVote}
      onAdvanceToNextQuest={handleAdvance}
      onResetVotes={resetLocalVotes}
      onResetGame={resetGame}
      onToggleSound={toggleSound}
      onRevealResults={function() {}}  // auto-reveal handles this in v3
    />
  );
}

// Simple loading screen style (used for race-condition guard above)
const loadingStyle: React.CSSProperties = {
  width:           '100%',
  height:          '100%',
  display:         'flex',
  alignItems:      'center',
  justifyContent:  'center',
  backgroundColor: '#0d0f1a',
};
