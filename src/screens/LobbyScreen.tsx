// =============================================================================
// LobbyScreen.tsx
//
// Waiting room shown after host creates / guest joins a room.
//
// Character picker notes:
//   - Merlin + Assassin: always locked in, not selectable
//   - Percival, Morgana, Mordred, Oberon: toggle on/off (max 1 each)
//   - Loyal Servant of Arthur, Minion of Mordred: +/- counter (can have multiples)
//
// availableCharacters is a CharacterName[] that may contain duplicates for the
// repeatable filler roles. e.g. ['Loyal Servant of Arthur', 'Loyal Servant of Arthur']
// means two Loyal Servants. assignCharacters handles duplicates fine.
// =============================================================================

import React from 'react';
import { Player } from '../utils/firebaseGame';
import {
  CharacterName,
  CHARACTERS,
  getFullCharacterList,
  validateCharacterSelection,
  getEvilCount,
  getGoodCount,
} from '../utils/gameLogic';
import { COLORS, SPACING } from '../utils/theme';

interface LobbyScreenProps {
  roomCode:            string;
  isHost:              boolean;
  players:             Player[];
  totalPlayers:        number;
  myDeviceId:          string;
  availableCharacters: CharacterName[];
  onUpdateCharacters:  (chars: CharacterName[]) => void;
  onStartGame:         () => void;
  onLeave:             () => void;
}

// Characters that can appear more than once
const REPEATABLE: CharacterName[] = ['Loyal Servant of Arthur', 'Minion of Mordred'];

// Characters shown as simple toggles (max 1 each)
const TOGGLE_OPTIONALS: CharacterName[] = ['Percival', 'Morgana', 'Mordred', 'Oberon'];

// Count how many times a name appears in the array
function countOf(arr: CharacterName[], name: CharacterName): number {
  return arr.filter(function(n) { return n === name; }).length;
}

// Add one copy of name to array
function addOne(arr: CharacterName[], name: CharacterName): CharacterName[] {
  return [...arr, name];
}

// Remove one copy of name from array (removes last occurrence)
function removeOne(arr: CharacterName[], name: CharacterName): CharacterName[] {
  const idx = arr.lastIndexOf(name);
  if (idx === -1) return arr;
  const copy = [...arr];
  copy.splice(idx, 1);
  return copy;
}

export default function LobbyScreen(props: LobbyScreenProps) {
  const {
    roomCode, isHost, players, totalPlayers, myDeviceId,
    availableCharacters, onUpdateCharacters, onStartGame, onLeave,
  } = props;

  const allSelected  = getFullCharacterList(availableCharacters);
  const validation   = validateCharacterSelection(availableCharacters, totalPlayers);
  const canStart     = players.length === totalPlayers && validation.isValid;

  const evilNeeded  = getEvilCount(totalPlayers);
  const goodNeeded  = getGoodCount(totalPlayers);

  // How many slots remain (not counting locked Merlin+Assassin)
  const slotsRemaining = totalPlayers - allSelected.length;

  // How many good/evil slots remain
  const currentEvil   = allSelected.filter(function(n) { return CHARACTERS[n].alignment === 'evil'; }).length;
  const currentGood   = allSelected.filter(function(n) { return CHARACTERS[n].alignment === 'good'; }).length;
  const evilSlotsLeft = evilNeeded - currentEvil;
  const goodSlotsLeft = goodNeeded - currentGood;

  // Toggle a unique optional on/off
  function toggleCharacter(name: CharacterName) {
    if (!isHost) return;
    const isSelected = availableCharacters.includes(name);
    if (isSelected) {
      onUpdateCharacters(availableCharacters.filter(function(n) { return n !== name; }));
    } else {
      onUpdateCharacters([...availableCharacters, name]);
    }
  }

  // Increment a repeatable character count
  function incrementCharacter(name: CharacterName) {
    if (!isHost || slotsRemaining <= 0) return;
    const info = CHARACTERS[name];
    if (info.alignment === 'evil' && evilSlotsLeft <= 0) return;
    if (info.alignment === 'good' && goodSlotsLeft <= 0) return;
    onUpdateCharacters(addOne(availableCharacters, name));
  }

  // Decrement a repeatable character count (min 0)
  function decrementCharacter(name: CharacterName) {
    if (!isHost) return;
    onUpdateCharacters(removeOne(availableCharacters, name));
  }

  // Is a toggle character available to be added?
  function canToggleOn(name: CharacterName): boolean {
    if (slotsRemaining <= 0) return false;
    const info = CHARACTERS[name];
    if (info.alignment === 'evil' && evilSlotsLeft <= 0) return false;
    if (info.alignment === 'good' && goodSlotsLeft <= 0) return false;
    if (name === 'Percival' && !allSelected.includes('Morgana')) return false;
    return true;
  }

  return (
    <div style={{ ...styles.screen, backgroundImage: 'url(/assets/images/normal_background.png)' }}>
      <div style={styles.overlay} />

      <div style={styles.content}>

        {/* Top bar */}
        <div style={styles.topBar}>
          <span style={styles.topBarTitle}>AVALON QUEST CARDS</span>
          <button style={styles.iconButton} onClick={onLeave}>✕</button>
        </div>

        <div style={styles.scrollArea}>

          {/* Room code */}
          <div style={styles.roomCodeBlock}>
            <p style={styles.roomCodeLabel}>ROOM CODE</p>
            <p style={styles.roomCode}>{roomCode}</p>
            <p style={styles.roomCodeHint}>Share this with other players</p>
          </div>

          {/* Player roster */}
          <div style={styles.section}>
            <p style={styles.sectionLabel}>
              PLAYERS ({players.length} / {totalPlayers})
            </p>
            <div style={styles.playerList}>
              {players.map(function(player) {
                const isMe = player.deviceId === myDeviceId;
                return (
                  <div key={player.deviceId} style={styles.playerRow}>
                    <span style={{ ...styles.playerName, ...(isMe ? styles.playerNameMe : {}) }}>
                      {player.name}{isMe ? ' (you)' : ''}
                    </span>
                    {player.deviceId === players[0]?.deviceId && (
                      <span style={styles.hostBadge}>👑 Host</span>
                    )}
                  </div>
                );
              })}
              {Array.from({ length: totalPlayers - players.length }).map(function(_, i) {
                return (
                  <div key={`empty-${i}`} style={{ ...styles.playerRow, ...styles.playerRowEmpty }}>
                    <span style={styles.playerNameEmpty}>Waiting...</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={styles.divider} />

          {/* Character selection */}
          <div style={styles.section}>
            <p style={styles.sectionLabel}>CHARACTERS</p>
            <p style={styles.charCountHint}>
              Need {goodNeeded} good · {evilNeeded} evil for {totalPlayers} players
              {slotsRemaining > 0 && (
                <span style={{ color: COLORS.textMuted }}> · {slotsRemaining} slot{slotsRemaining !== 1 ? 's' : ''} remaining</span>
              )}
            </p>

            {/* Always-included */}
            <p style={styles.subsectionLabel}>Always included</p>
            <div style={styles.charList}>
              {(['Merlin', 'Assassin'] as CharacterName[]).map(function(name) {
                const info = CHARACTERS[name];
                return (
                  <div key={name} style={{ ...styles.charCard, ...styles.charCardLocked }}>
                    <img src={`/assets/images/characters/${name.replace(/ /g, '_')}.svg`}
                         style={styles.charCardImage} alt={name} />
                    <span style={styles.charCardName}>{name}</span>
                    <span style={{
                      ...styles.charCardAlignment,
                      color: info.alignment === 'good' ? COLORS.good : COLORS.evil,
                    }}>
                      {info.alignment.toUpperCase()}
                    </span>
                    <span style={styles.lockedBadge}>LOCKED</span>
                  </div>
                );
              })}
            </div>

            {/* Toggle optionals (unique characters) */}
            <p style={styles.subsectionLabel}>
              {isHost ? 'Optional — tap to add/remove' : 'Optional characters'}
            </p>
            <div style={styles.charList}>
              {TOGGLE_OPTIONALS.map(function(name) {
                const info       = CHARACTERS[name];
                const isSelected = availableCharacters.includes(name);
                const canAdd     = canToggleOn(name);
                const dimmed     = !isSelected && !canAdd;

                return (
                  <button
                    key={name}
                    style={{
                      ...styles.charCard,
                      ...(isSelected ? styles.charCardSelected : {}),
                      ...(dimmed ? styles.charCardDimmed : {}),
                      cursor: (isHost && (isSelected || canAdd)) ? 'pointer' : 'default',
                    }}
                    onClick={function() {
                      if (isHost && (isSelected || canAdd)) toggleCharacter(name);
                    }}
                    disabled={!isHost || (!isSelected && !canAdd)}
                  >
                    <img src={`/assets/images/characters/${name.replace(/ /g, '_')}.svg`}
                         style={{ ...styles.charCardImage, ...(dimmed ? { opacity: 0.4 } : {}) }}
                         alt={name} />
                    <span style={styles.charCardName}>{name}</span>
                    <span style={{
                      ...styles.charCardAlignment,
                      color: info.alignment === 'good' ? COLORS.good : COLORS.evil,
                    }}>
                      {info.alignment.toUpperCase()}
                    </span>
                    {isSelected && <span style={styles.selectedBadge}>✓</span>}
                    {name === 'Percival' && !allSelected.includes('Morgana') && !isSelected && (
                      <span style={styles.requiresBadge}>needs Morgana</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Counter optionals (repeatable filler roles) */}
            <p style={styles.subsectionLabel}>
              {isHost ? 'Filler roles — use +/− to set count' : 'Filler roles'}
            </p>
            <div style={styles.fillerList}>
              {REPEATABLE.map(function(name) {
                const info  = CHARACTERS[name];
                const count = countOf(availableCharacters, name);
                const canInc = isHost && slotsRemaining > 0 &&
                  (info.alignment === 'evil' ? evilSlotsLeft > 0 : goodSlotsLeft > 0);
                const canDec = isHost && count > 0;

                return (
                  <div key={name} style={styles.fillerRow}>
                    <img src={`/assets/images/characters/${name.replace(/ /g, '_')}.svg`}
                         style={styles.fillerImage} alt={name} />
                    <div style={styles.fillerInfo}>
                      <span style={styles.fillerName}>{name}</span>
                      <span style={{
                        ...styles.fillerAlignment,
                        color: info.alignment === 'good' ? COLORS.good : COLORS.evil,
                      }}>
                        {info.alignment.toUpperCase()}
                      </span>
                    </div>
                    <div style={styles.counter}>
                      {isHost ? (
                        <>
                          <button
                            style={{ ...styles.counterBtn, opacity: canDec ? 1 : 0.3 }}
                            onClick={function() { decrementCharacter(name); }}
                            disabled={!canDec}
                          >−</button>
                          <span style={styles.counterValue}>{count}</span>
                          <button
                            style={{ ...styles.counterBtn, opacity: canInc ? 1 : 0.3 }}
                            onClick={function() { incrementCharacter(name); }}
                            disabled={!canInc}
                          >+</button>
                        </>
                      ) : (
                        <span style={styles.counterValue}>{count}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Validation message */}
            <p style={{
              ...styles.validationMessage,
              color: validation.isValid ? COLORS.good : COLORS.textMuted,
            }}>
              {validation.message}
            </p>
          </div>

          {isHost && (
            <button
              style={{ ...styles.startButton, ...(!canStart ? styles.startButtonDisabled : {}) }}
              onClick={onStartGame}
              disabled={!canStart}
            >
              START GAME →
            </button>
          )}

          {!isHost && (
            <p style={styles.guestWaiting}>
              ⏳ Waiting for host to configure characters and start the game...
            </p>
          )}

        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  screen: { width: '100%', height: '100%', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' },
  overlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.72)' },
  content: { position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${SPACING.sm}px ${SPACING.md}px`, borderBottom: '1px solid rgba(42,45,69,0.8)', backgroundColor: 'rgba(13,15,26,0.7)', flexShrink: 0 },
  topBarTitle: { fontSize: 11, color: COLORS.textMuted, letterSpacing: '3px', fontWeight: '600' },
  iconButton: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: COLORS.textPrimary, padding: '4px 8px' },
  scrollArea: { flex: 1, overflowY: 'auto', padding: SPACING.md, display: 'flex', flexDirection: 'column', gap: SPACING.lg, paddingBottom: SPACING.xxl },
  roomCodeBlock: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: SPACING.lg, backgroundColor: 'rgba(22,24,38,0.85)', borderRadius: 16, border: `1px solid ${COLORS.border}` },
  roomCodeLabel: { fontSize:  12, color: COLORS.textMuted, letterSpacing: '3px', margin: 0 },
  roomCode: { fontSize: 36, fontWeight: '800', color: COLORS.gold, letterSpacing: '8px', margin: 0 },
  roomCodeHint: { fontSize: 12, color: COLORS.textMuted, margin: 0 },
  section: { display: 'flex', flexDirection: 'column', gap: SPACING.sm },
  sectionLabel: { fontSize:  12, color: COLORS.textMuted, letterSpacing: '3px', fontWeight: '600', margin: 0 },
  subsectionLabel: { fontSize: 11, color: COLORS.textMuted, letterSpacing: '1px', margin: '4px 0 0 0', fontStyle: 'italic' },
  charCountHint: { fontSize: 12, color: COLORS.textSecondary, margin: 0 },
  playerList: { display: 'flex', flexDirection: 'column', gap: 6 },
  playerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${SPACING.sm}px ${SPACING.md}px`, backgroundColor: 'rgba(22,24,38,0.85)', borderRadius: 10, border: `1px solid ${COLORS.border}` },
  playerRowEmpty: { borderStyle: 'dashed', opacity: 0.4 },
  playerName: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  playerNameMe: { color: COLORS.gold },
  playerNameEmpty: { fontSize: 14, color: COLORS.textMuted, fontStyle: 'italic' },
  hostBadge: { fontSize: 12, color: COLORS.gold },
  charList: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  charCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: `${SPACING.sm}px 8px`, width: '30%', minWidth: 90, backgroundColor: 'rgba(22,24,38,0.85)', border: `1px solid ${COLORS.border}`, borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s ease', position: 'relative' },
  charCardLocked: { borderColor: 'rgba(42,45,69,0.5)', backgroundColor: 'rgba(13,15,26,0.6)', cursor: 'default' },
  charCardSelected: { borderColor: COLORS.gold, backgroundColor: 'rgba(30,33,54,0.95)' },
  charCardDimmed: { opacity: 0.45 },
  charCardImage: { width: 60, height: 80, objectFit: 'contain', borderRadius: 6 },
  charCardName: { fontSize:  12, color: COLORS.textPrimary, textAlign: 'center', fontWeight: '600', lineHeight: '1.2' },
  charCardAlignment: { fontSize:  11, letterSpacing: '1px', fontWeight: '700' },
  lockedBadge: { fontSize: 7, color: COLORS.textMuted, letterSpacing: '1px', backgroundColor: 'rgba(0,0,0,0.4)', padding: '2px 4px', borderRadius: 4 },
  selectedBadge: { position: 'absolute', top: 4, right: 4, fontSize: 12, color: COLORS.gold },
  requiresBadge: { fontSize: 7, color: COLORS.textMuted, textAlign: 'center', fontStyle: 'italic' },
  // Filler / counter styles
  fillerList: { display: 'flex', flexDirection: 'column', gap: 8 },
  fillerRow: { display: 'flex', alignItems: 'center', gap: SPACING.md, padding: `${SPACING.sm}px ${SPACING.md}px`, backgroundColor: 'rgba(22,24,38,0.85)', borderRadius: 12, border: `1px solid ${COLORS.border}` },
  fillerImage: { width: 40, height: 54, objectFit: 'contain', borderRadius: 4, flexShrink: 0 },
  fillerInfo: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1 },
  fillerName: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  fillerAlignment: { fontSize:  11, letterSpacing: '1px', fontWeight: '700' },
  counter: { display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
  counterBtn: { width: 32, height: 32, borderRadius: '50%', border: `1px solid ${COLORS.border}`, backgroundColor: 'rgba(13,15,26,0.8)', color: COLORS.gold, fontSize: 20, fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 },
  counterValue: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary, minWidth: 24, textAlign: 'center' },
  // Bottom
  validationMessage: { fontSize: 13, textAlign: 'center', margin: 0 },
  divider: { height: 1, backgroundColor: 'rgba(42,45,69,0.5)' },
  startButton: { width: '100%', padding: `${SPACING.md}px`, backgroundColor: COLORS.gold, border: 'none', borderRadius: 20, fontSize: 15, fontWeight: '800', color: COLORS.bgDark, letterSpacing: '3px', cursor: 'pointer' },
  startButtonDisabled: { opacity: 0.4, cursor: 'default' },
  guestWaiting: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', margin: 0 },
};
