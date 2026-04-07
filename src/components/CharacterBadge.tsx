// =============================================================================
// CharacterBadge.tsx
//
// Small persistent indicator shown in the top-right of every game screen
// (after role reveal) so players don't forget their character.
//
// Intentionally neutral -- no colors or emojis that could reveal alignment
// to someone glancing at another player's screen.
// =============================================================================

import React from 'react';
import { CharacterName } from '../utils/gameLogic';
import { COLORS } from '../utils/theme';

interface CharacterBadgeProps {
  character: CharacterName;
}

// Short display name -- brief enough to fit in the top bar
const CHARACTER_SHORT: Record<CharacterName, string> = {
  'Merlin':                   'Merlin',
  'Percival':                 'Percival',
  'Loyal Servant of Arthur':  'Servant',
  'Assassin':                 'Assassin',
  'Morgana':                  'Morgana',
  'Mordred':                  'Mordred',
  'Oberon':                   'Oberon',
  'Minion of Mordred':        'Minion',
};

export default function CharacterBadge({ character }: CharacterBadgeProps) {
  return (
    <div style={styles.badge}>
      <span style={styles.name}>{CHARACTER_SHORT[character]}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  badge: {
    display:         'flex',
    alignItems:      'center',
    padding:         '3px 10px',
    borderRadius:    20,
    border:          `1px solid ${COLORS.border}`,
    backgroundColor: 'rgba(22,24,38,0.9)',
  },
  name: {
    fontSize:      12,
    fontWeight:    '700',
    letterSpacing: '1px',
    color:         COLORS.textSecondary,
  },
};
