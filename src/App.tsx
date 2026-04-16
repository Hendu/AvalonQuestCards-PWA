// =============================================================================
// App.tsx  (v4.0 -- Lady of the Lake)
//
// Root component. Routes to the correct screen based on game phase.
//
// v4.0 additions:
//   - 'lady-of-the-lake' phase block routes to LadyOfTheLakeScreen.
//   - hostToggleLadyOfTheLake wired from useGameState into LobbyScreen.
//   - submitLadyInvestigation wired from useGameState into LadyOfTheLakeScreen.
//   - All LoTL state fields (ladyOfTheLakeEnabled, ladyDeviceId, ladyHistory,
//     ladyResult, amILady) forwarded where needed.
//
// v3.9 -- reconnect support (DisconnectWaitModal, rejoinNetworkGame)
// =============================================================================

import React from 'react';
import { useGameState }      from './hooks/useGameState';
import StartScreen           from './screens/StartScreen';
import LobbyScreen           from './screens/LobbyScreen';
import RoleRevealScreen      from './screens/RoleRevealScreen';
import TeamProposeScreen     from './screens/TeamProposeScreen';
import TeamVoteScreen        from './screens/TeamVoteScreen';
import TeamVoteResultsScreen from './screens/TeamVoteResultsScreen';
import GameBoardScreen       from './screens/GameBoardScreen';
import AssassinationScreen   from './screens/AssassinationScreen';
import LadyOfTheLakeScreen   from './screens/LadyOfTheLakeScreen';
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
    hostToggleLadyOfTheLake,
    hostToggleBots,
    hostStartGame,
    hostSubmitTeamProposal,
    hostAdvanceFromVoteResults,
    advanceNetworkQuest,
    hostEndGameAfterDisconnect,
    joinNetworkGame,
    rejoinNetworkGame,
    playerConfirmRoleReveal,
    castTeamProposalVote,
    castNetworkVote,
    submitAssassination,
    submitLadyInvestigation,
    toggleSound,
    resetGame,
    quitGame,
  } = useGameState();

  const { phase, gameMode, isHost } = state;


  // Derive whether the disconnected player is the host (index 0 by joinedAt)
  const hostDeviceId = [...state.players].sort(function(a, b) { return a.joinedAt - b.joinedAt; })[0]?.deviceId;
  const disconnectedPlayerIsHost = !!(
    state.pendingDisconnect &&
    state.pendingDisconnect.deviceId === hostDeviceId
  );

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
        soundEnabled={state.soundEnabled}
        onToggleSound={toggleSound}
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
        ladyOfTheLakeEnabled={state.ladyOfTheLakeEnabled}
        onToggleLadyOfTheLake={hostToggleLadyOfTheLake}
        botsEnabled={state.botsEnabled}
        onToggleBots={hostToggleBots}
        onStartGame={hostStartGame}
        onLeave={resetGame}
        soundEnabled={state.soundEnabled}
        onToggleSound={toggleSound}
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
          onResetGame={quitGame}
          isHost={isHost}
          soundEnabled={state.soundEnabled}
          onToggleSound={toggleSound}
        />
        {state.pendingDisconnect && (
          <DisconnectWaitModal
            pendingDisconnect={state.pendingDisconnect}
            isHost={isHost}
            disconnectedPlayerIsHost={disconnectedPlayerIsHost}
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
    const leaderDeviceId = state.leaderOrder.length > 0
      ? state.leaderOrder[state.leaderIndex % state.leaderOrder.length]
      : [...state.players].sort(function(a, b) { return a.joinedAt - b.joinedAt; })[state.leaderIndex % Math.max(state.players.length, 1)]?.deviceId;
    const leaderPlayer   = state.players.find(function(p) { return p.deviceId === leaderDeviceId; });
    const leaderName     = leaderPlayer ? '👑 ' + leaderPlayer.name : 'Unknown';

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
          ladyOfTheLakeEnabled={state.ladyOfTheLakeEnabled}
          ladyResult={state.ladyResult}
          ladyHistory={state.ladyHistory}
          soundEnabled={state.soundEnabled}
          onToggleSound={toggleSound}
          leaderDeviceId={leaderDeviceId ?? ''}
          characters={state.characters}
          myDeviceId={state.myDeviceId}
        />
        {state.pendingDisconnect && (
          <DisconnectWaitModal
            pendingDisconnect={state.pendingDisconnect}
            isHost={isHost}
            disconnectedPlayerIsHost={disconnectedPlayerIsHost}
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
    const leaderDeviceId = state.leaderOrder.length > 0
      ? state.leaderOrder[state.leaderIndex % state.leaderOrder.length]
      : [...state.players].sort(function(a, b) { return a.joinedAt - b.joinedAt; })[state.leaderIndex % Math.max(state.players.length, 1)]?.deviceId;
    const leaderPlayer  = state.players.find(function(p) { return p.deviceId === leaderDeviceId; });
    const leaderName    = leaderPlayer ? '👑 ' + leaderPlayer.name : 'Unknown';

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
          soundEnabled={state.soundEnabled}
          onToggleSound={toggleSound}
          leaderDeviceId={leaderDeviceId ?? ''}
          characters={state.characters}
        />
        {state.pendingDisconnect && (
          <DisconnectWaitModal
            pendingDisconnect={state.pendingDisconnect}
            isHost={isHost}
            disconnectedPlayerIsHost={disconnectedPlayerIsHost}
            onHostEndGame={hostEndGameAfterDisconnect}
            onGuestLeave={quitGame}
          />
        )}
      </>
    );
  }

  // ---------------------------------------------------------------------------
  if (phase === 'team-vote-results') {
    // leaderIndex has already advanced — the proposing leader was one step back
    const orderLen          = state.leaderOrder.length > 0 ? state.leaderOrder.length : state.players.length;
    const proposerIdx       = (state.leaderIndex - 1 + orderLen) % Math.max(orderLen, 1);
    const proposerDeviceId  = state.leaderOrder.length > 0
      ? state.leaderOrder[proposerIdx] ?? ''
      : [...state.players].sort(function(a, b) { return a.joinedAt - b.joinedAt; })[proposerIdx]?.deviceId ?? '';
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
          approved={state.lastProposalApproved}
          onContinue={hostAdvanceFromVoteResults}
          onResetGame={quitGame}
          soundEnabled={state.soundEnabled}
          onToggleSound={toggleSound}
          leaderDeviceId={proposerDeviceId}
          characters={state.characters}
          myDeviceId={state.myDeviceId}
        />
        {state.pendingDisconnect && (
          <DisconnectWaitModal
            pendingDisconnect={state.pendingDisconnect}
            isHost={isHost}
            disconnectedPlayerIsHost={disconnectedPlayerIsHost}
            onHostEndGame={hostEndGameAfterDisconnect}
            onGuestLeave={quitGame}
          />
        )}
    </>
    );
  }

  // ---------------------------------------------------------------------------
  // v4: Lady of the Lake
  // ---------------------------------------------------------------------------
  if (phase === 'lady-of-the-lake') {
    return (
      <LadyOfTheLakeScreen
        players={state.players}
        myDeviceId={state.myDeviceId}
        myCharacter={state.myCharacter}
        myName={state.myName}
        amILady={state.amILady}
        ladyDeviceId={state.ladyDeviceId}
        ladyHistory={state.ladyHistory}
        ladyResult={state.ladyResult}
        characters={state.characters}
        onSubmitInvestigation={submitLadyInvestigation}
        onResetGame={quitGame}
        pendingDisconnect={state.pendingDisconnect}
        isHost={isHost}
        disconnectedPlayerIsHost={disconnectedPlayerIsHost}
        onHostEndGame={hostEndGameAfterDisconnect}
        onGuestLeave={quitGame}
        soundEnabled={state.soundEnabled}
        onToggleSound={toggleSound}
      />
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
          soundEnabled={state.soundEnabled}
          onToggleSound={toggleSound}
        />
        {state.pendingDisconnect && (
          <DisconnectWaitModal
            pendingDisconnect={state.pendingDisconnect}
            isHost={isHost}
            disconnectedPlayerIsHost={disconnectedPlayerIsHost}
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
          disconnectedPlayerIsHost={disconnectedPlayerIsHost}
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

