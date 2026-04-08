// =============================================================================
// QuitButton.tsx
//
// Replaces the ↺ reset button on all gameplay screens.
// Shows an X, tapping opens a confirm modal before quitting.
//
// On confirm:
//   - Host: deletes the room entirely (same as before)
//   - Guest mid-game: immediately writes disconnectedPlayer with just their name
//     ("Ryan quit the game" -- no "or disconnected" caveat)
// =============================================================================

import React, { useState } from 'react';
import { COLORS, SPACING } from '../utils/theme';

interface QuitButtonProps {
  onConfirm: () => void;
  isHost:    boolean;
}

export default function QuitButton({ onConfirm, isHost }: QuitButtonProps) {
  const [showing, setShowing] = useState(false);

  return (
    <>
      <button style={styles.iconButton} onClick={function() { setShowing(true); }}>
        ✕
      </button>

      {showing && (
        <div style={styles.overlay} onClick={function() { setShowing(false); }}>
          <div style={styles.modal} onClick={function(e) { e.stopPropagation(); }}>
            <p style={styles.title}>ARE YOU SURE?</p>
            <p style={styles.subtitle}>
              {isHost
                ? 'Leaving will end the game for everyone.'
                : 'Leaving will end the game for everyone.'}
            </p>
            <div style={styles.buttons}>
              <button
                style={{ ...styles.btn, ...styles.btnYes }}
                onClick={function() { setShowing(false); onConfirm(); }}
              >
                YES, LEAVE
              </button>
              <button
                style={{ ...styles.btn, ...styles.btnNo }}
                onClick={function() { setShowing(false); }}
              >
                NO, STAY
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  iconButton: {
    background: 'none', border: 'none', fontSize: 20,
    cursor: 'pointer', color: COLORS.textPrimary, padding: '4px 8px',
  },
  overlay: {
    position: 'fixed', inset: 0, zIndex: 200,
    backgroundColor: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: SPACING.md,
  },
  modal: {
    width: '100%', maxWidth: 320,
    backgroundColor: 'rgba(22,24,38,0.98)',
    border: `1px solid ${COLORS.border}`,
    borderRadius: 20, padding: SPACING.lg,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACING.md,
  },
  title: {
    fontSize: 20, fontWeight: '800', color: COLORS.textPrimary,
    letterSpacing: '2px', margin: 0, textAlign: 'center',
  },
  subtitle: {
    fontSize: 14, color: COLORS.textSecondary,
    textAlign: 'center', lineHeight: '1.5', margin: 0,
  },
  buttons: { display: 'flex', gap: SPACING.sm, width: '100%' },
  btn: {
    flex: 1, padding: `${SPACING.sm}px`,
    borderRadius: 12, fontSize: 13, fontWeight: '800',
    letterSpacing: '1px', cursor: 'pointer', border: 'none',
  },
  btnYes: { backgroundColor: COLORS.evil, color: '#fff' },
  btnNo:  { backgroundColor: 'rgba(42,45,69,0.8)', color: COLORS.textSecondary },
};
