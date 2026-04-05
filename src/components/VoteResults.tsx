// =============================================================================
// VoteResults.tsx
//
// Shows vote progress (backs/blanks) during voting,
// revealed cards + tally after all votes are in.
// =============================================================================

import React from 'react';
import { VoteResult } from '../utils/gameLogic';
import { COLORS } from '../utils/theme';

interface VoteResultsProps {
  votes:        VoteResult[];
  totalSlots:   number;
  isRevealed:   boolean;
  failCount?:    number;
  successCount?: number;
}

export default function VoteResults(props: VoteResultsProps) {
  const { votes, totalSlots, isRevealed, failCount, successCount } = props;

  const slots = [];
  for (let i = 0; i < totalSlots; i++) {
    slots.push({ index: i, vote: votes[i], hasVote: votes[i] !== undefined });
  }

  return (
    <div style={styles.container}>
      <div style={styles.cardRow}>
        {slots.map(function(slot) {
          let src: string;
          if (!slot.hasVote)          src = '/assets/images/blank.png';
          else if (!isRevealed)       src = '/assets/images/back.png';
          else if (slot.vote === 'success') src = '/assets/images/success.png';
          else                        src = '/assets/images/fail.png';

          return (
            <img
              key={slot.index}
              src={src}
              alt={slot.vote || 'empty'}
              style={styles.smallCard}
            />
          );
        })}
      </div>

      {isRevealed && successCount !== undefined && failCount !== undefined && (
        <div style={styles.tallyRow}>
          <span style={styles.tallySuccess}>✓ {successCount} Success</span>
          <span style={styles.tallySep}> · </span>
          <span style={styles.tallyFail}>✗ {failCount} Fail</span>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            8,
  },
  cardRow: {
    display:        'flex',
    flexDirection:  'row',
    flexWrap:       'wrap',
    justifyContent: 'center',
    gap:            4,
  },
  smallCard: {
    width:  44,
    height: 62,
  },
  tallyRow: {
    display:    'flex',
    alignItems: 'center',
  },
  tallySuccess: {
    fontSize:   14,
    color:      COLORS.good,
    fontWeight: '600',
  },
  tallySep: {
    fontSize: 14,
    color:    COLORS.textMuted,
  },
  tallyFail: {
    fontSize:   14,
    color:      COLORS.evil,
    fontWeight: '600',
  },
};
