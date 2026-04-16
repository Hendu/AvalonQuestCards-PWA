// =============================================================================
// CharacterBadge.tsx
//
// "Who am I?" button — tapping dims the screen and shows character + vision.
// Backdrop and modal are rendered via a fixed-position portal div injected
// directly into document.body so they escape any parent stacking context.
// =============================================================================

import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
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
  const [open, setOpen]   = useState(false);
  const [rect,  setRect]  = useState<DOMRect | null>(null);
  const btnRef            = useRef<HTMLButtonElement>(null);

  const canOpen = !!(players && characters && myDeviceId);

  const vision = canOpen
    ? getCharacterVision(character, myDeviceId!, characters!)
        .sort(function(a, b) { return a.deviceId.localeCompare(b.deviceId); })
    : [];

  function handleOpen() {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(true);
  }

  // Recalculate on resize/scroll while open
  useEffect(function() {
    if (!open || !btnRef.current) return;
    function update() {
      if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    }
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return function() {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  const modalTop  = rect ? rect.bottom + 8 : 60;
  const modalRight = rect ? window.innerWidth - rect.right : 12;

  const portal = open && canOpen && rect ? ReactDOM.createPortal(
    <>
      {/* Dim backdrop — true document root, escapes all stacking contexts */}
      <div
        style={{
          position:        'fixed',
          inset:           0,
          zIndex:          9998,
          backgroundColor: 'rgba(0,0,0,0.55)',
        }}
        onClick={function() { setOpen(false); }}
      />
      {/* Modal anchored to button position */}
      <div
        style={{
          position:        'fixed',
          top:             modalTop,
          right:           modalRight,
          zIndex:          9999,
          backgroundColor: 'rgba(13,15,26,0.99)',
          border:          `1px solid ${COLORS.border}`,
          borderRadius:    12,
          minWidth:        220,
          overflow:        'hidden',
          boxShadow:       '0 8px 24px rgba(0,0,0,0.6)',
        }}
        onClick={function(e) { e.stopPropagation(); }}
      >
        <div style={{ padding: `${SPACING.md}px ${SPACING.md}px ${SPACING.sm}px`, textAlign: 'center' }}>
          <span style={{ fontSize: 18, fontWeight: '800', color: COLORS.gold, letterSpacing: '1px' }}>
            {character}
          </span>
        </div>

        <div style={{ height: 1, backgroundColor: COLORS.border, margin: `0 ${SPACING.md}px` }} />

        <p style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted, letterSpacing: '2px', margin: `${SPACING.sm}px ${SPACING.md}px 4px` }}>
          YOU CAN SEE
        </p>

        {vision.length === 0 ? (
          <p style={{ fontSize: 13, color: COLORS.textMuted, fontStyle: 'italic', textAlign: 'center', padding: `${SPACING.sm}px ${SPACING.md}px`, margin: 0 }}>
            Nobody — trust no one.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: `4px ${SPACING.sm}px` }}>
            {vision.map(function(entry) {
              return (
                <div key={entry.deviceId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `6px ${SPACING.sm}px`, backgroundColor: 'rgba(42,45,69,0.4)', borderRadius: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: '600', color: COLORS.textPrimary }}>{getPlayerName(players!, entry.deviceId)}</span>
                  <span style={{ fontSize: 12, color: COLORS.textSecondary, fontStyle: 'italic' }}>{entry.label}</span>
                </div>
              );
            })}
          </div>
        )}

        <button
          style={{ width: '100%', padding: `${SPACING.sm}px`, background: 'none', border: 'none', borderTop: `1px solid ${COLORS.border}`, color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: '2px', cursor: 'pointer', marginTop: SPACING.sm }}
          onClick={function() { setOpen(false); }}
        >
          CLOSE
        </button>
      </div>
    </>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        style={{
          display:         'flex',
          alignItems:      'center',
          padding:         '4px 10px',
          borderRadius:    20,
          border:          '1px solid rgba(201,169,110,0.6)',
          backgroundColor: 'rgba(201,169,110,0.15)',
          cursor:          canOpen ? 'pointer' : 'default',
          // When open, lift above the portal backdrop
          position:        open ? 'relative' : undefined,
          zIndex:          open ? 9999 : undefined,
        }}
        onClick={canOpen ? handleOpen : undefined}
        disabled={!canOpen}
      >
        <span style={{ fontSize: 11, fontWeight: '700', letterSpacing: '0.5px', color: COLORS.gold }}>
          Who am I?
        </span>
      </button>
      {portal}
    </>
  );
}
