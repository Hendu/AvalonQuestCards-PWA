// =============================================================================
// App.tsx  (v3.9 -- reconnect support)
//
// Root component. Routes to the correct screen based on game phase.
//
// v3.9 additions:
//   - DisconnectWaitModal rendered at root level when state.pendingDisconnect is set.
//     It overlays the current screen, freezing all interaction.
//   - rejoinNetworkGame passed down to StartScreen so the "Rejoin Game" button works.
//   - hostEndGameAfterDisconnect passed to DisconnectWaitModal.
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
import DisconnectWaitModal   from './components/DisconnectWaitModal';
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
    hostEndGameAfterDisconnect,
    joinNetworkGame,
    rejoinNetworkGame,
    playerConfirmRoleReveal,
    castTeamProposalVote,
    castNetworkVote,
    submitAssassination,
    toggleSound,
    resetGame,
    quitGame,
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
        onRejoinNetwork={rejoinNetworkGame}
        isLoading={state.isLoading}
        errorMessage={state.errorMessage}
        disconnectMessage={state.disconnectMessage}
        rejoinInfo={state.rejoinInfo}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Lobby
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
  // Role reveal
  // ---------------------------------------------------------------------------
  if (phase === 'role-reveal') {
    if (!state.myCharacter) {
      return (
        <div style={loadingStyle}>
          <p style={{ color: '#c9a96e' }}>Loading your character...</p>
        </div>
      );
    }
    return (
      <>
        <RoleRevealScreen
          myCharacter={state.myCharacter}
          myDeviceId={state.myDeviceId}
          players={state.players}
          characters={state.characters}
          confirmedRoleReveal={state.confirmedRoleReveal}
          totalPlayers={state.totalPlayers}
          onConfirm={playerConfirmRoleReveal}
        />
        {state.pendingDisconnect && (
          <DisconnectWaitModal
            pendingDisconnect={state.pendingDisconnect}
            isHost={isHost}
            onHostEndGame={hostEndGameAfterDisconnect}
            onGuestLeave={quitGame}
          />
        )}
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Team proposal
  // ---------------------------------------------------------------------------
  if (phase === 'team-propose') {
    const sortedPlayers  = [...state.players].sort(function(a, b) { return a.joinedAt - b.joinedAt; });
    const safeLeaderIdx  = state.leaderIndex % Math.max(sortedPlayers.length, 1);
    const leaderPlayer   = sortedPlayers[safeLeaderIdx];
    const leaderName     = leaderPlayer ? leaderPlayer.name : 'Unknown';

    return (
      <>
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
          isHost={isHost}
          onSubmitProposal={hostSubmitTeamProposal}
          onResetGame={quitGame}
        />
        {state.pendingDisconnect && (
          <DisconnectWaitModal
            pendingDisconnect={state.pendingDisconnect}
            isHost={isHost}
            onHostEndGame={hostEndGameAfterDisconnect}
            onGuestLeave={quitGame}
          />
        )}
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Team vote
  // ---------------------------------------------------------------------------
  if (phase === 'team-vote') {
    const sortedPlayers = [...state.players].sort(function(a, b) { return a.joinedAt - b.joinedAt; });
    const safeLeaderIdx = state.leaderIndex % Math.max(sortedPlayers.length, 1);
    const leaderPlayer  = sortedPlayers[safeLeaderIdx];
    const leaderName    = leaderPlayer ? leaderPlayer.name : 'Unknown';

    return (
      <>
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
          isHost={isHost}
          onVote={castTeamProposalVote}
          onResetGame={quitGame}
        />
        {state.pendingDisconnect && (
          <DisconnectWaitModal
            pendingDisconnect={state.pendingDisconnect}
            isHost={isHost}
            onHostEndGame={hostEndGameAfterDisconnect}
            onGuestLeave={quitGame}
          />
        )}
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Team vote results
  // ---------------------------------------------------------------------------
  if (phase === 'team-vote-results') {
    const result = evaluateProposalVotes(state.proposalVotes);

    return (
      <>
        <TeamVoteResultsScreen
          players={state.players}
          proposalVotes={state.proposalVotes}
          missionPlayerIds={state.missionPlayerIds}
          myCharacter={state.myCharacter}
          isHost={isHost}
          approveCount={result.approveCount}
          rejectCount={result.rejectCount}
          onContinue={hostAdvanceToMissionVoting}
          onResetGame={quitGame}
        />
        {state.pendingDisconnect && (
          <DisconnectWaitModal
            pendingDisconnect={state.pendingDisconnect}
            isHost={isHost}
            onHostEndGame={hostEndGameAfterDisconnect}
            onGuestLeave={quitGame}
          />
        )}
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Assassination
  // ---------------------------------------------------------------------------
  if (phase === 'assassination') {
    return (
      <>
        <AssassinationScreen
          players={state.players}
          characters={state.characters}
          myDeviceId={state.myDeviceId}
          myCharacter={state.myCharacter}
          amIAssassin={state.amIAssassin}
          isHost={isHost}
          onSubmitTarget={submitAssassination}
          onResetGame={quitGame}
        />
        {state.pendingDisconnect && (
          <DisconnectWaitModal
            pendingDisconnect={state.pendingDisconnect}
            isHost={isHost}
            onHostEndGame={hostEndGameAfterDisconnect}
            onGuestLeave={quitGame}
          />
        )}
      </>
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
    <>
      <GameBoardScreen
        state={state}
        onVote={handleVote}
        onAdvanceToNextQuest={handleAdvance}
        onResetVotes={resetLocalVotes}
        onResetGame={quitGame}
        onToggleSound={toggleSound}
        onRevealResults={function() {}}
      />
      {state.pendingDisconnect && (
        <DisconnectWaitModal
          pendingDisconnect={state.pendingDisconnect}
          isHost={isHost}
          onHostEndGame={hostEndGameAfterDisconnect}
          onGuestLeave={quitGame}
        />
      )}
    </>
  );
}

const loadingStyle: React.CSSProperties = {
  width:           '100%',
  height:          '100%',
  display:         'flex',
  alignItems:      'center',
  justifyContent:  'center',
  backgroundColor: '#0d0f1a',
};
