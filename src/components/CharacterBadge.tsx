// =============================================================================
// CharacterBadge.tsx
//
// Shows "Who am I?" button in top bar. Tapping opens a modal docked directly
// below the button showing character name and vision list.
// Intentionally replaces the character name display to prevent screen peeks.
// =============================================================================

import React, { useState, useRef } from 'react';
import { CharacterName, getCharacterVision } from '../utils/gameLogic';
import { Player } from '../utils/firebaseGame';
import { COLORS, SPACING } from '../utils/theme';

interface CharacterBadgeProps {
  character:   CharacterName;
  players?:    Player[];
  characters?: Record<string, CharacterName>;
  myDeviceId?: string;
}

function getPlayerName(players: Player[], deviceId: string): string {
  return players.find(function(p) { return p.deviceId === deviceId; })?.name ?? '???';
}

export default function CharacterBadge({ character, players, characters, myDeviceId }: CharacterBadgeProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const canOpen = !!(players && characters && myDeviceId);

  const vision = canOpen
    ? getCharacterVision(character, myDeviceId!, characters!)
        .sort(function(a, b) { return a.deviceId.localeCompare(b.deviceId); })
    : [];

  return (
    <div style={{ position: 'relative', zIndex: 302 }}>
      <button
        ref={btnRef}
        style={styles.badge}
        onClick={canOpen ? function() { setOpen(function(v) { return !v; }); } : undefined}
        disabled={!canOpen}
      >
        <span style={styles.label}>Who am I?</span>
      </button>

      {open && canOpen && (
        <>
          {/* invisible full-screen tap-to-close */}
          <div style={styles.backdrop} onClick={function() { setOpen(false); }} />

          <div style={styles.modal}>
            <div style={styles.characterRow}>
              <span style={styles.characterName}>{character}</span>
            </div>

            <div style={styles.divider} />

            <p style={styles.sectionLabel}>YOU CAN SEE</p>

            {vision.length === 0 ? (
              <p style={styles.nobodyText}>Nobody — trust no one.</p>
            ) : (
              <div style={styles.visionList}>
                {vision.map(function(entry) {
                  return (
                    <div key={entry.deviceId} style={styles.visionRow}>
                      <span style={styles.visionName}>{getPlayerName(players!, entry.deviceId)}</span>
                      <span style={styles.visionLabel}>{entry.label}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <button style={styles.closeBtn} onClick={function() { setOpen(false); }}>
              CLOSE
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  badge: {
    display:         'flex',
    alignItems:      'center',
    padding:         '4px 10px',
    borderRadius:    20,
    border:          '1px solid rgba(201,169,110,0.6)',
    backgroundColor: 'rgba(201,169,110,0.15)',
    cursor:          'pointer',
  },
  label: {
    fontSize:      11,
    fontWeight:    '700',
    letterSpacing: '0.5px',
    color:         COLORS.gold,
  },
  backdrop: {
    position:        'fixed',
    inset:           0,
    zIndex:          299,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modal: {
    position:        'absolute',
    top:             'calc(100% + 8px)',
    right:           0,
    zIndex:          300,
    backgroundColor: 'rgba(13,15,26,0.99)',
    border:          `1px solid ${COLORS.border}`,
    borderRadius:    12,
    minWidth:        220,
    overflow:        'hidden',
    boxShadow:       '0 8px 24px rgba(0,0,0,0.6)',
  },
  characterRow: {
    padding:    `${SPACING.md}px ${SPACING.md}px ${SPACING.sm}px`,
    textAlign:  'center',
  },
  characterName: {
    fontSize:      18,
    fontWeight:    '800',
    color:         COLORS.gold,
    letterSpacing: '1px',
  },
  divider: {
    height:          1,
    backgroundColor: COLORS.border,
    margin:          `0 ${SPACING.md}px`,
  },
  sectionLabel: {
    fontSize:      10,
    fontWeight:    '700',
    color:         COLORS.textMuted,
    letterSpacing: '2px',
    margin:        `${SPACING.sm}px ${SPACING.md}px 4px`,
  },
  visionList: {
    display:       'flex',
    flexDirection: 'column',
    gap:           4,
    padding:       `4px ${SPACING.sm}px`,
  },
  visionRow: {
    display:         'flex',
    justifyContent:  'space-between',
    alignItems:      'center',
    padding:         `6px ${SPACING.sm}px`,
    backgroundColor: 'rgba(42,45,69,0.4)',
    borderRadius:    8,
  },
  visionName: {
    fontSize:   15,
    fontWeight: '600',
    color:      COLORS.textPrimary,
  },
  visionLabel: {
    fontSize:   12,
    color:      COLORS.textSecondary,
    fontStyle:  'italic',
  },
  nobodyText: {
    fontSize:  13,
    color:     COLORS.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    padding:   `${SPACING.sm}px ${SPACING.md}px`,
    margin:    0,
  },
  closeBtn: {
    width:           '100%',
    padding:         `${SPACING.sm}px`,
    background:      'none',
    border:          'none',
    borderTop:       `1px solid ${COLORS.border}`,
    color:           COLORS.textMuted,
    fontSize:        11,
    fontWeight:      '700',
    letterSpacing:   '2px',
    cursor:          'pointer',
    marginTop:       SPACING.sm,
  },
};