// =============================================================================
// StartScreen.tsx
//
// Entry screen. Name input + mode selection.
//
// v3.7 UX improvements:
//   - Forms used for host/join flows so mobile keyboard Go/Next buttons work
//   - autoFocus on name field
//   - Enter/Go on name advances to room code (join) or submits (host)
//   - 6-box segmented code entry with auto-advance and paste support
// =============================================================================

import React, { useState, useRef, useEffect } from 'react';
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

const PLAYER_OPTIONS   = [5, 6, 7, 8, 9, 10];
const PLAYER_NAME_KEY  = 'avalon_player_name';

function getSavedName(): string {
  try { return localStorage.getItem(PLAYER_NAME_KEY) || ''; } catch { return ''; }
}

function saveName(name: string): void {
  try { localStorage.setItem(PLAYER_NAME_KEY, name); } catch {}
}
const CODE_LENGTH    = 6;
// Valid characters for room codes (matches generateRoomCode in gameLogic)
const VALID_CHARS    = 'ACDEFGHJKMNPQRTUWXZ234679';

export default function StartScreen(props: StartScreenProps) {
  const { onStartLocal, onHostNetwork, onJoinNetwork, isLoading, errorMessage, disconnectMessage } = props;

  const [mode,            setMode]           = useState<StartMode>('choose');
  const [playerName,      setPlayerName]      = useState(getSavedName);
  const [selectedPlayers, setSelectedPlayers] = useState(5);
  const [nameError,       setNameError]       = useState('');

  // 6-box code entry: array of single chars
  const [codeBoxes,   setCodeBoxes]   = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [focusedBox,   setFocusedBox]   = useState<number | null>(null);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);
  const nameRef  = useRef<HTMLInputElement>(null);

  // Derived: full room code from boxes
  const roomCode = codeBoxes.join('');
  const codeComplete = roomCode.length === CODE_LENGTH;

  // Focus name field when switching to a mode that needs it
  useEffect(function() {
    if (mode === 'host-setup' || mode === 'join') {
      setTimeout(function() { nameRef.current?.focus(); }, 50);
    }
  }, [mode]);

  function validateName(): boolean {
    if (playerName.trim().length < 1) {
      setNameError('Please enter your name');
      nameRef.current?.focus();
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
    saveName(playerName.trim());
    onHostNetwork(playerName.trim(), selectedPlayers);
  }

  function handleJoinSubmit() {
    if (!validateName()) return;
    if (codeComplete) {
      saveName(playerName.trim());
      onJoinNetwork(playerName.trim(), roomCode);
    }
  }

  function resetJoin() {
    setCodeBoxes(Array(CODE_LENGTH).fill(''));
    setNameError('');
    setMode('choose');
  }

  // ---------------------------------------------------------------------------
  // 6-box code entry handlers
  // ---------------------------------------------------------------------------
  function handleCodeBoxChange(index: number, value: string) {
    // Only allow valid code characters
    const filtered = value.toUpperCase().split('').filter(function(c) {
      return VALID_CHARS.includes(c);
    });
    if (filtered.length === 0) return;

    // Take last character typed (handles auto-correct inserting multiple)
    const char = filtered[filtered.length - 1];
    const newBoxes = [...codeBoxes];
    newBoxes[index] = char;
    setCodeBoxes(newBoxes);

    // Auto-advance to next box
    if (index < CODE_LENGTH - 1) {
      codeRefs.current[index + 1]?.focus();
    }
  }

  function handleCodeBoxKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      const newBoxes = [...codeBoxes];
      if (codeBoxes[index] !== '') {
        // Clear current box
        newBoxes[index] = '';
        setCodeBoxes(newBoxes);
      } else if (index > 0) {
        // Move back and clear previous
        newBoxes[index - 1] = '';
        setCodeBoxes(newBoxes);
        codeRefs.current[index - 1]?.focus();
      }
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter' && codeComplete) {
      handleJoinSubmit();
    }
  }

  function handleCodeBoxPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').toUpperCase().split('').filter(function(c) {
      return VALID_CHARS.includes(c);
    }).slice(0, CODE_LENGTH);
    if (pasted.length === 0) return;
    const newBoxes = Array(CODE_LENGTH).fill('');
    pasted.forEach(function(char, i) { newBoxes[i] = char; });
    setCodeBoxes(newBoxes);
    // Focus last filled box or last box
    const lastIdx = Math.min(pasted.length - 1, CODE_LENGTH - 1);
    codeRefs.current[lastIdx]?.focus();
  }

  // ---------------------------------------------------------------------------
  // Shared name input
  // ---------------------------------------------------------------------------
  const nameInput = (
    <div style={styles.inputGroup}>
      <p style={styles.sectionLabel}>YOUR NAME</p>
      <input
        ref={nameRef}
        style={{ ...styles.textInput, ...(nameError ? styles.inputError : {}) }}
        type="text"
        placeholder="Enter your name"
        maxLength={20}
        value={playerName}
        onChange={function(e) { setPlayerName(e.target.value); setNameError(''); }}
        autoComplete="off"
        autoCorrect="off"
        enterKeyHint={mode === 'join' ? 'next' : 'go'}
        onKeyDown={function(e) {
          if (e.key === 'Enter' && mode === 'join') {
            e.preventDefault();
            codeRefs.current[0]?.focus();
          }
        }}
      />
      {nameError && <p style={styles.errorText}>{nameError}</p>}
    </div>
  );

  return (
    <div style={styles.screen}>

      <div style={styles.titleSection}>
        <h1 style={styles.title}>AVALON</h1>
        <p style={styles.subtitle}>Quest Cards</p>
        <div style={styles.titleDivider} />
      </div>

      {/* CHOOSE MODE */}
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

      {/* LOCAL SETUP */}
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

      {/* HOST SETUP -- wrapped in form so Go button submits */}
      {mode === 'host-setup' && (
        <form
          style={styles.content}
          onSubmit={function(e) { e.preventDefault(); handleHostStart(); }}
        >
          {nameInput}
          <p style={styles.sectionLabel}>NUMBER OF PLAYERS</p>
          <PlayerPicker selected={selectedPlayers} onSelect={setSelectedPlayers} />
          <button
            type="submit"
            style={{ ...styles.primaryButton, ...(isLoading ? styles.buttonDisabled : {}) }}
            disabled={isLoading}
          >
            {isLoading ? 'CREATING ROOM...' : 'CREATE ROOM'}
          </button>
          <button
            type="button"
            style={styles.backButton}
            onClick={function() { setMode('choose'); setNameError(''); }}
          >
            ← BACK
          </button>
          {errorMessage && <p style={styles.errorText}>{errorMessage}</p>}
        </form>
      )}

      {/* JOIN -- two-step form: name then code */}
      {mode === 'join' && (
        <form
          style={styles.content}
          onSubmit={function(e) { e.preventDefault(); handleJoinSubmit(); }}
        >
          {nameInput}

          <div style={styles.inputGroup}>
            <p style={styles.sectionLabel}>ROOM CODE</p>
            <div style={styles.codeBoxRow}>
              {codeBoxes.map(function(char, i) {
                return (
                  <input
                    key={i}
                    ref={function(el) { codeRefs.current[i] = el; }}
                    style={{
                      ...styles.codeBox,
                      ...(char ? styles.codeBoxFilled : {}),
                      ...(focusedBox === i ? styles.codeBoxFocused : {}),
                    }}
                    type="text"
                    inputMode="text"
                    maxLength={2}
                    value={char}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    autoComplete="off"
                    enterKeyHint="go"
                    onChange={function(e) { handleCodeBoxChange(i, e.target.value); }}
                    onKeyDown={function(e) { handleCodeBoxKeyDown(i, e); }}
                    onPaste={handleCodeBoxPaste}
                    onFocus={function(e) { setFocusedBox(i); e.target.select(); }}
                    onBlur={function() { setFocusedBox(null); }}
                  />
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            style={{
              ...styles.primaryButton,
              ...(!codeComplete || isLoading ? styles.buttonDisabled : {}),
            }}
            disabled={!codeComplete || isLoading}
          >
            {isLoading ? 'JOINING...' : 'JOIN GAME'}
          </button>
          <button
            type="button"
            style={styles.backButton}
            onClick={resetJoin}
          >
            ← BACK
          </button>
          {errorMessage && <p style={styles.errorText}>{errorMessage}</p>}
        </form>
      )}

      <p style={styles.footerText}>© 2013–2026 Ryan Henderson · v3.8</p>
    </div>
  );
}

function PlayerPicker(props: { selected: number; onSelect: (n: number) => void }) {
  return (
    <div style={pickerStyles.row}>
      {PLAYER_OPTIONS.map(function(count) {
        const isSelected = count === props.selected;
        return (
          <button
            key={count}
            type="button"
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
  row:            { display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', justifyContent: 'center', gap: 6, width: '100%' },
  button:         { width: 48, height: 48, borderRadius: 10, border: `1px solid ${COLORS.border}`, backgroundColor: 'rgba(22,24,38,0.85)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  buttonSelected: { border: `1px solid ${COLORS.gold}`, backgroundColor: 'rgba(30,33,54,0.95)' },
  text:           { fontSize: 17, fontWeight: '600', color: COLORS.textMuted },
  textSelected:   { color: COLORS.gold },
};

const styles: Record<string, React.CSSProperties> = {
  screen: {
    width: '100%', height: '100%',
    backgroundImage: 'url(/assets/images/normal_background.png)',
    backgroundSize: 'cover', backgroundPosition: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'flex-end', padding: SPACING.xl, paddingBottom: SPACING.xxl, gap: SPACING.lg,
  },
  titleSection:   { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  title:          { fontSize: 44, fontWeight: '800', color: COLORS.gold, letterSpacing: '8px', textShadow: '0 2px 8px rgba(0,0,0,0.9)', margin: 0 },
  subtitle:       { fontSize: 16, color: COLORS.textSecondary, letterSpacing: '4px', textTransform: 'uppercase', textShadow: '0 1px 6px rgba(0,0,0,0.9)', margin: 0 },
  titleDivider:   { width: 60, height: 1, backgroundColor: COLORS.borderGold, marginTop: SPACING.sm },
  content:        { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: SPACING.md },
  inputGroup:     { width: '100%', display: 'flex', flexDirection: 'column', gap: 6 },
  sectionLabel:   { fontSize: 11, color: COLORS.textMuted, letterSpacing: '3px', textTransform: 'uppercase', margin: 0, textAlign: 'center' },
  textInput:      { width: '100%', padding: `${SPACING.sm}px ${SPACING.md}px`, backgroundColor: 'rgba(22,24,38,0.9)', border: `1px solid ${COLORS.border}`, borderRadius: 12, fontSize: 18, color: COLORS.textPrimary, outline: 'none', boxSizing: 'border-box' },
  inputError:     { borderColor: COLORS.evil },
  // 6-box code entry
  codeBoxRow:     { display: 'flex', gap: 8, justifyContent: 'center' },
  codeBox:        {
    width: 44, height: 56, borderRadius: 10,
    border: `2px solid ${COLORS.border}`,
    backgroundColor: 'rgba(22,24,38,0.9)',
    fontSize: 24, fontWeight: '800', color: COLORS.textMuted,
    textAlign: 'center', outline: 'none',
    caretColor: COLORS.gold,
  },
  codeBoxFilled:  { borderColor: COLORS.gold, color: COLORS.gold },
  codeBoxFocused: { borderColor: COLORS.goldLight, boxShadow: `0 0 0 2px ${COLORS.goldDark}` },
  primaryButton:  { width: '100%', padding: `${SPACING.md}px`, backgroundColor: COLORS.gold, border: 'none', borderRadius: 20, fontSize: 16, fontWeight: '800', color: COLORS.bgDark, letterSpacing: '4px', textTransform: 'uppercase', cursor: 'pointer' },
  secondaryButton:{ width: '100%', padding: `${SPACING.md}px`, backgroundColor: 'rgba(22,24,38,0.85)', border: `1px solid ${COLORS.border}`, borderRadius: 20, fontSize: 14, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: '2px', textTransform: 'uppercase', cursor: 'pointer' },
  backButton:     { background: 'none', border: 'none', color: COLORS.textMuted, fontSize: 13, letterSpacing: '1px', cursor: 'pointer', padding: '4px 8px' },
  buttonDisabled: { opacity: 0.5, cursor: 'default' },
  orText:         { color: COLORS.textMuted, fontSize: 13, margin: 0 },
  errorText:      { color: COLORS.evil, fontSize: 13, textAlign: 'center', margin: 0 },
  footerText:     { fontSize: 13, color: COLORS.textSecondary, letterSpacing: '1px', margin: 0 },
  disconnectBanner: { width: '100%', padding: '10px 16px', backgroundColor: 'rgba(42,13,13,0.9)', borderRadius: 12, border: '1px solid #7A2A2A' },
  disconnectText: { fontSize: 13, color: '#EDE8D8', textAlign: 'center', margin: 0, lineHeight: '1.5' },
};