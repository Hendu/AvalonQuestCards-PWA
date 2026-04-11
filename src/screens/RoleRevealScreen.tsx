// =============================================================================
// RoleRevealScreen.tsx
//
// Each player privately sees their character card on their own device.
// Stripped down -- the card is the star, redundant text removed.
// Below the card: role description and who you can see. That's it.
// =============================================================================

import React from 'react';
import {
  CharacterName,
  CharacterVisionEntry,
  CHARACTERS,
  getCharacterVision,
} from '../utils/gameLogic';
import { Player } from '../utils/firebaseGame';
import { COLORS, SPACING } from '../utils/theme';

interface RoleRevealScreenProps {
  myCharacter:         CharacterName;
  myDeviceId:          string;
  players:             Player[];
  characters:          Record<string, CharacterName>;
  confirmedRoleReveal: string[];
  totalPlayers:        number;
  onConfirm:           () => void;
}

function getPlayerName(players: Player[], deviceId: string): string {
  const p = players.find(function(pl) { return pl.deviceId === deviceId; });
  return p ? p.name : 'Unknown';
}

export default function RoleRevealScreen(props: RoleRevealScreenProps) {
  const {
    myCharacter, myDeviceId, players, characters,
    confirmedRoleReveal, totalPlayers, onConfirm,
  } = props;

  const info           = CHARACTERS[myCharacter];
  const hasConfirmed   = confirmedRoleReveal.includes(myDeviceId);
  const confirmedCount = confirmedRoleReveal.length;
  // Sort by deviceId so the list order is stable regardless of Firestore object key iteration order
  const vision: CharacterVisionEntry[] = getCharacterVision(myCharacter, myDeviceId, characters)
    .sort(function(a, b) { return a.deviceId.localeCompare(b.deviceId); });
  const imageName = myCharacter.replace(/ /g, '_');

  return (
    <div style={{ ...styles.screen, backgroundImage: 'url(/assets/images/normal_background.png)' }}>
      <div style={styles.overlay} />
      <div style={styles.content}>

        <div style={styles.header}>
          <p style={styles.headerLabel}>YOUR CHARACTER</p>
          <p style={styles.headerHint}>This screen is private — don't show others!</p>
        </div>

        <div style={styles.scrollArea}>

          {/* Card -- large, centered, the whole point of this screen */}
          <div style={{
            ...styles.cardWrapper,
            borderColor:     info.alignment === 'good' ? COLORS.goodDim : COLORS.evilDim,
            backgroundColor: info.alignment === 'good'
              ? 'rgba(13,42,30,0.88)'
              : 'rgba(42,13,13,0.88)',
          }}>
            {/* Cropping frame -- uniform rounded rect regardless of source image dimensions */}
            <div style={{ ...styles.cardFrame, borderColor: info.alignment === 'good' ? COLORS.goodDim : COLORS.evilDim }}>
              <img
                src={`/assets/images/characters/${imageName}.png`}
                style={styles.cardImage}
                alt={myCharacter}
              />
            </div>
          </div>

          {/* Role description */}
          <div style={styles.descriptionBox}>
            <p style={styles.descriptionLabel}>YOUR ROLE</p>
            <p style={styles.description}>{info.description}</p>
          </div>

          {/* Who you can see */}
          {vision.length > 0 && (
            <div style={styles.visionBox}>
              <p style={styles.visionLabel}>YOU CAN SEE</p>
              {vision.map(function(entry) {
                return (
                  <div key={entry.deviceId} style={styles.visionRow}>
                    <span style={styles.visionName}>
                      {getPlayerName(players, entry.deviceId)}
                    </span>
                    <span style={styles.visionLabel2}>{entry.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {vision.length === 0 && (
            <div style={styles.visionBox}>
              <p style={styles.visionLabel}>YOU CAN SEE</p>
              <p style={styles.visionNobody}>Nobody — trust no one.</p>
            </div>
          )}

        </div>

        {/* Fixed bottom bar */}
        <div style={styles.bottomBar}>
          {!hasConfirmed ? (
            <button style={styles.confirmButton} onClick={onConfirm}>
              I UNDERSTAND MY ROLE →
            </button>
          ) : (
            <div style={styles.waitingBox}>
              <p style={styles.waitingText}>✓ Ready</p>
              <p style={styles.waitingProgress}>
                {confirmedCount} of {totalPlayers} players ready
              </p>
              <div style={styles.progressBar}>
                <div style={{
                  ...styles.progressFill,
                  width: `${(confirmedCount / totalPlayers) * 100}%`,
                }} />
              </div>
              <p style={styles.waitingHint}>Waiting for others to confirm their role...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  screen: {
    width: '100%', height: '100%',
    backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative',
  },
  overlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.78)' },
  content: { position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column' },
  header: {
    padding: `${SPACING.md}px ${SPACING.md}px ${SPACING.sm}px`,
    borderBottom: '1px solid rgba(42,45,69,0.8)',
    backgroundColor: 'rgba(13,15,26,0.7)',
    flexShrink: 0, textAlign: 'center',
  },
  headerLabel: { fontSize: 13, color: COLORS.gold, letterSpacing: '3px', fontWeight: '700', margin: 0 },
  headerHint:  { fontSize: 12, color: COLORS.textSecondary, margin: '2px 0 0 0', fontStyle: 'italic' },
  scrollArea: {
    flex: 1, overflowY: 'auto', padding: SPACING.md,
    display: 'flex', flexDirection: 'column', gap: SPACING.lg,
  },
  bottomBar: {
    flexShrink: 0, padding: `${SPACING.md}px ${SPACING.md}px`,
    borderTop: '1px solid rgba(42,45,69,0.5)', backgroundColor: 'rgba(13,15,26,0.85)',
  },
  // Card fills much more of the screen now -- no text below it to compete
  cardWrapper: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: SPACING.lg, borderRadius: 20, border: '1px solid',
  },
  cardFrame: {
    width:        280,
    height:       420,
    borderRadius: 16,
    overflow:     'hidden',
    flexShrink:   0,
    border:       '1px solid',
  },
  cardImage: {
    width:          '100%',
    height:         '100%',
    objectFit:      'cover',
    objectPosition: 'center top',
    display:        'block',
  },
  descriptionBox: {
    padding: SPACING.md, backgroundColor: 'rgba(22,24,38,0.85)',
    borderRadius: 12, border: `1px solid ${COLORS.border}`,
  },
  descriptionLabel: { fontSize: 11, color: COLORS.textSecondary, letterSpacing: '3px', fontWeight: '700', margin: '0 0 6px 0' },
  description:      { fontSize: 15, color: COLORS.textPrimary, lineHeight: '1.6', margin: 0 },
  visionBox: {
    padding: SPACING.md, backgroundColor: 'rgba(22,24,38,0.85)',
    borderRadius: 12, border: `1px solid ${COLORS.border}`,
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  visionLabel:  { fontSize: 11, color: COLORS.textSecondary, letterSpacing: '3px', fontWeight: '700', margin: 0 },
  visionRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: `6px ${SPACING.sm}px`, backgroundColor: 'rgba(13,15,26,0.5)', borderRadius: 8,
  },
  visionName:   { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary },
  visionLabel2: { fontSize: 13, color: COLORS.textSecondary, fontStyle: 'italic' },
  visionNobody: { fontSize: 14, color: COLORS.textSecondary, fontStyle: 'italic', margin: 0 },
  confirmButton: {
    width: '100%', padding: `${SPACING.md}px`, backgroundColor: COLORS.gold,
    border: 'none', borderRadius: 20, fontSize: 15, fontWeight: '800',
    color: COLORS.bgDark, letterSpacing: '2px', cursor: 'pointer',
  },
  waitingBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACING.sm,
    padding: SPACING.lg, backgroundColor: 'rgba(22,24,38,0.85)',
    borderRadius: 12, border: `1px solid ${COLORS.border}`,
  },
  waitingText:     { fontSize: 16, fontWeight: '700', color: COLORS.good, margin: 0 },
  waitingProgress: { fontSize: 13, color: COLORS.textSecondary, margin: 0 },
  progressBar: {
    width: '100%', height: 6, backgroundColor: 'rgba(42,45,69,0.6)',
    borderRadius: 3, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', backgroundColor: COLORS.good,
    borderRadius: 3, transition: 'width 0.4s ease',
  },
  waitingHint: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', margin: 0 },
};