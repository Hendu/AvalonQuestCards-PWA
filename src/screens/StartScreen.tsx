// =============================================================================
// StartScreen.tsx
//
// First screen. Player enters their name, then chooses:
//   - Local Game (all voting on one device, classic mode)
//   - Host Network Game (create a room, get a code)
//   - Join Network Game (enter a code)
// =============================================================================

import React, { useState } from 'react';
import { COLORS, SPACING } from '../utils/theme';

type StartMode = 'choose' | 'local-setup' | 'host-setup' | 'join';

interface StartScreenProps {
  onStartLocal:      (totalPlayers: number) => void;
  onHostNetwork:     (name: string, totalPlayers: number) => void;
  onJoinNetwork:     (name: string, roomCode: string) => void;
  isLoading:         boolean;
  errorMessage:      string | null;
  disconnectMessage: string | null;
}

const PLAYER_OPTIONS = [5, 6, 7, 8, 9, 10];

export default function StartScreen(props: StartScreenProps) {
  const { onStartLocal, onHostNetwork, onJoinNetwork, isLoading, errorMessage, disconnectMessage } = props;

  const [mode,            setMode]           = useState<StartMode>('choose');
  const [playerName,      setPlayerName]      = useState('');
  const [selectedPlayers, setSelectedPlayers] = useState(5);
  const [roomCodeInput,   setRoomCodeInput]   = useState('');
  const [nameError,       setNameError]       = useState('');

  function validateName(): boolean {
    if (playerName.trim().length < 1) {
      setNameError('Please enter your name');
      return false;
    }
    setNameError('');
    return true;
  }

  function handleLocalStart() {
    onStartLocal(selectedPlayers);
  }

  function handleHostStart() {
    if (!validateName()) return;
    onHostNetwork(playerName.trim(), selectedPlayers);
  }

  function handleJoinSubmit() {
    if (!validateName()) return;
    if (roomCodeInput.trim().length === 6) {
      onJoinNetwork(playerName.trim(), roomCodeInput.trim());
    }
  }

  // Name input -- shared between host and join flows
  const nameInput = (
    <div style={styles.inputGroup}>
      <p style={styles.sectionLabel}>YOUR NAME</p>
      <input
        style={{ ...styles.textInput, ...(nameError ? styles.inputError : {}) }}
        type="text"
        placeholder="Enter your name"
        maxLength={20}
        value={playerName}
        onChange={function(e) { setPlayerName(e.target.value); setNameError(''); }}
        autoComplete="off"
      />
      {nameError && <p style={styles.errorText}>{nameError}</p>}
    </div>
  );

  return (
    <div style={styles.screen}>

      {/* Title */}
      <div style={styles.titleSection}>
        <h1 style={styles.title}>AVALON</h1>
        <p style={styles.subtitle}>Quest Cards</p>
        <div style={styles.titleDivider} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* CHOOSE MODE                                                         */}
      {/* ------------------------------------------------------------------ */}
      {mode === 'choose' && (
        <div style={styles.content}>
          {disconnectMessage && (
            <div style={styles.disconnectBanner}>
              <p style={styles.disconnectText}>⚠️ {disconnectMessage}</p>
            </div>
          )}
          <button style={styles.primaryButton} onClick={function() { setMode('local-setup'); }}>
            LOCAL GAME
          </button>
          <p style={styles.orText}>or</p>
          <button style={styles.secondaryButton} onClick={function() { setMode('host-setup'); }}>
            HOST NETWORK GAME
          </button>
          <button style={styles.secondaryButton} onClick={function() { setMode('join'); }}>
            JOIN NETWORK GAME
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* LOCAL SETUP                                                         */}
      {/* ------------------------------------------------------------------ */}
      {mode === 'local-setup' && (
        <div style={styles.content}>
          <p style={styles.sectionLabel}>NUMBER OF PLAYERS</p>
          <PlayerPicker selected={selectedPlayers} onSelect={setSelectedPlayers} />

          <button style={styles.primaryButton} onClick={handleLocalStart}>
            BEGIN QUEST
          </button>
          <button style={styles.backButton} onClick={function() { setMode('choose'); }}>
            ← BACK
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* HOST SETUP                                                          */}
      {/* ------------------------------------------------------------------ */}
      {mode === 'host-setup' && (
        <div style={styles.content}>
          {nameInput}

          <p style={styles.sectionLabel}>NUMBER OF PLAYERS</p>
          <PlayerPicker selected={selectedPlayers} onSelect={setSelectedPlayers} />

          <button
            style={{ ...styles.primaryButton, ...(isLoading ? styles.buttonDisabled : {}) }}
            onClick={handleHostStart}
            disabled={isLoading}
          >
            {isLoading ? 'CREATING ROOM...' : 'CREATE ROOM'}
          </button>
          <button style={styles.backButton} onClick={function() { setMode('choose'); setNameError(''); }}>
            ← BACK
          </button>
          {errorMessage && <p style={styles.errorText}>{errorMessage}</p>}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* JOIN                                                                */}
      {/* ------------------------------------------------------------------ */}
      {mode === 'join' && (
        <div style={styles.content}>
          {nameInput}

          <div style={styles.inputGroup}>
            <p style={styles.sectionLabel}>ROOM CODE</p>
            <input
              style={styles.codeInput}
              type="text"
              maxLength={6}
              placeholder="XXXXXX"
              value={roomCodeInput}
              onChange={function(e) { setRoomCodeInput(e.target.value.toUpperCase()); }}
              autoCapitalize="characters"
              autoCorrect="off"
            />
          </div>

          <button
            style={{
              ...styles.primaryButton,
              ...(roomCodeInput.trim().length !== 6 || isLoading ? styles.buttonDisabled : {}),
            }}
            onClick={handleJoinSubmit}
            disabled={roomCodeInput.trim().length !== 6 || isLoading}
          >
            {isLoading ? 'JOINING...' : 'JOIN GAME'}
          </button>
          <button style={styles.backButton} onClick={function() { setMode('choose'); setRoomCodeInput(''); setNameError(''); }}>
            ← BACK
          </button>
          {errorMessage && <p style={styles.errorText}>{errorMessage}</p>}
        </div>
      )}

      <p style={styles.footerText}>© 2013–2026 Ryan Henderson · v3.5</p>
    </div>
  );
}

// Small reusable player count picker component
function PlayerPicker(props: { selected: number; onSelect: (n: number) => void }) {
  return (
    <div style={pickerStyles.row}>
      {PLAYER_OPTIONS.map(function(count) {
        const isSelected = count === props.selected;
        return (
          <button
            key={count}
            style={{ ...pickerStyles.button, ...(isSelected ? pickerStyles.buttonSelected : {}) }}
            onClick={function() { props.onSelect(count); }}
          >
            <span style={{ ...pickerStyles.text, ...(isSelected ? pickerStyles.textSelected : {}) }}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const pickerStyles: Record<string, React.CSSProperties> = {
  row: {
    display:        'flex',
    flexDirection:  'row',
    flexWrap:       'wrap',
    justifyContent: 'center',
    gap:            8,
  },
  button: {
    width:           56,
    height:          56,
    borderRadius:    12,
    border:          `1px solid ${COLORS.border}`,
    backgroundColor: 'rgba(22, 24, 38, 0.85)',
    cursor:          'pointer',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
  },
  buttonSelected: {
    border:          `1px solid ${COLORS.gold}`,
    backgroundColor: 'rgba(30, 33, 54, 0.95)',
  },
  text: {
    fontSize:   20,
    fontWeight: '600',
    color:      COLORS.textMuted,
  },
  textSelected: {
    color: COLORS.gold,
  },
};

const styles: Record<string, React.CSSProperties> = {
  screen: {
    width:              '100%',
    height:             '100%',
    backgroundImage:    'url(/assets/images/normal_background.png)',
    backgroundSize:     'cover',
    backgroundPosition: 'center',
    display:            'flex',
    flexDirection:      'column',
    alignItems:         'center',
    justifyContent:     'flex-end',
    padding:            SPACING.xl,
    paddingBottom:      SPACING.xxl,
    gap:                SPACING.lg,
  },
  titleSection: {
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    gap:           4,
  },
  title: {
    fontSize:      44,
    fontWeight:    '800',
    color:         COLORS.gold,
    letterSpacing: '8px',
    textShadow:    '0 2px 8px rgba(0,0,0,0.9)',
    margin:        0,
  },
  subtitle: {
    fontSize:      16,
    color:         COLORS.textSecondary,
    letterSpacing: '4px',
    textTransform: 'uppercase',
    textShadow:    '0 1px 6px rgba(0,0,0,0.9)',
    margin:        0,
  },
  titleDivider: {
    width:           60,
    height:          1,
    backgroundColor: COLORS.borderGold,
    marginTop:       SPACING.sm,
  },
  content: {
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    width:         '100%',
    gap:           SPACING.md,
  },
  inputGroup: {
    width:         '100%',
    display:       'flex',
    flexDirection: 'column',
    gap:           6,
  },
  sectionLabel: {
    fontSize:      11,
    color:         COLORS.textMuted,
    letterSpacing: '3px',
    textTransform: 'uppercase',
    margin:        0,
    textAlign:     'center',
  },
  textInput: {
    width:           '100%',
    padding:         `${SPACING.sm}px ${SPACING.md}px`,
    backgroundColor: 'rgba(22, 24, 38, 0.9)',
    border:          `1px solid ${COLORS.border}`,
    borderRadius:    12,
    fontSize:        18,
    color:           COLORS.textPrimary,
    outline:         'none',
  },
  inputError: {
    borderColor: COLORS.evil,
  },
  codeInput: {
    width:           '100%',
    padding:         `${SPACING.md}px`,
    backgroundColor: 'rgba(22, 24, 38, 0.9)',
    border:          `1px solid ${COLORS.border}`,
    borderRadius:    12,
    fontSize:        28,
    fontWeight:      '700',
    color:           COLORS.gold,
    textAlign:       'center',
    letterSpacing:   '8px',
    outline:         'none',
  },
  primaryButton: {
    width:           '100%',
    padding:         `${SPACING.md}px`,
    backgroundColor: COLORS.gold,
    border:          'none',
    borderRadius:    20,
    fontSize:        16,
    fontWeight:      '800',
    color:           COLORS.bgDark,
    letterSpacing:   '4px',
    textTransform:   'uppercase',
    cursor:          'pointer',
  },
  secondaryButton: {
    width:           '100%',
    padding:         `${SPACING.md}px`,
    backgroundColor: 'rgba(22, 24, 38, 0.85)',
    border:          `1px solid ${COLORS.border}`,
    borderRadius:    20,
    fontSize:        14,
    fontWeight:      '700',
    color:           COLORS.textSecondary,
    letterSpacing:   '2px',
    textTransform:   'uppercase',
    cursor:          'pointer',
  },
  backButton: {
    background:    'none',
    border:        'none',
    color:         COLORS.textMuted,
    fontSize:      13,
    letterSpacing: '1px',
    cursor:        'pointer',
    padding:       '4px 8px',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor:  'default',
  },
  orText: {
    color:    COLORS.textMuted,
    fontSize: 13,
    margin:   0,
  },
  errorText: {
    color:     COLORS.evil,
    fontSize:  13,
    textAlign: 'center',
    margin:    0,
  },
  footerText: {
    fontSize:      13,
    color:         COLORS.textSecondary,
    letterSpacing: '1px',
    margin:        0,
  },
  disconnectBanner: {
    width:           '100%',
    padding:         '10px 16px',
    backgroundColor: 'rgba(42, 13, 13, 0.9)',
    borderRadius:    12,
    border:          '1px solid #7A2A2A',
  },
  disconnectText: {
    fontSize:   13,
    color:      '#EDE8D8',
    textAlign:  'center',
    margin:     0,
    lineHeight: '1.5',
  },
};
