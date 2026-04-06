// =============================================================================
// MissionSelectScreen.tsx
//
// Shown between quests (host only controls this screen).
// Host taps player names to select who goes on the mission.
// The number required is enforced -- can't send wrong number.
//
// Guests see a "waiting for host to select mission players" message.
// =============================================================================

import React, { useState } from 'react';
import { Player } from '../utils/firebaseGame';
import { getMissionSize, getFailsRequired, VOTES_REQUIRED } from '../utils/gameLogic';
import { COLORS, SPACING } from '../utils/theme';
import QuestTracker from '../components/QuestTracker';
import { QuestOutcome } from '../utils/gameLogic';

interface MissionSelectScreenProps {
  isHost:           boolean;
  players:          Player[];
  currentQuest:     number;
  totalPlayers:     number;
  goodWins:         number;
  evilWins:         number;
  questOutcomes:    QuestOutcome[];
  myName:           string;
  onSendOnMission:  (deviceIds: string[]) => void;
  onResetGame:      () => void;
}

export default function MissionSelectScreen(props: MissionSelectScreenProps) {
  const {
    isHost, players, currentQuest, totalPlayers,
    goodWins, evilWins, questOutcomes, myName,
    onSendOnMission, onResetGame,
  } = props;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const missionSize   = getMissionSize(totalPlayers, currentQuest);
  const failsRequired = getFailsRequired(totalPlayers, currentQuest);
  const canSend       = selectedIds.length === missionSize;

  function togglePlayer(deviceId: string) {
    if (!isHost) return;

    setSelectedIds(function(prev) {
      if (prev.includes(deviceId)) {
        // Deselect
        return prev.filter(function(id) { return id !== deviceId; });
      }
      if (prev.length >= missionSize) {
        // Already at max -- replace oldest selection
        return [...prev.slice(1), deviceId];
      }
      return [...prev, deviceId];
    });
  }

  function handleSend() {
    if (canSend) {
      onSendOnMission(selectedIds);
    }
  }

  return (
    <div style={{ ...styles.screen, backgroundImage: 'url(/assets/images/normal_background.png)' }}>
      <div style={styles.overlay} />

      <div style={styles.content}>

        {/* Top bar */}
        <div style={styles.topBar}>
          <span style={styles.topBarTitle}>AVALON QUEST CARDS</span>
          <button style={styles.iconButton} onClick={onResetGame}>↺</button>
        </div>

        <div style={styles.scrollArea}>

          {/* Quest header */}
          <div style={styles.questHeader}>
            <h2 style={styles.questLabel}>QUEST {currentQuest} OF 5</h2>
            <p style={styles.questMeta}>
              {missionSize} players needed · {failsRequired === 2 ? '2 fails to fail' : '1 fail to fail'}
            </p>
          </div>

          {/* Quest tracker */}
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

          {isHost ? (
            <>
              {/* Mission selection instructions */}
              <p style={styles.instructions}>
                Select <strong style={{ color: COLORS.gold }}>{missionSize}</strong> players for this mission
                ({selectedIds.length} / {missionSize} selected)
              </p>

              {/* Player list -- tap to select */}
              <div style={styles.playerList}>
                {players.map(function(player) {
                  const isSelected = selectedIds.includes(player.deviceId);
                  return (
                    <button
                      key={player.deviceId}
                      style={{
                        ...styles.playerButton,
                        ...(isSelected ? styles.playerButtonSelected : {}),
                      }}
                      onClick={function() { togglePlayer(player.deviceId); }}
                    >
                      <span style={{
                        ...styles.playerName,
                        ...(isSelected ? styles.playerNameSelected : {}),
                      }}>
                        {player.name}
                      </span>
                      {isSelected && <span style={styles.checkmark}>✓</span>}
                    </button>
                  );
                })}
              </div>

              <button
                style={{
                  ...styles.sendButton,
                  ...(!canSend ? styles.sendButtonDisabled : {}),
                }}
                onClick={handleSend}
                disabled={!canSend}
              >
                SEND ON MISSION →
              </button>
            </>
          ) : (
            /* Guest view */
            <div style={styles.guestWaiting}>
              <p style={styles.waitingText}>
                ⏳ Host is selecting {missionSize} players for the mission...
              </p>
              <p style={styles.yourName}>You are: <strong style={{ color: COLORS.gold }}>{myName}</strong></p>
            </div>
          )}

        </div>
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
  },
  overlay: {
    position:        'absolute',
    inset:           0,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  content: {
    position:      'relative',
    zIndex:        1,
    width:         '100%',
    height:        '100%',
    display:       'flex',
    flexDirection: 'column',
  },
  topBar: {
    display:         'flex',
    justifyContent:  'space-between',
    alignItems:      'center',
    padding:         `${SPACING.sm}px ${SPACING.md}px`,
    borderBottom:    `1px solid rgba(42,45,69,0.8)`,
    backgroundColor: 'rgba(13,15,26,0.7)',
    flexShrink:      0,
  },
  topBarTitle: {
    fontSize:      11,
    color:         COLORS.textMuted,
    letterSpacing: '3px',
    fontWeight:    '600',
  },
  iconButton: {
    background: 'none',
    border:     'none',
    fontSize:   22,
    cursor:     'pointer',
    color:      COLORS.textPrimary,
    padding:    '4px 8px',
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
  instructions: {
    fontSize:  15,
    color:     COLORS.textSecondary,
    textAlign: 'center',
    margin:    0,
  },
  playerList: {
    display:       'flex',
    flexDirection: 'column',
    gap:           8,
  },
  playerButton: {
    width:           '100%',
    padding:         `${SPACING.md}px`,
    backgroundColor: 'rgba(22,24,38,0.85)',
    border:          `1px solid ${COLORS.border}`,
    borderRadius:    12,
    display:         'flex',
    justifyContent:  'space-between',
    alignItems:      'center',
    cursor:          'pointer',
    transition:      'all 0.15s ease',
  },
  playerButtonSelected: {
    backgroundColor: 'rgba(30,33,54,0.95)',
    borderColor:     COLORS.gold,
  },
  playerName: {
    fontSize:   16,
    fontWeight: '600',
    color:      COLORS.textMuted,
  },
  playerNameSelected: {
    color: COLORS.textPrimary,
  },
  checkmark: {
    fontSize: 18,
    color:    COLORS.gold,
  },
  sendButton: {
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
  sendButtonDisabled: {
    opacity: 0.4,
    cursor:  'default',
  },
  guestWaiting: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            SPACING.md,
    padding:        SPACING.xl,
  },
  waitingText: {
    fontSize:  15,
    color:     COLORS.textSecondary,
    textAlign: 'center',
    margin:    0,
  },
  yourName: {
    fontSize:  14,
    color:     COLORS.textMuted,
    textAlign: 'center',
    margin:    0,
  },
};
