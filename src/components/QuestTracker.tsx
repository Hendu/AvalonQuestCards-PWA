// =============================================================================
// QuestTracker.tsx
//
// The 5 circular quest slots at the top of the game board.
// Same logic as RN version, CSS instead of StyleSheet.
// =============================================================================

import React from 'react';
import { QuestOutcome, FAILS_REQUIRED } from '../utils/gameLogic';
import { COLORS } from '../utils/theme';

interface QuestTrackerProps {
  totalPlayers: number;
  currentQuest: number;
  questOutcomes: QuestOutcome[];
}

const SLOT_SIZE = 62;

export default function QuestTracker(props: QuestTrackerProps) {
  const { totalPlayers, currentQuest, questOutcomes } = props;

  return (
    <div style={styles.trackerRow}>
      {[1, 2, 3, 4, 5].map(function(questNumber) {
        const outcome          = questOutcomes[questNumber - 1];
        const isActive         = (questNumber === currentQuest);
        const isCompleted      = (outcome !== null);
        const requiresTwoFails = (FAILS_REQUIRED[totalPlayers][questNumber] === 2);

        const slotStyle: React.CSSProperties = {
          ...styles.questSlot,
          ...(isActive         ? styles.questSlotActive : {}),
          ...(outcome === 'good' ? styles.questSlotGood   : {}),
          ...(outcome === 'evil' ? styles.questSlotEvil   : {}),
        };

        return (
          <div key={questNumber} style={slotStyle}>

            {outcome === 'good' && (
              <img src="/assets/images/G.png" alt="Good" style={styles.outcomeIcon} />
            )}

            {outcome === 'evil' && (
              <img src="/assets/images/E.png" alt="Evil" style={styles.outcomeIcon} />
            )}

            {!isCompleted && (
              <span style={{
                ...styles.questNumeral,
                ...(isActive ? styles.questNumeralActive : styles.questNumeralDim),
              }}>
                {questNumber}
              </span>
            )}

            {requiresTwoFails && !isCompleted && (
              <span style={styles.twoFailBadge}>2✗</span>
            )}

          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  trackerRow: {
    display:        'flex',
    flexDirection:  'row',
    justifyContent: 'center',
    gap:            8,
    padding:        '0 16px',
  },
  questSlot: {
    width:           SLOT_SIZE,
    height:          SLOT_SIZE,
    borderRadius:    SLOT_SIZE / 2,
    border:          `1px solid ${COLORS.border}`,
    backgroundColor: 'rgba(22, 24, 38, 0.75)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    position:        'relative',
    flexShrink:      0,
  },
  questSlotActive: {
    border:          `2px solid ${COLORS.gold}`,
    backgroundColor: 'rgba(30, 33, 54, 0.85)',
  },
  questSlotGood: {
    border:          `1px solid ${COLORS.goodDim}`,
    backgroundColor: 'rgba(13, 42, 30, 0.85)',
  },
  questSlotEvil: {
    border:          `1px solid ${COLORS.evilDim}`,
    backgroundColor: 'rgba(42, 13, 13, 0.85)',
  },
  questNumeral: {
    fontSize:   26,
    fontWeight: '700',
  },
  questNumeralActive: {
    color: '#FFFFFF',
  },
  questNumeralDim: {
    color: COLORS.textMuted,
  },
  outcomeIcon: {
    width:  '72%',
    height: '72%',
  },
  twoFailBadge: {
    position:  'absolute',
    bottom:    3,
    right:     5,
    fontSize:  11,
    color:     COLORS.evil,
    fontWeight:'700',
  },
};
