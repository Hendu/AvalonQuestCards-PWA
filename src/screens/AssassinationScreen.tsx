// =============================================================================
// AssassinationScreen.tsx
//
// Shown during the 'assassination' phase.
//
// Good has won 3 quests but the Assassin gets one final chance.
//
// What all players see:
//   - The evil team is publicly revealed (names + their characters)
//   - "The Assassin is choosing..." message for non-Assassins
//
// What the Assassin sees:
//   - All good players listed (excluding themselves)
//   - Tap to select who they think Merlin is
//   - Confirm button
//
// After submission, the result resolves immediately and everyone goes to gameover.
// =============================================================================

import React, { useState } from 'react';
import { Player } from '../utils/firebaseGame';
import { CharacterName, CHARACTERS } from '../utils/gameLogic';
import { COLORS, SPACING, WAITING_PULSE_STYLE } from '../utils/theme';
import QuitButton from '../components/QuitButton';
import CharacterBadge from '../components/CharacterBadge';

interface AssassinationScreenProps {
  players:           Player[];
  characters:        Record<string, CharacterName>;
  myDeviceId:        string;
  myCharacter:       CharacterName | null;
  amIAssassin:       boolean;
  onSubmitTarget:    (targetDeviceId: string) => void;
  onResetGame:       () => void;
  isHost:           boolean;
}

function getPlayerName(players: Player[], deviceId: string): string {
  const p = players.find(function(pl) { return pl.deviceId === deviceId; });
  return p ? p.name : 'Unknown';
}

export default function AssassinationScreen(props: AssassinationScreenProps) {
  const {
    players, characters, myDeviceId, myCharacter,
    amIAssassin, isHost, onSubmitTarget, onResetGame,
  } = props;

  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  // Find the evil team for public reveal
  const evilPlayers = players.filter(function(p) {
    const char = characters[p.deviceId];
    return char && CHARACTERS[char].alignment === 'evil';
  });

  // Good players the Assassin can pick from (everyone who isn't evil, excluding assassin themselves)
  const goodTargets = players.filter(function(p) {
    const char = characters[p.deviceId];
    return char && CHARACTERS[char].alignment === 'good';
  });

  // Find assassin name
  const assassinPlayer = players.find(function(p) { return characters[p.deviceId] === 'Assassin'; });
  const assassinName   = assassinPlayer ? assassinPlayer.name : 'The Assassin';

  function handleConfirm() {
    if (selectedTargetId) {
      onSubmitTarget(selectedTargetId);
    }
  }

  return (
    <div style={{ ...styles.screen, backgroundImage: 'url(/assets/images/normal_background.png)' }}>
      <div style={styles.overlay} />
      <div style={styles.content}>

        {/* Top bar */}
        <div style={styles.topBar}>
          <span style={styles.topBarTitle}>ASSASSINATION</span>
          <div style={styles.topBarRight}>
            {myCharacter && <CharacterBadge character={myCharacter} />}
            <QuitButton onConfirm={onResetGame} isHost={isHost} />
          </div>
        </div>

        <div style={styles.scrollArea}>

          {/* Dramatic header */}
          <div style={styles.dramaticHeader}>
            <p style={styles.dramaticTitle}>⚔️ GOOD HAS PREVAILED...</p>
            <p style={styles.dramaticSubtitle}>
              But the Assassin has one final chance. If they identify Merlin, Evil still wins.
            </p>
          </div>

          {/* Evil team reveal -- shown to everyone */}
          <div style={styles.revealBox}>
            <p style={styles.revealLabel}>THE EVIL TEAM IS REVEALED</p>
            {evilPlayers.map(function(player) {
              const charName = characters[player.deviceId];
              const charInfo = charName ? CHARACTERS[charName] : null;
              return (
                <div key={player.deviceId} style={styles.evilRevealRow}>
                  <span style={styles.evilPlayerName}>{player.name}</span>
                  <span style={styles.evilCharacterName}>{charName}</span>
                </div>
              );
            })}
          </div>

          <div style={styles.divider} />

          {/* Assassin's UI */}
          {amIAssassin ? (
            <div style={styles.assassinSection}>
              <p style={styles.assassinPrompt}>
                Choose who you believe is <strong style={{ color: COLORS.good }}>Merlin</strong>:
              </p>

              <div style={styles.targetList}>
                {goodTargets.map(function(player) {
                  const isSelected = selectedTargetId === player.deviceId;
                  return (
                    <button
                      key={player.deviceId}
                      style={{
                        ...styles.targetButton,
                        ...(isSelected ? styles.targetButtonSelected : {}),
                      }}
                      onClick={function() { setSelectedTargetId(player.deviceId); }}
                    >
                      <span style={{
                        ...styles.targetName,
                        ...(isSelected ? styles.targetNameSelected : {}),
                      }}>
                        {player.name}
                      </span>
                      {isSelected && <span style={styles.targetCheck}>🗡️</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={styles.waitingSection}>
              <p style={styles.waitingText}>
                🗡️ <strong style={{ color: COLORS.evil }}>{assassinName}</strong> is choosing their target...
              </p>
              <p style={styles.waitingHint}>
                Good players: keep your poker face. Merlin, stay calm.
              </p>
            </div>
          )}

        </div>

        {/* Fixed bottom bar */}
        <div style={styles.bottomBar}>
          {amIAssassin ? (
            <button
              style={{
                ...styles.confirmButton,
                ...(!selectedTargetId ? styles.confirmButtonDisabled : {}),
              }}
              onClick={handleConfirm}
              disabled={!selectedTargetId}
            >
              ASSASSINATE →
            </button>
          ) : (
            <p style={{ ...styles.waitingBottomText, ...WAITING_PULSE_STYLE }}>
              🗡️ Waiting for <strong style={{ color: COLORS.evil }}>{assassinName}</strong> to strike...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  screen: { width: '100%', height: '100%', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' },
  overlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)' },
  content: { position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column' },
  topBar: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: `${SPACING.sm}px ${SPACING.md}px`,
    borderBottom: '1px solid rgba(42,45,69,0.8)', backgroundColor: 'rgba(13,15,26,0.7)', flexShrink: 0,
  },
  topBarTitle: { fontSize: 11, color: COLORS.evil, letterSpacing: '3px', fontWeight: '600' },
  topBarRight: { display: 'flex', alignItems: 'center', gap: SPACING.sm },
  iconButton: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: COLORS.textPrimary, padding: '4px 8px' },
  scrollArea: { flex: 1, overflowY: 'auto', padding: SPACING.md, display: 'flex', flexDirection: 'column', gap: SPACING.lg },
  bottomBar: { flexShrink: 0, padding: `${SPACING.md}px ${SPACING.md}px`, borderTop: '1px solid rgba(42,45,69,0.5)', backgroundColor: 'rgba(13,15,26,0.85)' },
  waitingBottomText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' as const, margin: 0 },
  dramaticHeader: { textAlign: 'center', display: 'flex', flexDirection: 'column', gap: SPACING.sm },
  dramaticTitle: { fontSize: 22, fontWeight: '800', color: COLORS.good, letterSpacing: '2px', textShadow: '0 2px 12px rgba(0,0,0,0.9)', margin: 0 },
  dramaticSubtitle: { fontSize: 14, color: COLORS.textSecondary, lineHeight: '1.6', margin: 0 },
  revealBox: {
    padding: SPACING.md, backgroundColor: 'rgba(42,13,13,0.88)',
    borderRadius: 12, border: `1px solid ${COLORS.evilDim}`,
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  revealLabel: { fontSize:  11, color: COLORS.evil, letterSpacing: '3px', fontWeight: '700', margin: '0 0 4px 0' },
  evilRevealRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 10px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 8,
  },
  evilPlayerName: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  evilCharacterName: { fontSize: 12, color: COLORS.evil, fontStyle: 'italic' },
  divider: { height: 1, backgroundColor: 'rgba(42,45,69,0.6)' },
  assassinSection: { display: 'flex', flexDirection: 'column', gap: SPACING.md },
  assassinPrompt: { fontSize: 16, color: COLORS.textPrimary, textAlign: 'center', margin: 0 },
  targetList: { display: 'flex', flexDirection: 'column', gap: 8 },
  targetButton: {
    width: '100%', padding: `${SPACING.md}px`,
    backgroundColor: 'rgba(22,24,38,0.85)', border: `1px solid ${COLORS.border}`,
    borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    cursor: 'pointer', transition: 'all 0.15s ease',
  },
  targetButtonSelected: { backgroundColor: 'rgba(42,13,13,0.95)', borderColor: COLORS.evil },
  targetName: { fontSize: 16, fontWeight: '600', color: COLORS.textMuted },
  targetNameSelected: { color: COLORS.textPrimary },
  targetCheck: { fontSize: 18 },
  confirmButton: {
    width: '100%', padding: `${SPACING.md}px`, backgroundColor: COLORS.evil,
    border: 'none', borderRadius: 20, fontSize: 15, fontWeight: '800',
    color: '#fff', letterSpacing: '3px', cursor: 'pointer',
  },
  confirmButtonDisabled: { opacity: 0.4, cursor: 'default' },
  waitingSection: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACING.md, padding: SPACING.xl },
  waitingText: { fontSize: 16, color: COLORS.textPrimary, textAlign: 'center', margin: 0 },
  waitingHint: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', fontStyle: 'italic', margin: 0 },
};
