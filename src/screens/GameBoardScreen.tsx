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

import React, { useEffect, useRef, useState } from 'react';
import { GameState } from '../hooks/useGameState';
import { VoteResult, getMissionSize, getFailsRequired, CHARACTERS } from '../utils/gameLogic';
import { Player } from '../utils/firebaseGame';
import QuestTracker from '../components/QuestTracker';
import VoteCards    from '../components/VoteCards';
import VoteResults  from '../components/VoteResults';
import { COLORS, SPACING } from '../utils/theme';
import QuitButton from '../components/QuitButton';
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

// Two-phase credits scroller:
//   Phase 1 (intro): slides up from below the viewport, plays once
//   Phase 2 (loop):  seamless infinite scroll, no gap between repeats
function CreditsTrack(props: {
  content:       React.ReactNode;
  introDuration: number;
  loopDuration:  number;
}) {
  const { content, introDuration, loopDuration } = props;
  const [looping, setLooping] = useState(false);

  return (
    <div
      style={{
        animation: looping
          ? `creditsLoop ${loopDuration}s linear infinite`
          : `creditsIntro ${introDuration}s linear forwards`,
      }}
      onAnimationEnd={function() { setLooping(true); }}
    >
      {content}
      {looping && content}
    </div>
  );
}

function CreditLogos() {
  return (
    <img
      src="/assets/images/credit_logos.png"
      style={{ width: '100%', marginTop: 30, marginBottom: 10, display: 'block' }}
      alt="credit logos"
    />
  );
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

  // Sound effect on results and gameover.
  //
  // The results case is straightforward: detect the phase transition.
  //
  // The gameover case is trickier in network mode: when assassination resolves,
  // Firestore jumps phase from 'assassination' -> 'gameover', but GameBoardScreen
  // is unmounted during 'assassination' and RE-MOUNTED for 'gameover'. So the
  // component mounts with phase already === 'gameover' -- there's no transition
  // to detect. We handle this by playing the sound on mount if phase is already
  // gameover, using a one-shot ref so it only fires once.
  // Use a sentinel initial value so the first run of the phase-change effect
  // always sees a transition (prevPhase !== phase), even when the component
  // mounts directly into the 'results' phase (which is the normal network path).
  const prevPhaseRef     = useRef<string>('__init__');
  const gameoverSoundRef = useRef(false);  // true once we've played the gameover sound

  useEffect(function() {
    // On mount: if we're already at gameover (arrived from assassination screen), play now
    if (phase === 'gameover' && !gameoverSoundRef.current) {
      gameoverSoundRef.current = true;
      if (soundEnabled) {
        playSound(winner === 'good'
          ? '/assets/sounds/ff-fanfare.mp3'
          : '/assets/sounds/tpirhorns.wav'
        );
      }
    }
  }, []);  // mount only

  useEffect(function() {
    if (prevPhaseRef.current === phase) {
      prevPhaseRef.current = phase;
      return;
    }
    prevPhaseRef.current = phase;

    if (!soundEnabled) return;

    if (phase === 'results' && lastQuestResult) {
      // Mid-game quest result
      playSound(lastQuestResult.missionPassed
        ? '/assets/sounds/ff-fanfare.mp3'
        : '/assets/sounds/tpirhorns.wav'
      );
    } else if (phase === 'gameover' && !gameoverSoundRef.current) {
      // Gameover reached via phase transition within this component
      // (e.g. local mode, or evil wins 3 quests without assassination)
      gameoverSoundRef.current = true;
      playSound(winner === 'good'
        ? '/assets/sounds/ff-fanfare.mp3'
        : '/assets/sounds/tpirhorns.wav'
      );
    }
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
              {winner === 'good'
                ? (gameMode === 'local' ? 'GOOD PREVAILS... FOR NOW' : 'GOOD TRIUMPHS')
                : 'EVIL PREVAILS'}
            </h1>
            <p style={styles.gameOverSubtitle}>
              {winner === 'good'
                ? gameMode === 'local'
                  ? "Good has completed 3 quests!\nBut Merlin must still survive the Assassin's blade.\nDoes the Assassin know who Merlin is?"
                  : "Merlin survived the Assassin's blade.\nThe forces of Good prevail!"
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

            {/* Movie-style scrolling credits — always shown in network mode after game ends */}
            {gameMode === 'network' && Object.keys(state.characters).length > 0 && (() => {
              const goodOrder  = ['Merlin','Percival','Loyal Servant of Arthur','Loyal Servant'];
              const evilOrder  = ['Assassin','Morgana','Mordred','Oberon','Minion of Mordred','Minion'];

              function sortedByOrder(order: string[], alignment: 'good' | 'evil') {
                const entries = Object.entries(state.characters)
                  .filter(function([, c]) { return CHARACTERS[c].alignment === alignment; });
                return entries.sort(function([, a], [, b]) {
                  const ai = order.indexOf(a);
                  const bi = order.indexOf(b);
                  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                });
              }

              const goodCast = sortedByOrder(goodOrder, 'good');
              const evilCast = sortedByOrder(evilOrder, 'evil');

              const productionCredits = [
                { role: 'Directed by',  name: 'Ryan Henderson' },
                { role: 'Written by',   name: 'Ryan Henderson' },
                { role: 'Produced by',  name: 'Ryan Henderson' },
              ];

              const merlinEntry     = Object.entries(state.characters).find(function([, c]) { return c === 'Merlin'; });
              const merlinName      = merlinEntry ? getPlayerName(players, merlinEntry[0]) : null;
              const servantEntries  = Object.entries(state.characters)
                .filter(function([, c]) { return c === 'Loyal Servant of Arthur'; })
                .sort(function([a], [b]) { return a.localeCompare(b); }); // stable order

              // Prefer a human servant for "Bob" — being Bob is more fun if you're real
              const humanServants = servantEntries.filter(function([id]) {
                return !players.find(function(p) { return p.deviceId === id; })?.isBot;
              });
              const bobPool      = humanServants.length > 0 ? humanServants : servantEntries;
              const introServant = bobPool.length > 0 ? bobPool[bobPool.length - 1] : null;
              const regularServants = servantEntries.filter(function([id]) {
                return id !== introServant?.[0];
              });

              // Estimate total content height to set scroll duration
              // ~20px per cast row, ~12px spacer, ~28px section label
              const rowCount = goodCast.length + evilCast.length + productionCredits.length + 2; // +2 for special credits
              const estimatedHeight = rowCount * 22 + 4 * 12 + 2 * 28 + 60;

              function CreditRow({ left, right }: { left: string; right: string }) {
                return (
                  <div style={styles.creditsRow}>
                    <span style={styles.creditsCharacter}>{left}</span>
                    <span style={styles.creditsPlayer}>{right}</span>
                  </div>
                );
              }

              const viewportHeight = 180;
              const onePassHeight  = estimatedHeight + 30;
              const pxPerSec       = 35;   // cinematic credits speed
              // Both phases scroll at the same px/s rate
              const introDuration  = viewportHeight / pxPerSec;
              const loopDuration   = onePassHeight  / pxPerSec;

              const content = (
                <div>
                  <p style={styles.creditsTitle}>Cast</p>
                  {goodCast
                    .filter(function([, c]) { return c !== 'Merlin' && c !== 'Loyal Servant of Arthur'; })
                    .map(function([deviceId, character]) {
                      return <CreditRow key={deviceId} left={character} right={getPlayerName(players, deviceId)} />;
                    })
                  }
                  {regularServants.map(function([deviceId], index) {
                    return (
                      <CreditRow
                        key={deviceId}
                        left={index === 0 ? 'Loyal Servants' : ''}
                        right={getPlayerName(players, deviceId)}
                      />
                    );
                  })}
                  {evilCast.map(function([deviceId, character]) {
                    return <CreditRow key={deviceId} left={character} right={getPlayerName(players, deviceId)} />;
                  })}
                  {introServant && (
                    <CreditRow
                      left="And Introducing..."
                      right={`${getPlayerName(players, introServant[0])} as Bob, the Know-Nothing Blue`}
                    />
                  )}
                  {merlinName && (
                    <CreditRow left={`And ${merlinName}`} right="as Merlin" />
                  )}
                  <div style={styles.creditsSpacer} />
                  <div style={styles.creditsSpacer} />
                  <p style={styles.creditsSectionLabel}>Crew</p>
                  {productionCredits.map(function(credit) {
                    return <CreditRow key={credit.role} left={credit.role} right={credit.name} />;
                  })}
                  {/* Fake industry logos */}
                  <CreditLogos />
                  <p style={styles.creditsCopyright}>© MMXXVI Ryan Henderson. All Rights Reserved.</p>
                  <div style={{ height: 30 }} />
                </div>
              );

              const animStyle = `
                @keyframes creditsIntro {
                  0%   { transform: translateY(${viewportHeight}px); }
                  100% { transform: translateY(0px); }
                }
                @keyframes creditsLoop {
                  0%   { transform: translateY(0px); }
                  100% { transform: translateY(-50%); }
                }
              `;

              return (
                <div style={styles.creditsContainer}>
                  <style>{animStyle}</style>
                  <div style={styles.creditsViewport}>
                    <CreditsTrack
                      content={content}
                      introDuration={introDuration}
                      loopDuration={loopDuration}
                    />
                  </div>
                </div>
              );
            })()}
            {(gameMode === 'local' || isHost) && (
              <button style={styles.primaryButton} onClick={onResetGame}>
                {gameMode === 'local' && winner === 'good' ? 'RESOLVE & PLAY AGAIN' : 'START NEW GAME'}
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
                <QuitButton onConfirm={onResetGame} isHost={isHost} />
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

                  {/* LOCAL MODE -- unrevealed card slots (interactive cards live in bottomBar) */}
                  {gameMode === 'local' && (
                    <VoteResults
                      votes={voteResults}
                      totalSlots={missionSize}
                      isRevealed={false}
                    />
                  )}

                  {/* NETWORK MODE -- I AM on the mission and haven't voted */}
                  {gameMode === 'network' && amIOnMission && !haveIVoted && (
                    <p style={styles.yourTurnText}>🗡️ You are on this mission — vote secretly</p>
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
                </div>
              )}

            </div>

            {/* Fixed bottom bar */}
            <div style={styles.bottomBar}>
              {/* LOCAL: vote cards + reset */}
              {phase === 'voting' && gameMode === 'local' && (
                <>
                  <p style={styles.voteStatus}>
                    {missionSize - votesIn} vote{(missionSize - votesIn) !== 1 ? 's' : ''} remaining
                  </p>
                  <VoteCards onVote={onVote} disabled={votesIn >= missionSize} />
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
              {/* NETWORK: vote cards for mission players who haven't voted */}
              {phase === 'voting' && gameMode === 'network' && amIOnMission && !haveIVoted && (
                <VoteCards
                  onVote={onVote}
                  disabled={false}
                  isGoodPlayer={!!(myCharacter && CHARACTERS[myCharacter].alignment === 'good')}
                />
              )}
              {/* RESULTS: continue button */}
              {phase === 'results' && (gameMode === 'local' || isHost) && (
                <button style={styles.primaryButton} onClick={onAdvanceToNextQuest}>
                  CONTINUE TO QUEST {currentQuest + 1} →
                </button>
              )}
              {phase === 'results' && gameMode === 'network' && !isHost && (
                <p style={styles.guestNote}>⏳ Waiting for host to continue...</p>
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
  creditsContainer: {
    width:           '90%',
    backgroundColor: 'rgba(0,0,0,0.92)',
    borderRadius:    8,
    overflow:        'hidden',
  },
  creditsViewport: {
    height:   180,
    overflow: 'hidden',
    padding:  '0 24px',
  },
  creditsTitle: {
    fontSize:      12,
    color:         '#ffffff',
    fontWeight:    '400',
    textAlign:     'center',
    margin:        '0 0 10px 0',
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
  },
  creditsRow: {
    display:        'flex',
    flexDirection:  'row',
    justifyContent: 'center',
    alignItems:     'baseline',
    marginBottom:   4,
  },
  creditsCharacter: {
    fontSize:      12,
    color:         '#999999',
    fontWeight:    '400',
    textAlign:     'right',
    flex:          1,
    paddingRight:  12,
    letterSpacing: '0.3px',
    textTransform: 'uppercase' as const,
  },
  creditsPlayer: {
    fontSize:      12,
    color:         '#ffffff',
    fontWeight:    '400',
    textAlign:     'left',
    flex:          1,
    paddingLeft:   12,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  creditsSpacer: {
    height: 12,
  },
  creditsCopyright: {
    fontSize:      10,
    color:         '#999999',
    textAlign:     'center',
    margin:        '2px 0 0 0',
    letterSpacing: '0.5px',
  },
  creditsSectionLabel: {
    fontSize:      12,
    color:         '#ffffff',
    fontWeight:    '400',
    textAlign:     'center',
    margin:        '4px 0 8px 0',
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
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
  },
  bottomBar: {
    flexShrink:      0,
    padding:         `${SPACING.md}px ${SPACING.md}px`,
    borderTop:       '1px solid rgba(42,45,69,0.5)',
    backgroundColor: 'rgba(13,15,26,0.85)',
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    gap:             SPACING.md,
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