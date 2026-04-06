// =============================================================================
// GameBoardScreen.tsx
//
// The voting and results screen. Handles both local and network modes.
//
// NETWORK VOTING FLOW:
//   - Mission players: see vote cards on their own device, tap privately
//   - Non-mission players: see "You are not on this mission" + vote progress
//   - After voting: mission players see "Waiting for others" 
//   - Host: when all votes are in, sees "Reveal Results" button
//   - After reveal: all devices see results simultaneously
//
// LOCAL VOTING FLOW:
//   - Same as original -- pass the phone, each player taps their card
//   - All voting happens on one device
// =============================================================================

import React, { useEffect, useRef } from 'react';
import { GameState } from '../hooks/useGameState';
import { VoteResult, getMissionSize, getFailsRequired } from '../utils/gameLogic';
import { Player } from '../utils/firebaseGame';
import QuestTracker from '../components/QuestTracker';
import VoteCards    from '../components/VoteCards';
import VoteResults  from '../components/VoteResults';
import { COLORS, SPACING } from '../utils/theme';
import CharacterBadge from '../components/CharacterBadge';

interface GameBoardScreenProps {
  state:                GameState;
  onVote:               (result: VoteResult) => void;   // works for both local and network
  onAdvanceToNextQuest: () => void;
  onResetVotes:         () => void;
  onResetGame:          () => void;
  onToggleSound:        () => void;
  onRevealResults:      () => void;  // host only, network mode
}

function getBackgroundImage(phase: GameState['phase'], winner: string | null): string {
  if (phase === 'gameover' && winner === 'good') return '/assets/images/good_wins_background.png';
  if (phase === 'gameover' && winner === 'evil') return '/assets/images/evil_wins_background.png';
  return '/assets/images/normal_background.png';
}

function playSound(file: string) {
  try { new Audio(file).play(); } catch (e) {}
}

// Find a player name by deviceId
function getPlayerName(players: Player[], deviceId: string): string {
  const player = players.find(function(p) { return p.deviceId === deviceId; });
  return player ? player.name : 'Unknown';
}

export default function GameBoardScreen(props: GameBoardScreenProps) {
  const {
    state, onVote, onAdvanceToNextQuest, onResetVotes,
    onResetGame, onToggleSound, onRevealResults,
  } = props;

  const {
    totalPlayers, currentQuest, goodWins, evilWins, questOutcomes,
    votes, phase, lastQuestResult, winner, soundEnabled,
    gameMode, isHost, players, missionPlayerIds,
    amIOnMission, haveIVoted, allVotesIn,
    myDeviceId, myName, myCharacter, assassinTarget,
  } = state;

  const missionSize   = getMissionSize(totalPlayers, currentQuest);
  const failsRequired = getFailsRequired(totalPlayers, currentQuest);
  const isGameOver    = (phase === 'gameover');
  const isResultPhase = (phase === 'results' || phase === 'gameover');
  const bgImage       = getBackgroundImage(phase, winner);

  // Sound effect on results
  const prevPhaseRef = useRef(phase);
  useEffect(function() {
    if (prevPhaseRef.current !== phase && isResultPhase) {
      if (soundEnabled && lastQuestResult) {
        playSound(lastQuestResult.missionPassed
          ? '/assets/sounds/ff-fanfare.mp3'
          : '/assets/sounds/tpirhorns.wav'
        );
      }
    }
    prevPhaseRef.current = phase;
  }, [phase]);

  const overlayOpacity = isGameOver ? 0 : isResultPhase ? 0.45 : 0.65;

  // Mission player names for display
  const missionPlayerNames = missionPlayerIds.map(function(id) {
    return getPlayerName(players, id);
  });

  // Vote tally for display (just count, not reveal who voted what)
  const votesIn = votes.length;

  // In local mode, votes are PlayerVote objects with fake deviceIds
  // In network mode, they're real PlayerVote objects
  const voteResults = votes.map(function(v) { return v.vote; });

  return (
    <div style={{ ...styles.screen, backgroundImage: `url(${bgImage})` }}>

      {overlayOpacity > 0 && (
        <div style={{ ...styles.overlay, backgroundColor: `rgba(0,0,0,${overlayOpacity})` }} />
      )}

      <div style={styles.content}>

        {/* ------------------------------------------------------------------ */}
        {/* GAME OVER                                                           */}
        {/* ------------------------------------------------------------------ */}
        {isGameOver && (
          <div style={styles.gameOverContainer}>
            <h1 style={{
              ...styles.gameOverTitle,
              color: winner === 'good' ? COLORS.good : COLORS.evil,
            }}>
              {winner === 'good' ? 'GOOD TRIUMPHS' : 'EVIL PREVAILS'}
            </h1>
            <p style={styles.gameOverSubtitle}>
              {winner === 'good'
                ? "Merlin survived the Assassin's blade.\nThe forces of Good prevail!"
                : assassinTarget !== null
                  ? "The Assassin found Merlin.\nEvil wins by assassination."
                  : lastQuestResult === null
                    ? "Five proposals were rejected.\nEvil wins automatically."
                    : "The forces of Evil have sabotaged 3 quests.\nDarkness reigns."}
            </p>
            {lastQuestResult !== null && (
              <VoteResults
                votes={voteResults}
                totalSlots={missionSize}
                isRevealed={true}
                failCount={lastQuestResult.failCount}
                successCount={lastQuestResult.successCount}
              />
            )}
            {(gameMode === 'local' || isHost) && (
              <button style={styles.primaryButton} onClick={onResetGame}>
                START NEW GAME
              </button>
            )}
            {gameMode === 'network' && !isHost && (
              <button style={styles.primaryButton} onClick={onResetGame}>
                LEAVE GAME
              </button>
            )}
          </div>
        )}


        {/* ------------------------------------------------------------------ */}
        {/* NORMAL GAME FLOW                                                    */}
        {/* ------------------------------------------------------------------ */}
        {!isGameOver && (
          <div style={styles.gameContent}>

            {/* Top bar */}
            <div style={styles.topBar}>
              <button style={styles.iconButton} onClick={onToggleSound}>
                {soundEnabled ? '🔊' : '🔇'}
              </button>
              <span style={styles.topBarTitle}>AVALON QUEST CARDS</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {gameMode === 'network' && myCharacter && (
                  <CharacterBadge character={myCharacter} />
                )}
                <button style={styles.iconButton} onClick={onResetGame}>↺</button>
              </div>
            </div>

            {/* Network info bar */}
            {gameMode === 'network' && (
              <div style={styles.networkBar}>
                <span style={styles.networkBarText}>
                  Playing as <strong style={{ color: COLORS.gold }}>{myName}</strong>
                </span>
                <span style={styles.networkBarText}>
                  {isHost ? '👑 Host' : 'Guest'}
                </span>
              </div>
            )}

            <div style={styles.scrollArea}>

              {/* Quest header */}
              <div style={styles.questHeader}>
                <h2 style={styles.questLabel}>QUEST {currentQuest} OF 5</h2>
                <p style={styles.questMeta}>
                  {missionSize} players · {failsRequired === 2 ? '2 fails required' : '1 fail required'}
                </p>
              </div>

              <QuestTracker
                totalPlayers={totalPlayers}
                currentQuest={currentQuest}
                questOutcomes={questOutcomes}
              />

              {/* Scoreboard */}
              <div style={styles.scoreRow}>
                <div style={{ ...styles.scoreBox, ...styles.scoreBoxGood }}>
                  <span style={styles.scoreNumber}>{goodWins}</span>
                  <span style={styles.scoreLabel}>GOOD</span>
                </div>
                <span style={styles.scoreVs}>vs</span>
                <div style={{ ...styles.scoreBox, ...styles.scoreBoxEvil }}>
                  <span style={styles.scoreNumber}>{evilWins}</span>
                  <span style={styles.scoreLabel}>EVIL</span>
                </div>
              </div>

              <div style={styles.divider} />

              {/* ------------------------------------------------------------ */}
              {/* VOTING PHASE                                                  */}
              {/* ------------------------------------------------------------ */}
              {phase === 'voting' && (
                <div style={styles.votingSection}>

                  {/* Show who's on the mission */}
                  {gameMode === 'network' && missionPlayerNames.length > 0 && (
                    <div style={styles.missionRoster}>
                      <p style={styles.missionLabel}>ON THIS MISSION</p>
                      <p style={styles.missionNames}>{missionPlayerNames.join('  ·  ')}</p>
                    </div>
                  )}

                  {/* LOCAL MODE -- pass the phone, everyone votes here */}
                  {gameMode === 'local' && (
                    <>
                      <p style={styles.voteStatus}>
                        {missionSize - votesIn} vote{(missionSize - votesIn) !== 1 ? 's' : ''} remaining
                      </p>
                      <VoteCards
                        onVote={onVote}
                        disabled={votesIn >= missionSize}
                      />
                      <VoteResults
                        votes={voteResults}
                        totalSlots={missionSize}
                        isRevealed={false}
                      />
                      <button
                        style={{
                          ...styles.resetButton,
                          ...(votesIn === 0 ? styles.resetButtonDisabled : styles.resetButtonActive),
                        }}
                        onClick={onResetVotes}
                        disabled={votesIn === 0}
                      >
                        <span style={{ color: votesIn === 0 ? COLORS.textMuted : COLORS.gold, fontSize: 11, letterSpacing: '2px' }}>
                          RESET VOTES
                        </span>
                      </button>
                    </>
                  )}

                  {/* NETWORK MODE -- I AM on the mission and haven't voted */}
                  {gameMode === 'network' && amIOnMission && !haveIVoted && (
                    <>
                      <p style={styles.yourTurnText}>🗡️ You are on this mission — vote secretly</p>
                      <VoteCards onVote={onVote} disabled={false} />
                    </>
                  )}

                  {/* NETWORK MODE -- I AM on the mission and HAVE voted */}
                  {gameMode === 'network' && amIOnMission && haveIVoted && (
                    <p style={styles.votedText}>
                      ✓ Your vote is in. Waiting for others...
                    </p>
                  )}

                  {/* NETWORK MODE -- I am NOT on the mission */}
                  {gameMode === 'network' && !amIOnMission && (
                    <p style={styles.notOnMissionText}>
                      You are not on this mission. Waiting for results...
                    </p>
                  )}

                  {/* Vote progress -- shown in network mode for everyone */}
                  {gameMode === 'network' && (
                    <div style={styles.voteProgress}>
                      <p style={styles.voteProgressText}>
                        {votesIn} of {missionSize} votes cast
                      </p>
                      {/* Show backs for votes in, blanks for remaining */}
                      <VoteResults
                        votes={voteResults}
                        totalSlots={missionSize}
                        isRevealed={false}
                      />
                    </div>
                  )}

                  {/* Results reveal automatically when all votes are in */}
                  {gameMode === 'network' && isHost && allVotesIn && (
                    <p style={styles.voteProgressText}>⏳ Revealing results...</p>
                  )}

                </div>
              )}

              {/* ------------------------------------------------------------ */}
              {/* MID-GAME RESULTS PHASE                                        */}
              {/* ------------------------------------------------------------ */}
              {phase === 'results' && lastQuestResult !== null && (
                <div style={styles.resultsSection}>
                  <div style={{
                    ...styles.resultBanner,
                    ...(lastQuestResult.missionPassed ? styles.resultBannerGood : styles.resultBannerEvil),
                  }}>
                    <span style={styles.resultEmoji}>
                      {lastQuestResult.missionPassed ? '⚔️' : '💀'}
                    </span>
                    <h3 style={styles.resultTitle}>
                      {lastQuestResult.missionPassed ? 'QUEST SUCCEEDED' : 'QUEST FAILED'}
                    </h3>
                    <p style={styles.resultSubtitle}>
                      {lastQuestResult.missionPassed ? 'Good wins this round!' : 'Evil wins this round!'}
                    </p>
                  </div>

                  <VoteResults
                    votes={voteResults}
                    totalSlots={missionSize}
                    isRevealed={true}
                    failCount={lastQuestResult.failCount}
                    successCount={lastQuestResult.successCount}
                  />

                  {(gameMode === 'local' || isHost) && (
                    <button style={styles.primaryButton} onClick={onAdvanceToNextQuest}>
                      CONTINUE TO QUEST {currentQuest + 1} →
                    </button>
                  )}

                  {gameMode === 'network' && !isHost && (
                    <p style={styles.guestNote}>⏳ Waiting for host to continue...</p>
                  )}
                </div>
              )}

            </div>
          </div>
        )}

      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  screen: {
    width:              '100%',
    height:             '100%',
    backgroundSize:     'cover',
    backgroundPosition: 'center',
    position:           'relative',
    overflow:           'hidden',
  },
  overlay: {
    position: 'absolute',
    inset:    0,
    zIndex:   0,
  },
  content: {
    position:      'relative',
    zIndex:        1,
    width:         '100%',
    height:        '100%',
    display:       'flex',
    flexDirection: 'column',
  },
  gameOverContainer: {
    flex:           1,
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'flex-end',
    padding:        SPACING.xl,
    paddingBottom:  SPACING.xxl,
    gap:            SPACING.lg,
  },
  gameOverTitle: {
    fontSize:      32,
    fontWeight:    '800',
    letterSpacing: '5px',
    textAlign:     'center',
    textShadow:    '0 2px 8px rgba(0,0,0,0.9)',
    margin:        0,
  },
  gameOverSubtitle: {
    fontSize:   15,
    color:      COLORS.textPrimary,
    textAlign:  'center',
    lineHeight: '1.6',
    textShadow: '0 1px 6px rgba(0,0,0,0.9)',
    whiteSpace: 'pre-line',
    margin:     0,
  },
  gameContent: {
    display:       'flex',
    flexDirection: 'column',
    height:        '100%',
    overflow:      'hidden',
  },
  topBar: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    padding:         `${SPACING.sm}px ${SPACING.md}px`,
    borderBottom:    `1px solid rgba(42,45,69,0.8)`,
    backgroundColor: 'rgba(13,15,26,0.7)',
    flexShrink:      0,
  },
  iconButton: {
    background: 'none',
    border:     'none',
    fontSize:   22,
    cursor:     'pointer',
    color:      COLORS.textPrimary,
    padding:    '4px 8px',
  },
  topBarTitle: {
    fontSize:      11,
    color:         COLORS.textMuted,
    letterSpacing: '3px',
    fontWeight:    '600',
  },
  networkBar: {
    display:         'flex',
    justifyContent:  'space-between',
    padding:         `4px ${SPACING.md}px`,
    backgroundColor: 'rgba(13,15,26,0.5)',
    borderBottom:    `1px solid rgba(42,45,69,0.4)`,
    flexShrink:      0,
  },
  networkBarText: {
    fontSize: 12,
    color:    COLORS.textMuted,
  },
  scrollArea: {
    flex:          1,
    overflowY:     'auto',
    padding:       SPACING.md,
    display:       'flex',
    flexDirection: 'column',
    gap:           SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  questHeader: {
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    gap:           4,
  },
  questLabel: {
    fontSize:      26,
    fontWeight:    '800',
    color:         COLORS.gold,
    letterSpacing: '3px',
    margin:        0,
  },
  questMeta: {
    fontSize:      12,
    color:         COLORS.textMuted,
    letterSpacing: '1px',
    textTransform: 'uppercase',
    margin:        0,
  },
  scoreRow: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            SPACING.lg,
  },
  scoreBox: {
    width:          72,
    height:         72,
    borderRadius:   12,
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    border:         '1px solid',
    gap:            2,
  },
  scoreBoxGood: {
    borderColor:     COLORS.goodDim,
    backgroundColor: 'rgba(13,42,30,0.85)',
  },
  scoreBoxEvil: {
    borderColor:     COLORS.evilDim,
    backgroundColor: 'rgba(42,13,13,0.85)',
  },
  scoreNumber: {
    fontSize:   32,
    fontWeight: '800',
    color:      COLORS.textPrimary,
  },
  scoreLabel: {
    fontSize:  11,
    color:         COLORS.gold,
    letterSpacing: '2px',
  },
  scoreVs: {
    fontSize: 14,
    color:    COLORS.gold,
  },
  divider: {
    height:          1,
    backgroundColor: 'rgba(42,45,69,0.6)',
  },
  votingSection: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            SPACING.lg,
  },
  missionRoster: {
    width:           '100%',
    padding:         `${SPACING.sm}px ${SPACING.md}px`,
    backgroundColor: 'rgba(30,33,54,0.7)',
    borderRadius:    12,
    border:          `1px solid ${COLORS.border}`,
    textAlign:       'center',
  },
  missionLabel: {
    fontSize:  12,
    color:         COLORS.textMuted,
    letterSpacing: '3px',
    textTransform: 'uppercase',
    margin:        '0 0 4px 0',
  },
  missionNames: {
    fontSize:   15,
    color:      COLORS.gold,
    fontWeight: '600',
    margin:     0,
  },
  voteStatus: {
    fontSize:      14,
    color:         COLORS.textSecondary,
    letterSpacing: '1px',
    margin:        0,
  },
  yourTurnText: {
    fontSize:   15,
    color:      COLORS.good,
    fontWeight: '600',
    textAlign:  'center',
    margin:     0,
  },
  votedText: {
    fontSize:  14,
    color:     COLORS.textSecondary,
    textAlign: 'center',
    margin:    0,
    padding:   SPACING.lg,
  },
  notOnMissionText: {
    fontSize:  14,
    color:     COLORS.textMuted,
    textAlign: 'center',
    margin:    0,
    padding:   SPACING.lg,
  },
  voteProgress: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            SPACING.sm,
    width:          '100%',
  },
  voteProgressText: {
    fontSize:  13,
    color:     COLORS.textMuted,
    textAlign: 'center',
    margin:    0,
  },
  revealButton: {
    width:           '100%',
    padding:         `${SPACING.md}px`,
    backgroundColor: COLORS.gold,
    border:          'none',
    borderRadius:    20,
    fontSize:        15,
    fontWeight:      '800',
    color:           COLORS.bgDark,
    letterSpacing:   '3px',
    cursor:          'pointer',
  },
  resetButton: {
    padding:         `${SPACING.sm}px ${SPACING.xl}px`,
    borderRadius:    999,
    border:          '1px solid',
    backgroundColor: 'rgba(13,15,26,0.6)',
    cursor:          'pointer',
  },
  resetButtonActive: {
    borderColor: COLORS.gold,
  },
  resetButtonDisabled: {
    borderColor: 'rgba(42,45,69,0.8)',
    cursor:      'default',
  },
  resultsSection: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            SPACING.lg,
  },
  resultBanner: {
    width:          '100%',
    padding:        `${SPACING.lg}px ${SPACING.md}px`,
    borderRadius:   20,
    border:         '1px solid',
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            4,
  },
  resultBannerGood: {
    borderColor:     COLORS.goodDim,
    backgroundColor: 'rgba(13,42,30,0.88)',
  },
  resultBannerEvil: {
    borderColor:     COLORS.evilDim,
    backgroundColor: 'rgba(42,13,13,0.88)',
  },
  resultEmoji: {
    fontSize: 36,
  },
  resultTitle: {
    fontSize:      22,
    fontWeight:    '800',
    color:         COLORS.textPrimary,
    letterSpacing: '3px',
    margin:        0,
  },
  resultSubtitle: {
    fontSize: 13,
    color:    COLORS.textSecondary,
    margin:   0,
  },
  primaryButton: {
    width:           '100%',
    padding:         `${SPACING.md}px`,
    backgroundColor: COLORS.gold,
    border:          'none',
    borderRadius:    20,
    fontSize:        13,
    fontWeight:      '800',
    color:           COLORS.bgDark,
    letterSpacing:   '3px',
    textTransform:   'uppercase',
    cursor:          'pointer',
  },
  guestNote: {
    fontSize:  13,
    color:     COLORS.textMuted,
    textAlign: 'center',
    margin:    0,
  },
};
