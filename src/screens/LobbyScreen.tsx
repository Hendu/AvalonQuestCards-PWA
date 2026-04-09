// =============================================================================
// LobbyScreen.tsx
//
// Waiting room + character picker for the host.
//
// Character picker UX:
//   - Tapping ANY card (locked or optional) opens a full-screen zoom modal
//     showing the card image large, the character description, and action buttons
//   - Locked cards (Merlin, Assassin): modal shows info + Close
//   - Toggle optionals (Percival, Morgana, Mordred, Oberon): Add/Remove + Close
//   - Filler cards (Loyal Servant, Minion): +/- counter stays inline;
//     tapping the card image/name zooms for info only
//   - Guests see all cards as info-only (no Add/Remove buttons in modal)
// =============================================================================

import React, { useState } from 'react';
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

const REPEATABLE: CharacterName[]      = ['Loyal Servant of Arthur', 'Minion of Mordred'];
const TOGGLE_OPTIONALS: CharacterName[] = ['Percival', 'Morgana', 'Mordred', 'Oberon'];
const LOCKED: CharacterName[]           = ['Merlin', 'Assassin'];

function countOf(arr: CharacterName[], name: CharacterName): number {
  return arr.filter(function(n) { return n === name; }).length;
}

function addOne(arr: CharacterName[], name: CharacterName): CharacterName[] {
  return [...arr, name];
}

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

  // Which character card is currently zoomed (null = none)
  const [zoomedCard, setZoomedCard] = useState<CharacterName | null>(null);
  const [codeCopied,  setCodeCopied]  = useState(false);

  const allSelected    = getFullCharacterList(availableCharacters);
  const validation     = validateCharacterSelection(availableCharacters, totalPlayers);
  const canStart       = players.length === totalPlayers && validation.isValid;
  const evilNeeded     = getEvilCount(totalPlayers);
  const goodNeeded     = getGoodCount(totalPlayers);
  const slotsRemaining = totalPlayers - allSelected.length;
  const currentEvil    = allSelected.filter(function(n) { return CHARACTERS[n].alignment === 'evil'; }).length;
  const currentGood    = allSelected.filter(function(n) { return CHARACTERS[n].alignment === 'good'; }).length;
  const evilSlotsLeft  = evilNeeded - currentEvil;
  const goodSlotsLeft  = goodNeeded - currentGood;

  function toggleCharacter(name: CharacterName) {
    if (!isHost) return;
    const isSelected = availableCharacters.includes(name);
    if (isSelected) {
      onUpdateCharacters(availableCharacters.filter(function(n) { return n !== name; }));
    } else {
      onUpdateCharacters([...availableCharacters, name]);
    }
  }

  function incrementCharacter(name: CharacterName) {
    if (!isHost || slotsRemaining <= 0) return;
    const info = CHARACTERS[name];
    if (info.alignment === 'evil' && evilSlotsLeft <= 0) return;
    if (info.alignment === 'good' && goodSlotsLeft <= 0) return;
    onUpdateCharacters(addOne(availableCharacters, name));
  }

  function decrementCharacter(name: CharacterName) {
    if (!isHost) return;
    onUpdateCharacters(removeOne(availableCharacters, name));
  }

  function canToggleOn(name: CharacterName): boolean {
    if (slotsRemaining <= 0) return false;
    const info = CHARACTERS[name];
    if (info.alignment === 'evil' && evilSlotsLeft <= 0) return false;
    if (info.alignment === 'good' && goodSlotsLeft <= 0) return false;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Card zoom modal
  // ---------------------------------------------------------------------------
  function renderZoomModal() {
    if (!zoomedCard) return null;
    const info       = CHARACTERS[zoomedCard];
    const isEvil     = info.alignment === 'evil';
    const isLocked   = LOCKED.includes(zoomedCard);
    const isToggle   = TOGGLE_OPTIONALS.includes(zoomedCard);
    const isSelected = availableCharacters.includes(zoomedCard);
    const canAdd     = isToggle && canToggleOn(zoomedCard);
    const imageName  = zoomedCard.replace(/ /g, '_');

    return (
      <div style={styles.modalOverlay} onClick={function() { setZoomedCard(null); }}>
        <div
          style={{
            ...styles.modalCard,
            borderColor:     isEvil ? COLORS.evilDim : COLORS.goodDim,
            backgroundColor: isEvil ? 'rgba(42,13,13,0.97)' : 'rgba(13,42,30,0.97)',
          }}
          onClick={function(e) { e.stopPropagation(); }}
        >
          {/* Card image in a mat-board frame */}
          <div style={{ ...styles.modalFrame, borderColor: isEvil ? COLORS.evilDim : COLORS.goodDim }}>
            <img
              src={`/assets/images/characters/${imageName}.png`}
              style={styles.modalImage}
              alt={zoomedCard}
            />
          </div>

          {/* Description */}
          <p style={styles.modalDescription}>{info.description}</p>

          {/* Action buttons */}
          <div style={styles.modalButtons}>
            {/* Toggle add/remove for host on optional toggle cards */}
            {isHost && isToggle && (
              isSelected ? (
                <button
                  style={{ ...styles.modalBtn, ...styles.modalBtnRemove }}
                  onClick={function() { toggleCharacter(zoomedCard); setZoomedCard(null); }}
                >
                  REMOVE
                </button>
              ) : (
                <button
                  style={{
                    ...styles.modalBtn,
                    ...styles.modalBtnAdd,
                    ...(canAdd ? {} : styles.modalBtnDisabled),
                  }}
                  onClick={function() {
                    if (canAdd) { toggleCharacter(zoomedCard); setZoomedCard(null); }
                  }}
                  disabled={!canAdd}
                >
                  {canAdd ? 'ADD' : 'NO SLOTS'}
                </button>
              )
            )}
            <button
              style={{ ...styles.modalBtn, ...styles.modalBtnClose }}
              onClick={function() { setZoomedCard(null); }}
            >
              CLOSE
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.screen, backgroundImage: 'url(/assets/images/normal_background.png)' }}>
      <div style={styles.overlay} />

      {/* Zoom modal rendered above everything */}
      {renderZoomModal()}

      <div style={styles.content}>

        {/* Top bar */}
        <div style={styles.topBar}>
          <span style={styles.topBarTitle}>AVALON QUEST CARDS</span>
          <button style={styles.iconButton} onClick={onLeave}>✕</button>
        </div>

        <div style={styles.scrollArea}>

          {/* Room code */}
          <div
            style={{ ...styles.roomCodeBlock, cursor: 'pointer' }}
            onClick={function() {
              navigator.clipboard.writeText(roomCode).then(function() {
                setCodeCopied(true);
                setTimeout(function() { setCodeCopied(false); }, 2000);
              }).catch(function() {});
            }}
          >
            <p style={styles.roomCodeLabel}>ROOM CODE</p>
            <div style={styles.roomCodeRow}>
              <p style={styles.roomCode}>{roomCode}</p>
              <span style={styles.copyIcon}>{codeCopied ? '✓' : '⎘'}</span>
            </div>
            <p style={styles.roomCodeHint}>
              {codeCopied ? '✓ Copied!' : 'Tap to copy · Share with other players'}
            </p>
          </div>

          {/* Player roster */}
          <div style={styles.section}>
            <p style={styles.sectionLabel}>PLAYERS ({players.length} / {totalPlayers})</p>
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
            <p style={styles.tapHint}>Tap any card to learn more</p>

            {/* Always-included */}
            <p style={styles.subsectionLabel}>Always included</p>
            <div style={styles.charList}>
              {LOCKED.map(function(name) {
                const info = CHARACTERS[name];
                return (
                  <button
                    key={name}
                    style={{ ...styles.charCard, ...styles.charCardLocked, ...styles.charCardSelected }}
                    onClick={function() { setZoomedCard(name); }}
                  >
                    <div style={{ ...styles.charCardFrame, borderColor: info.alignment === 'good' ? COLORS.goodDim : COLORS.evilDim }}>
                      <img src={`/assets/images/characters/${name.replace(/ /g, '_')}.png`}
                           style={styles.charCardImage} alt={name} />
                    </div>
                    <span style={styles.charCardName}>{name}</span>
                    <span style={{
                      ...styles.charCardAlignment,
                      color: info.alignment === 'good' ? COLORS.good : COLORS.evil,
                    }}>
                      {info.alignment.toUpperCase()}
                    </span>
                    <span style={styles.lockedBadge}>🔒 LOCKED</span>
                    <span style={styles.selectedBadge}>✓</span>
                  </button>
                );
              })}
            </div>

            {/* Toggle optionals */}
            <p style={styles.subsectionLabel}>
              {isHost ? 'Optional — tap to view & add/remove' : 'Optional characters — tap to learn more'}
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
                    }}
                    onClick={function() { setZoomedCard(name); }}
                  >
                    <div style={{ ...styles.charCardFrame, ...(dimmed ? { opacity: 0.5 } : {}), borderColor: info.alignment === 'good' ? COLORS.goodDim : COLORS.evilDim }}>
                      <img src={`/assets/images/characters/${name.replace(/ /g, '_')}.png`}
                           style={styles.charCardImage} alt={name} />
                    </div>
                    <span style={styles.charCardName}>{name}</span>
                    <span style={{
                      ...styles.charCardAlignment,
                      color: info.alignment === 'good' ? COLORS.good : COLORS.evil,
                    }}>
                      {info.alignment.toUpperCase()}
                    </span>
                    {isSelected && <span style={styles.selectedBadge}>✓</span>}
                  </button>
                );
              })}
            </div>

            {/* Filler roles with counter */}
            <p style={styles.subsectionLabel}>
              {isHost ? 'Filler roles — tap card to learn more, use +/− to set count' : 'Filler roles'}
            </p>
            <div style={styles.fillerList}>
              {REPEATABLE.map(function(name) {
                const info   = CHARACTERS[name];
                const count  = countOf(availableCharacters, name);
                const canInc = isHost && slotsRemaining > 0 &&
                  (info.alignment === 'evil' ? evilSlotsLeft > 0 : goodSlotsLeft > 0);
                const canDec = isHost && count > 0;

                return (
                  <div key={name} style={styles.fillerRow}>
                    {/* Tapping image/name zooms the card */}
                    <button
                      style={styles.fillerInfoBtn}
                      onClick={function() { setZoomedCard(name); }}
                    >
                      <div style={{ ...styles.fillerFrame, borderColor: info.alignment === 'good' ? COLORS.goodDim : COLORS.evilDim }}>
                        <img src={`/assets/images/characters/${name.replace(/ /g, '_')}.png`}
                             style={styles.fillerImage} alt={name} />
                      </div>
                      <div style={styles.fillerInfo}>
                        <span style={styles.fillerName}>{name}</span>
                        <span style={{
                          ...styles.fillerAlignment,
                          color: info.alignment === 'good' ? COLORS.good : COLORS.evil,
                        }}>
                          {info.alignment.toUpperCase()}
                        </span>
                      </div>
                    </button>
                    {/* Counter stays inline */}
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

            {/* Validation message -- host only */}
            {isHost && (
              <p style={{
                ...styles.validationMessage,
                color: canStart ? COLORS.good : COLORS.textSecondary,
              }}>
                {players.length < totalPlayers
                  ? `Waiting for ${totalPlayers - players.length} more player${totalPlayers - players.length !== 1 ? 's' : ''} to join`
                  : validation.message}
              </p>
            )}
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
            <p style={{
              ...styles.guestWaiting,
              color: canStart ? COLORS.good : COLORS.textSecondary,
            }}>
              {players.length < totalPlayers
                ? `⏳ Waiting for ${totalPlayers - players.length} more player${totalPlayers - players.length !== 1 ? 's' : ''} to join...`
                : !canStart
                  ? '⏳ Waiting for host to configure characters...'
                  : '✓ Ready to start!'}
            </p>
          )}

        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  screen:           { width: '100%', height: '100%', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' },
  overlay:          { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.72)' },
  content:          { position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column' },
  topBar:           { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${SPACING.sm}px ${SPACING.md}px`, borderBottom: '1px solid rgba(42,45,69,0.8)', backgroundColor: 'rgba(13,15,26,0.7)', flexShrink: 0 },
  topBarTitle:      { fontSize: 11, color: COLORS.textMuted, letterSpacing: '3px', fontWeight: '600' },
  iconButton:       { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: COLORS.textPrimary, padding: '4px 8px' },
  scrollArea:       { flex: 1, overflowY: 'auto', padding: SPACING.md, display: 'flex', flexDirection: 'column', gap: SPACING.lg, paddingBottom: SPACING.xxl },
  roomCodeBlock:    { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: SPACING.lg, backgroundColor: 'rgba(22,24,38,0.85)', borderRadius: 16, border: `1px solid ${COLORS.border}` },
  roomCodeLabel:    { fontSize: 12, color: COLORS.textSecondary, letterSpacing: '3px', margin: 0 },
  roomCodeRow:      { display: 'flex', alignItems: 'center', gap: 10 },
  roomCode:         { fontSize: 36, fontWeight: '800', color: COLORS.gold, letterSpacing: '8px', margin: 0 },
  copyIcon:         { fontSize: 20, color: COLORS.gold, opacity: 0.7, userSelect: 'none' },
  roomCodeHint:     { fontSize: 12, color: COLORS.textSecondary, margin: 0 },
  section:          { display: 'flex', flexDirection: 'column', gap: SPACING.sm },
  sectionLabel:     { fontSize: 12, color: COLORS.textSecondary, letterSpacing: '3px', fontWeight: '600', margin: 0 },
  subsectionLabel:  { fontSize: 12, color: COLORS.textSecondary, letterSpacing: '1px', margin: '4px 0 0 0', fontStyle: 'italic' },
  tapHint:          { fontSize: 12, color: COLORS.textMuted, margin: 0, fontStyle: 'italic' },
  charCountHint:    { fontSize: 12, color: COLORS.textSecondary, margin: 0 },
  playerList:       { display: 'flex', flexDirection: 'column', gap: 6 },
  playerRow:        { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${SPACING.sm}px ${SPACING.md}px`, backgroundColor: 'rgba(22,24,38,0.85)', borderRadius: 10, border: `1px solid ${COLORS.border}` },
  playerRowEmpty:   { borderStyle: 'dashed', opacity: 0.4 },
  playerName:       { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  playerNameMe:     { color: COLORS.gold },
  playerNameEmpty:  { fontSize: 14, color: COLORS.textMuted, fontStyle: 'italic' },
  hostBadge:        { fontSize: 12, color: COLORS.gold },
  charList:         { display: 'flex', flexWrap: 'wrap', gap: 8 },
  charCard:         { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: `${SPACING.sm}px 8px`, width: '30%', minWidth: 90, backgroundColor: 'rgba(22,24,38,0.85)', border: `1px solid ${COLORS.border}`, borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s ease', position: 'relative' },
  charCardLocked:   { borderColor: 'rgba(42,45,69,0.5)', backgroundColor: 'rgba(13,15,26,0.6)' },
  charCardSelected: { borderColor: COLORS.gold, backgroundColor: 'rgba(30,33,54,0.95)' },
  charCardDimmed:   { opacity: 0.45 },
  charCardFrame:    { width: 60, height: 80, borderRadius: 12, overflow: 'hidden', flexShrink: 0, border: '1px solid' },
  charCardImage:    { width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' },
  charCardName:     { fontSize: 12, color: COLORS.textPrimary, textAlign: 'center', fontWeight: '600', lineHeight: '1.2' },
  charCardAlignment:{ fontSize: 11, letterSpacing: '1px', fontWeight: '700' },
  lockedBadge:      { fontSize: 11, color: COLORS.textMuted, letterSpacing: '1px', backgroundColor: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: 4 },
  selectedBadge:    { position: 'absolute', top: 4, right: 4, fontSize: 14, color: COLORS.gold },
  fillerList:       { display: 'flex', flexDirection: 'column', gap: 8 },
  fillerRow:        { display: 'flex', alignItems: 'center', gap: SPACING.md, padding: `${SPACING.sm}px ${SPACING.md}px`, backgroundColor: 'rgba(22,24,38,0.85)', borderRadius: 12, border: `1px solid ${COLORS.border}` },
  fillerInfoBtn:    { display: 'flex', alignItems: 'center', gap: SPACING.sm, flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
  fillerFrame:      { width: 40, height: 54, borderRadius: 6, overflow: 'hidden', flexShrink: 0, border: '1px solid' },
  fillerImage:      { width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' },
  fillerInfo:       { display: 'flex', flexDirection: 'column', gap: 2 },
  fillerName:       { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  fillerAlignment:  { fontSize: 11, letterSpacing: '1px', fontWeight: '700' },
  counter:          { display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
  counterBtn:       { width: 32, height: 32, borderRadius: '50%', border: `1px solid ${COLORS.border}`, backgroundColor: 'rgba(13,15,26,0.8)', color: COLORS.gold, fontSize: 20, fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 },
  counterValue:     { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary, minWidth: 24, textAlign: 'center' },
  validationMessage:{ fontSize: 13, textAlign: 'center', margin: 0 },
  divider:          { height: 1, backgroundColor: 'rgba(42,45,69,0.5)' },
  startButton:      { width: '100%', padding: `${SPACING.md}px`, backgroundColor: COLORS.gold, border: 'none', borderRadius: 20, fontSize: 15, fontWeight: '800', color: COLORS.bgDark, letterSpacing: '3px', cursor: 'pointer' },
  startButtonDisabled: { opacity: 0.4, cursor: 'default' },
  guestWaiting:     { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', margin: 0 },
  // Modal
  modalOverlay:     { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: SPACING.md },
  modalCard:        { width: '100%', maxWidth: 340, borderRadius: 20, border: '1px solid', padding: SPACING.lg, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACING.md },
  modalFrame:       { width: 220, height: 370, borderRadius: 16, overflow: 'hidden', flexShrink: 0, border: '1px solid' },
  modalImage:       { width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' },
  modalDescription: { fontSize: 14, color: COLORS.textPrimary, textAlign: 'center', lineHeight: '1.6', margin: 0 },
  modalButtons:     { display: 'flex', gap: SPACING.sm, width: '100%' },
  modalBtn:         { flex: 1, padding: `${SPACING.sm}px`, borderRadius: 12, fontSize: 13, fontWeight: '800', letterSpacing: '2px', cursor: 'pointer', border: 'none' },
  modalBtnAdd:      { backgroundColor: COLORS.gold, color: COLORS.bgDark },
  modalBtnRemove:   { backgroundColor: COLORS.evil, color: '#fff' },
  modalBtnClose:    { backgroundColor: 'rgba(42,45,69,0.8)', color: COLORS.textSecondary },
  modalBtnDisabled: { opacity: 0.4, cursor: 'default' },
};