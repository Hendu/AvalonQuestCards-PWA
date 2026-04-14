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
import { COLORS, SPACING, WAITING_PULSE_STYLE } from '../utils/theme';

interface LobbyScreenProps {
  roomCode:              string;
  isHost:                boolean;
  players:               Player[];
  totalPlayers:          number;
  myDeviceId:            string;
  availableCharacters:   CharacterName[];
  onUpdateCharacters:    (chars: CharacterName[]) => void;
  onStartGame:           () => void;
  onLeave:               () => void;
  // v4: Lady of the Lake toggle
  ladyOfTheLakeEnabled:  boolean;
  onToggleLadyOfTheLake: (enabled: boolean) => void;
  // v4.1: Bots toggle
  botsEnabled:           boolean;
  onToggleBots:          (enabled: boolean) => void;
  soundEnabled:          boolean;
  onToggleSound:         () => void;
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
    ladyOfTheLakeEnabled, onToggleLadyOfTheLake,
    botsEnabled, onToggleBots, soundEnabled, onToggleSound,
  } = props;

  // Which character card is currently zoomed (null = none)
  const [zoomedCard,    setZoomedCard]    = useState<CharacterName | null>(null);
  const [lotlModalOpen, setLotlModalOpen] = useState(false);
  const [botModalOpen,  setBotModalOpen]  = useState(false);
  const [codeCopied,    setCodeCopied]    = useState(false);

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

  // ---------------------------------------------------------------------------
  // Lady of the Lake modal
  // ---------------------------------------------------------------------------
  function renderLotlModal() {
    if (!lotlModalOpen) return null;

    return (
      <div style={styles.modalOverlay} onClick={function() { setLotlModalOpen(false); }}>
        <div
          style={{
            ...styles.modalCard,
            borderColor:     'rgba(80,150,190,0.6)',
            backgroundColor: 'rgba(10,25,38,0.97)',
          }}
          onClick={function(e) { e.stopPropagation(); }}
        >
          {/* Artwork — same frame dimensions as character cards */}
          <div style={{
            ...styles.modalFrame,
            borderColor: 'rgba(80,150,190,0.5)',
            height: 300,
          }}>
            <img
              src="/assets/images/lady_of_the_lake.png"
              style={styles.modalImage}
              alt="Lady of the Lake"
            />
          </div>

          {/* MECHANIC label instead of GOOD / EVIL alignment badge */}
          <div style={styles.lotlModalMechanicRow}>
            <span style={styles.lotlModalMechanicBadge}>⟡ MECHANIC</span>
          </div>

          {/* Description */}
          <p style={styles.modalDescription}>
            After each quest result (quests 1–4 only), the token holder privately investigates
            one other player and learns whether they are Good or Evil. The token then passes
            to the investigated player. No player may hold the token twice. Who has held the
            token is public knowledge; the result is known only to the token holder.
          </p>

          {/* Toggle — host only, read-only for guests */}
          {isHost ? (
            <button
              style={{
                ...styles.lotlModalToggleRow,
                ...(ladyOfTheLakeEnabled ? styles.lotlModalToggleRowOn : {}),
              }}
              onClick={function() { onToggleLadyOfTheLake(!ladyOfTheLakeEnabled); }}
            >
              <span style={{
                ...styles.lotlModalToggleLabel,
                color: ladyOfTheLakeEnabled ? COLORS.textPrimary : COLORS.textSecondary,
              }}>
                {ladyOfTheLakeEnabled ? '🌊  Enabled' : 'Disabled'}
              </span>
              <div style={{
                ...styles.togglePill,
                backgroundColor: ladyOfTheLakeEnabled ? 'rgba(80,160,210,0.9)' : 'rgba(42,45,69,0.8)',
              }}>
                <div style={{
                  ...styles.toggleThumb,
                  transform: ladyOfTheLakeEnabled ? 'translateX(22px)' : 'translateX(0px)',
                }} />
              </div>
            </button>
          ) : (
            <div style={styles.lotlModalGuestStatus}>
              <span style={{
                color:      ladyOfTheLakeEnabled ? 'rgba(100,200,240,0.9)' : COLORS.textMuted,
                fontSize:   13,
                fontWeight: '600',
              }}>
                {ladyOfTheLakeEnabled ? '🌊  Enabled by host' : 'Not enabled by host'}
              </span>
            </div>
          )}

          <button
            style={{ ...styles.modalBtn, ...styles.modalBtnClose, width: '100%' }}
            onClick={function() { setLotlModalOpen(false); }}
          >
            CLOSE
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Bots modal  (v4.1)
  // ---------------------------------------------------------------------------
  function renderBotsModal() {
    if (!botModalOpen) return null;

    return (
      <div style={styles.modalOverlay} onClick={function() { setBotModalOpen(false); }}>
        <div
          style={{
            ...styles.modalCard,
            // Warm amber tint — distinct from LoTL blue and character green/red
            borderColor:     'rgba(160,120,40,0.6)',
            backgroundColor: 'rgba(22,16,6,0.97)',
          }}
          onClick={function(e) { e.stopPropagation(); }}
        >
          {/* Icon in place of artwork */}
          <div style={styles.botModalIcon}>
            <span style={styles.botModalEmoji}>🤖</span>
          </div>

          {/* MECHANIC badge */}
          <div style={styles.lotlModalMechanicRow}>
            <span style={{
              ...styles.lotlModalMechanicBadge,
              color:           'rgba(200,160,60,0.9)',
              backgroundColor: 'rgba(50,35,8,0.7)',
              borderColor:     'rgba(160,120,40,0.4)',
            }}>⟡ MECHANIC</span>
          </div>

          {/* Description */}
          <p style={styles.modalDescription}>
            Fill empty player slots with AI-controlled bots. Once enabled, the room is
            locked — no new humans can join. Bots vote, propose teams, and make decisions
            based on their character role. They're not perfect, but they're trying their best.
          </p>

          {/* Player count preview */}
          {isHost && (
            <div style={styles.botSlotPreview}>
              <span style={styles.botSlotText}>
                {botsEnabled
                  ? `${players.filter(function(p) { return p.isBot; }).length} bot${players.filter(function(p) { return p.isBot; }).length !== 1 ? 's' : ''} filling ${totalPlayers - players.filter(function(p) { return !p.isBot; }).length} slot${totalPlayers - players.filter(function(p) { return !p.isBot; }).length !== 1 ? 's' : ''}`
                  : `${totalPlayers - players.length} slot${totalPlayers - players.length !== 1 ? 's' : ''} would be filled with bots`}
              </span>
            </div>
          )}

          {/* Toggle — host only */}
          {isHost ? (
            <button
              style={{
                ...styles.lotlModalToggleRow,
                ...(botsEnabled ? styles.botModalToggleRowOn : {}),
              }}
              onClick={function() { onToggleBots(!botsEnabled); }}
            >
              <span style={{
                ...styles.lotlModalToggleLabel,
                color: botsEnabled ? COLORS.textPrimary : COLORS.textSecondary,
              }}>
                {botsEnabled ? '🤖  Enabled' : 'Disabled'}
              </span>
              <div style={{
                ...styles.togglePill,
                backgroundColor: botsEnabled ? 'rgba(180,130,40,0.9)' : 'rgba(42,45,69,0.8)',
              }}>
                <div style={{
                  ...styles.toggleThumb,
                  transform: botsEnabled ? 'translateX(22px)' : 'translateX(0px)',
                }} />
              </div>
            </button>
          ) : (
            <div style={styles.lotlModalGuestStatus}>
              <span style={{
                color:      botsEnabled ? 'rgba(200,160,60,0.9)' : COLORS.textMuted,
                fontSize:   13,
                fontWeight: '600',
              }}>
                {botsEnabled ? '🤖  Bots enabled by host' : 'Not enabled by host'}
              </span>
            </div>
          )}

          <button
            style={{ ...styles.modalBtn, ...styles.modalBtnClose, width: '100%' }}
            onClick={function() { setBotModalOpen(false); }}
          >
            CLOSE
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.screen, backgroundImage: 'url(/assets/images/normal_background.png)' }}>
      <div style={styles.overlay} />

      {/* All modals rendered above everything */}
      {renderZoomModal()}
      {renderLotlModal()}
      {renderBotsModal()}

      <div style={styles.content}>

        {/* Top bar */}
        <div style={styles.topBar}>
          <button style={styles.iconButton} onClick={onToggleSound}>{soundEnabled ? '🔊' : '🔇'}</button>
          <span style={styles.topBarTitle}>AVALON QUEST CARDS</span>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button style={styles.iconButton} onClick={onLeave}>✕</button>
          </div>
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
                  </div>
                );
              })}
              {Array.from({ length: totalPlayers - players.length }).map(function(_, i) {
                return (
                  <div key={`empty-${i}`} style={{ ...styles.playerRow, ...styles.playerRowEmpty }}>
                    <span style={{ ...styles.playerNameEmpty, ...WAITING_PULSE_STYLE }}>Waiting...</span>
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
                const canInc   = isHost && slotsRemaining > 0 &&
                  (info.alignment === 'evil' ? evilSlotsLeft > 0 : goodSlotsLeft > 0);
                const canDec   = isHost && count > 0;
                const fullSlots = count === 0 && !canInc;

                return (
                  <div key={name} style={{ ...styles.fillerRow, opacity: fullSlots ? 0.35 : 1 }}>
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

          </div>

          {/* ----------------------------------------------------------------
              v4: LADY OF THE LAKE — tappable card (mechanic, not a character)
              Tap opens a modal with artwork, description, and the toggle.
              Card is visually distinct from character cards: lake-blue tint,
              wider aspect, no alignment badge, "MECHANIC" label instead.
          ---------------------------------------------------------------- */}
          <div style={styles.divider} />

          <div style={styles.section}>
            <p style={styles.sectionLabel}>MECHANICS</p>
            <p style={styles.tapHint}>Tap to learn more</p>

            {/* Cards row — LoTL and Bots side by side */}
            <div style={styles.mechanicsRow}>

              {/* Lady of the Lake card */}
              <button
                style={{
                  ...styles.lotlCard,
                  ...(ladyOfTheLakeEnabled ? styles.lotlCardEnabled : {}),
                }}
                onClick={function() { setLotlModalOpen(true); }}
              >
                <div style={{
                  ...styles.lotlCardFrame,
                  borderColor: ladyOfTheLakeEnabled ? 'rgba(100,180,220,0.7)' : 'rgba(60,90,110,0.6)',
                }}>
                  <img
                    src="/assets/images/lady_of_the_lake.png"
                    style={styles.lotlCardImage}
                    alt="Lady of the Lake"
                  />
                </div>
                <span style={styles.lotlCardName}>Lady of the Lake</span>
                <span style={{
                  ...styles.lotlMechanicBadge,
                  color:           ladyOfTheLakeEnabled ? 'rgba(100,200,240,0.95)' : COLORS.textMuted,
                  backgroundColor: ladyOfTheLakeEnabled ? 'rgba(20,60,80,0.7)'    : 'rgba(30,33,54,0.5)',
                  borderColor:     ladyOfTheLakeEnabled ? 'rgba(100,180,220,0.4)' : 'rgba(42,45,69,0.5)',
                }}>
                  MECHANIC
                </span>
                {ladyOfTheLakeEnabled && <span style={styles.lotlEnabledCheck}>✓</span>}
              </button>

              {/* Bots card */}
              <button
                style={{
                  ...styles.lotlCard,
                  ...(botsEnabled ? styles.botCardEnabled : {}),
                }}
                onClick={function() { setBotModalOpen(true); }}
              >
                <div style={{
                  ...styles.botCardIconFrame,
                  borderColor: botsEnabled ? 'rgba(180,130,40,0.7)' : 'rgba(90,70,20,0.5)',
                }}>
                  <span style={styles.botCardEmoji}>🤖</span>
                </div>
                <span style={styles.lotlCardName}>Bot Players</span>
                <span style={{
                  ...styles.lotlMechanicBadge,
                  color:           botsEnabled ? 'rgba(220,170,60,0.95)' : COLORS.textMuted,
                  backgroundColor: botsEnabled ? 'rgba(50,35,8,0.7)'    : 'rgba(30,33,54,0.5)',
                  borderColor:     botsEnabled ? 'rgba(160,120,40,0.4)' : 'rgba(42,45,69,0.5)',
                }}>
                  MECHANIC
                </span>
                {botsEnabled && (
                  <span style={{ ...styles.lotlEnabledCheck, color: 'rgba(220,170,60,0.9)' }}>✓</span>
                )}
              </button>

            </div>
          </div>

        </div>

        {/* Fixed bottom bar */}
        <div style={styles.bottomBar}>
          {/* Waiting / ready status — docked, always visible */}
          <p style={{
            ...styles.waitingMessage,
            color: players.length < totalPlayers
              ? COLORS.textMuted
              : canStart ? COLORS.good : COLORS.textSecondary,
            ...(players.length < totalPlayers || !canStart ? WAITING_PULSE_STYLE : {}),
          }}>
            {players.length < totalPlayers
              ? `⏳ Waiting for ${totalPlayers - players.length} more player${totalPlayers - players.length !== 1 ? 's' : ''} to join...`
              : isHost
                ? (canStart ? '✓ Ready to start!' : validation.message)
                : (!canStart ? '⏳ Waiting for host to configure characters...' : '✓ Ready to start!')}
          </p>
          {isHost && (
            <button
              style={{ ...styles.startButton, ...(!canStart ? styles.startButtonDisabled : {}) }}
              onClick={onStartGame}
              disabled={!canStart}
            >
              START GAME →
            </button>
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
  scrollArea:       { flex: 1, overflowY: 'auto', padding: SPACING.md, display: 'flex', flexDirection: 'column', gap: SPACING.lg },
  bottomBar:        { flexShrink: 0, padding: `${SPACING.md}px ${SPACING.md}px`, borderTop: '1px solid rgba(42,45,69,0.5)', backgroundColor: 'rgba(13,15,26,0.85)' },
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
  waitingMessage:   { fontSize: 13, textAlign: 'center', margin: 0, marginBottom: SPACING.sm },
  // Lady of the Lake — tappable card (mechanic card in MECHANICS section)
  lotlCard:             { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: `${SPACING.sm}px 8px`, width: '30%', minWidth: 90, backgroundColor: 'rgba(10,25,38,0.85)', border: '1px solid rgba(60,90,110,0.6)', borderRadius: 12, cursor: 'pointer', position: 'relative', transition: 'all 0.15s ease' },
  lotlCardEnabled:      { borderColor: 'rgba(80,160,210,0.7)', backgroundColor: 'rgba(15,40,60,0.95)' },
  lotlCardFrame:        { width: 60, height: 80, borderRadius: 12, overflow: 'hidden', flexShrink: 0, border: '1px solid' },
  lotlCardImage:        { width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' },
  lotlCardName:         { fontSize: 12, color: COLORS.textPrimary, textAlign: 'center', fontWeight: '600', lineHeight: '1.2' },
  lotlMechanicBadge:    { fontSize: 10, letterSpacing: '1px', fontWeight: '700', border: '1px solid', padding: '1px 5px', borderRadius: 4 },
  lotlEnabledCheck:     { position: 'absolute', top: 4, right: 4, fontSize: 14, color: 'rgba(80,200,240,0.9)' },
  // Mechanics section row — holds both mechanic cards side by side
  mechanicsRow:         { display: 'flex', flexWrap: 'wrap' as const, gap: 8 },
  // Bot card — shares lotlCard base, amber tint
  botCardEnabled:       { borderColor: 'rgba(180,130,40,0.7)', backgroundColor: 'rgba(30,20,5,0.95)' },
  botCardIconFrame:     { width: 60, height: 80, borderRadius: 12, flexShrink: 0, border: '1px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(40,28,8,0.6)' },
  botCardEmoji:         { fontSize: 28 },
  // Bot modal
  botModalIcon:         { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(50,35,8,0.6)', border: '1px solid rgba(160,120,40,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  botModalEmoji:        { fontSize: 40 },
  botModalToggleRowOn:  { borderColor: 'rgba(180,130,40,0.6)', backgroundColor: 'rgba(50,35,8,0.7)' },
  botSlotPreview:       { width: '100%', padding: `${SPACING.sm}px ${SPACING.md}px`, backgroundColor: 'rgba(40,28,8,0.5)', border: '1px solid rgba(120,90,30,0.4)', borderRadius: 10, textAlign: 'center' as const },
  botSlotText:          { fontSize: 12, color: 'rgba(200,160,60,0.8)' },
  // Lady of the Lake — modal-specific styles
  lotlModalMechanicRow:   { display: 'flex', justifyContent: 'center' },
  lotlModalMechanicBadge: { fontSize: 11, color: 'rgba(80,170,220,0.8)', letterSpacing: '3px', fontWeight: '700', backgroundColor: 'rgba(20,55,75,0.6)', padding: '3px 12px', borderRadius: 6, border: '1px solid rgba(80,150,190,0.3)' },
  lotlModalToggleRow:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: `${SPACING.sm}px ${SPACING.md}px`, backgroundColor: 'rgba(15,35,50,0.9)', border: '1px solid rgba(60,90,110,0.5)', borderRadius: 12, cursor: 'pointer' },
  lotlModalToggleRowOn:   { borderColor: 'rgba(80,160,210,0.6)', backgroundColor: 'rgba(15,50,75,0.7)' },
  lotlModalToggleLabel:   { fontSize: 15, fontWeight: '700' },
  lotlModalGuestStatus:   { width: '100%', padding: `${SPACING.sm}px ${SPACING.md}px`, backgroundColor: 'rgba(15,35,50,0.9)', border: '1px solid rgba(60,90,110,0.4)', borderRadius: 12, textAlign: 'center' },
  // Shared toggle pill (used by both character modal and LoTL modal)
  togglePill:       { width: 48, height: 26, borderRadius: 13, padding: 3, transition: 'background-color 0.2s ease', flexShrink: 0, position: 'relative' as const },
  toggleThumb:      { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', transition: 'transform 0.2s ease' },
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