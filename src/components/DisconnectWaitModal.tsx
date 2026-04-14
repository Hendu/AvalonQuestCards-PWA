// =============================================================================
// DisconnectWaitModal.tsx  (v3.9)
//
// Shown to ALL players while pendingDisconnect is set (game frozen).
//
// HOST sees:
//   - "[Name] disconnected. Waiting for them to reconnect..."
//   - A countdown timer (starts at 30s)
//   - "Wait Longer" button (resets the 30s timer, ad infinitum)
//   - "End Game" button (calls hostEndGameAfterDisconnect, kicks everyone)
//
// GUESTS see:
//   - "[Name] disconnected. Host is waiting for them to reconnect."
//   - "Leave Game" button (calls quitGame, takes just them to start screen)
//
// The modal covers the entire screen (position: fixed, zIndex high).
// It is rendered at the App.tsx level so it appears on top of any screen.
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { PendingDisconnect } from '../utils/firebaseGame';
import { COLORS, SPACING, WAITING_PULSE_STYLE } from '../utils/theme';

const WAIT_SECONDS = 30;

interface DisconnectWaitModalProps {
  pendingDisconnect:        PendingDisconnect;
  isHost:                   boolean;
  disconnectedPlayerIsHost: boolean;   // true when it's the HOST who dropped
  onHostEndGame:            () => void;
  onGuestLeave:             () => void;
}

export default function DisconnectWaitModal(props: DisconnectWaitModalProps) {
  const { pendingDisconnect, isHost, disconnectedPlayerIsHost, onHostEndGame, onGuestLeave } = props;

  // Countdown timer state. Counts down from WAIT_SECONDS.
  const [countdown, setCountdown] = useState(WAIT_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // "Deciders" are whoever is still connected and needs to choose wait/end.
  // Normal case: host decides (a guest dropped).
  // Host-dropped case: all guests are deciders (any one of them can end the game).
  const iAmDecider = isHost || disconnectedPlayerIsHost;

  useEffect(function() {
    if (!iAmDecider) return;
    setCountdown(WAIT_SECONDS);
    intervalRef.current = setInterval(function() {
      setCountdown(function(prev) { return prev <= 1 ? 0 : prev - 1; });
    }, 1000);
    return function() {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [iAmDecider, pendingDisconnect.deviceId]);

  function handleWaitLonger() {
    setCountdown(WAIT_SECONDS);
  }

  const timerExpired = iAmDecider && countdown === 0;

  // Subtitle varies by who dropped and who's reading it
  function getSubtitle(): string {
    if (disconnectedPlayerIsHost) {
      return 'The host disconnected. Waiting for them to reconnect...';
    }
    if (isHost) {
      return 'disconnected. Waiting for them to reconnect...';
    }
    return 'disconnected. The host is waiting for them to reconnect.';
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>

        <div style={styles.iconWrapper}>
          <span style={styles.icon}>📡</span>
        </div>

        <p style={styles.title}>CONNECTION LOST</p>

        {/* Show player name inline only when it's a guest who dropped */}
        {!disconnectedPlayerIsHost && (
          <p style={styles.playerName}>{pendingDisconnect.name}</p>
        )}
        <p style={{ ...styles.subtitle, ...WAITING_PULSE_STYLE }}>{getSubtitle()}</p>

        {/* Countdown + Wait Longer / End Game -- shown to all deciders */}
        {iAmDecider && (
          <>
            <div style={styles.countdownWrapper}>
              {countdown > 0 ? (
                <>
                  <span style={styles.countdownNumber}>{countdown}</span>
                  <span style={styles.countdownLabel}>seconds</span>
                </>
              ) : (
                <span style={styles.countdownExpired}>Choose an option below</span>
              )}
            </div>

            <div style={styles.buttonRow}>
              <button
                style={{ ...styles.btn, ...styles.btnWait }}
                onClick={handleWaitLonger}
              >
                ⏱ WAIT LONGER
              </button>
              <button
                style={{ ...styles.btn, ...styles.btnEnd }}
                onClick={onHostEndGame}
              >
                END GAME
              </button>
            </div>

            <p style={styles.hostHint}>
              If they rejoin, the game will automatically resume for everyone.
            </p>
          </>
        )}

        {/* Non-decider guests just get a Leave option */}
        {!iAmDecider && (
          <>
            <p style={styles.guestHint}>
              Your game is paused. You'll resume automatically if they reconnect.
            </p>
            <button
              style={{ ...styles.btn, ...styles.btnLeave }}
              onClick={onGuestLeave}
            >
              LEAVE GAME
            </button>
          </>
        )}

      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position:        'fixed',
    inset:           0,
    zIndex:          500,                    // above everything
    backgroundColor: 'rgba(0,0,0,0.88)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         SPACING.md,
  },
  modal: {
    width:           '100%',
    maxWidth:        360,
    backgroundColor: 'rgba(22,24,38,0.98)',
    border:          `1px solid ${COLORS.border}`,
    borderRadius:    24,
    padding:         SPACING.xl,
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    gap:             SPACING.md,
  },
  iconWrapper: {
    width:           72,
    height:          72,
    borderRadius:    36,
    backgroundColor: 'rgba(42,45,69,0.6)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
  },
  icon: {
    fontSize: 36,
  },
  title: {
    fontSize:      13,
    fontWeight:    '800',
    color:         COLORS.textMuted,
    letterSpacing: '4px',
    margin:        0,
    textAlign:     'center',
  },
  playerName: {
    fontSize:   26,
    fontWeight: '800',
    color:      COLORS.textPrimary,
    margin:     0,
    textAlign:  'center',
  },
  subtitle: {
    fontSize:   14,
    color:      COLORS.textSecondary,
    textAlign:  'center',
    lineHeight: '1.5',
    margin:     0,
  },
  countdownWrapper: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            4,
    padding:        `${SPACING.sm}px ${SPACING.lg}px`,
    backgroundColor: 'rgba(13,15,26,0.6)',
    borderRadius:   12,
    border:         `1px solid ${COLORS.border}`,
    minWidth:       100,
    minHeight:      64,
    justifyContent: 'center',
  },
  countdownNumber: {
    fontSize:   40,
    fontWeight: '800',
    color:      COLORS.gold,
    lineHeight: 1,
  },
  countdownLabel: {
    fontSize:      11,
    color:         COLORS.textMuted,
    letterSpacing: '2px',
  },
  countdownExpired: {
    fontSize:   13,
    color:      COLORS.textSecondary,
    textAlign:  'center',
    lineHeight: '1.4',
  },
  buttonRow: {
    display: 'flex',
    gap:     SPACING.sm,
    width:   '100%',
  },
  btn: {
    flex:          1,
    padding:       `${SPACING.sm}px ${SPACING.md}px`,
    borderRadius:  14,
    fontSize:      13,
    fontWeight:    '800',
    letterSpacing: '1px',
    cursor:        'pointer',
    border:        'none',
    textAlign:     'center',
  },
  btnWait: {
    backgroundColor: COLORS.gold,
    color:           COLORS.bgDark,
  },
  btnEnd: {
    backgroundColor: COLORS.evil,
    color:           '#fff',
  },
  btnLeave: {
    backgroundColor: 'rgba(42,45,69,0.8)',
    color:           COLORS.textSecondary,
  },
  hostHint: {
    fontSize:   12,
    color:      COLORS.textMuted,
    textAlign:  'center',
    lineHeight: '1.5',
    margin:     0,
    fontStyle:  'italic',
  },
  guestHint: {
    fontSize:   13,
    color:      COLORS.textSecondary,
    textAlign:  'center',
    lineHeight: '1.5',
    margin:     0,
  },
};
