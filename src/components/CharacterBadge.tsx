// =============================================================================
// CharacterBadge.tsx
//
// Small persistent indicator shown in the top-right of every game screen
// (after role reveal) so players don't forget their character.
//
// Shows a compact colored badge: "🗡️ Assassin" in evil red, "⚔️ Merlin" in good green, etc.
// =============================================================================

import React from 'react';
import { CharacterName, CHARACTERS } from '../utils/gameLogic';
import { COLORS, SPACING } from '../utils/theme';

interface CharacterBadgeProps {
  character: CharacterName;
}

// Short emoji prefix by character for quick visual identification
const CHARACTER_EMOJI: Record<CharacterName, string> = {
  'Merlin':                   '🔮',
  'Percival':                 '🛡️',
  'Loyal Servant of Arthur':  '⚔️',
  'Assassin':                 '🗡️',
  'Morgana':                  '🌙',
  'Mordred':                  '💀',
  'Oberon':                   '👁️',
  'Minion of Mordred':        '🔱',
};

// Short display name for the badge (keep it brief)
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
  const info       = CHARACTERS[character];
  const isEvil     = info.alignment === 'evil';
  const emoji      = CHARACTER_EMOJI[character];
  const shortName  = CHARACTER_SHORT[character];

  return (
    <div style={{
      ...styles.badge,
      backgroundColor: isEvil ? 'rgba(42,13,13,0.9)' : 'rgba(13,42,30,0.9)',
      borderColor:     isEvil ? COLORS.evilDim : COLORS.goodDim,
    }}>
      <span style={styles.emoji}>{emoji}</span>
      <span style={{
        ...styles.name,
        color: isEvil ? COLORS.evil : COLORS.good,
      }}>
        {shortName}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  badge: {
    display:       'flex',
    alignItems:    'center',
    gap:           4,
    padding:       '3px 8px',
    borderRadius:  20,
    border:        '1px solid',
  },
  emoji: {
    fontSize: 12,
  },
  name: {
    fontSize:  12,
    fontWeight:    '700',
    letterSpacing: '1px',
  },
};
