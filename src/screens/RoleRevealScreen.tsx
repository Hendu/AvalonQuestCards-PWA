// =============================================================================
// RoleRevealScreen.tsx
//
// Shown after the host starts the game. Each player privately sees their
// character card on their own device. They tap "I understand my role" to
// confirm. The game doesn't advance until everyone has confirmed.
//
// What's shown:
//   - The character card image (SVG placeholder, real scan later)
//   - Character name and alignment
//   - Description of what they know / their ability
//   - Who they can see (Merlin sees evil, Percival sees Merlin+Morgana, etc.)
//   - A "I understand my role" button
//   - After confirming: a waiting indicator showing how many have confirmed
//
// The character badge (small persistent indicator of your character) is
// intentionally NOT shown here since this IS the reveal screen.
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

// Helper: find a player's name by deviceId
function getPlayerName(players: Player[], deviceId: string): string {
  const p = players.find(function(pl) { return pl.deviceId === deviceId; });
  return p ? p.name : 'Unknown';
}

export default function RoleRevealScreen(props: RoleRevealScreenProps) {
  const {
    myCharacter, myDeviceId, players, characters,
    confirmedRoleReveal, totalPlayers, onConfirm,
  } = props;

  const info        = CHARACTERS[myCharacter];
  const hasConfirmed = confirmedRoleReveal.includes(myDeviceId);
  const confirmedCount = confirmedRoleReveal.length;

  // What other players can I see?
  const vision: CharacterVisionEntry[] = getCharacterVision(myCharacter, myDeviceId, characters);

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

          {/* Character card */}
          <div style={{
            ...styles.cardWrapper,
            borderColor: info.alignment === 'good' ? COLORS.goodDim : COLORS.evilDim,
            backgroundColor: info.alignment === 'good'
              ? 'rgba(13,42,30,0.88)'
              : 'rgba(42,13,13,0.88)',
          }}>
            <img
              src={`/assets/images/characters/${imageName}.svg`}
              style={styles.cardImage}
              alt={myCharacter}
            />
            <h2 style={{
              ...styles.characterName,
              color: info.alignment === 'good' ? COLORS.good : COLORS.evil,
            }}>
              {myCharacter.toUpperCase()}
            </h2>
            <p style={{
              ...styles.alignmentBadge,
              color: info.alignment === 'good' ? COLORS.good : COLORS.evil,
            }}>
              {info.alignment === 'good' ? '⚔️ Forces of Good' : '💀 Forces of Evil'}
            </p>
            <p style={styles.flavor}>{info.flavor}</p>
          </div>

          {/* Ability description */}
          <div style={styles.descriptionBox}>
            <p style={styles.descriptionLabel}>YOUR ROLE</p>
            <p style={styles.description}>{info.description}</p>
          </div>

          {/* Vision: who you can see */}
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

          {/* Confirm button / waiting state */}
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
    width:              '100%',
    height:             '100%',
    backgroundSize:     'cover',
    backgroundPosition: 'center',
    position:           'relative',
  },
  overlay: {
    position:        'absolute',
    inset:           0,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  content: {
    position:      'relative',
    zIndex:        1,
    width:         '100%',
    height:        '100%',
    display:       'flex',
    flexDirection: 'column',
  },
  header: {
    padding:         `${SPACING.md}px ${SPACING.md}px ${SPACING.sm}px`,
    borderBottom:    '1px solid rgba(42,45,69,0.8)',
    backgroundColor: 'rgba(13,15,26,0.7)',
    flexShrink:      0,
    textAlign:       'center',
  },
  headerLabel: {
    fontSize:      11,
    color:         COLORS.gold,
    letterSpacing: '3px',
    fontWeight:    '700',
    margin:        0,
  },
  headerHint: {
    fontSize:  11,
    color:     COLORS.textMuted,
    margin:    '2px 0 0 0',
    fontStyle: 'italic',
  },
  scrollArea: {
    flex:          1,
    overflowY:     'auto',
    padding:       SPACING.md,
    display:       'flex',
    flexDirection: 'column',
    gap:           SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  cardWrapper: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            SPACING.sm,
    padding:        SPACING.lg,
    borderRadius:   20,
    border:         '1px solid',
  },
  cardImage: {
    width:        140,
    height:       200,
    objectFit:    'contain',
    borderRadius: 12,
  },
  characterName: {
    fontSize:      28,
    fontWeight:    '800',
    letterSpacing: '4px',
    margin:        0,
    textAlign:     'center',
  },
  alignmentBadge: {
    fontSize:      13,
    fontWeight:    '600',
    margin:        0,
  },
  flavor: {
    fontSize:   13,
    color:      COLORS.textMuted,
    textAlign:  'center',
    fontStyle:  'italic',
    lineHeight: '1.5',
    margin:     0,
  },
  descriptionBox: {
    padding:         SPACING.md,
    backgroundColor: 'rgba(22,24,38,0.85)',
    borderRadius:    12,
    border:          `1px solid ${COLORS.border}`,
  },
  descriptionLabel: {
    fontSize:      9,
    color:         COLORS.textMuted,
    letterSpacing: '3px',
    fontWeight:    '700',
    margin:        '0 0 6px 0',
  },
  description: {
    fontSize:   14,
    color:      COLORS.textPrimary,
    lineHeight: '1.6',
    margin:     0,
  },
  visionBox: {
    padding:         SPACING.md,
    backgroundColor: 'rgba(22,24,38,0.85)',
    borderRadius:    12,
    border:          `1px solid ${COLORS.border}`,
    display:         'flex',
    flexDirection:   'column',
    gap:             6,
  },
  visionLabel: {
    fontSize:      9,
    color:         COLORS.textMuted,
    letterSpacing: '3px',
    fontWeight:    '700',
    margin:        0,
  },
  visionRow: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    padding:        `6px ${SPACING.sm}px`,
    backgroundColor: 'rgba(13,15,26,0.5)',
    borderRadius:   8,
  },
  visionName: {
    fontSize:   15,
    fontWeight: '600',
    color:      COLORS.textPrimary,
  },
  visionLabel2: {
    fontSize:   12,
    color:      COLORS.evil,
    fontStyle:  'italic',
  },
  visionNobody: {
    fontSize:  14,
    color:     COLORS.textMuted,
    fontStyle: 'italic',
    margin:    0,
  },
  confirmButton: {
    width:           '100%',
    padding:         `${SPACING.md}px`,
    backgroundColor: COLORS.gold,
    border:          'none',
    borderRadius:    20,
    fontSize:        14,
    fontWeight:      '800',
    color:           COLORS.bgDark,
    letterSpacing:   '2px',
    cursor:          'pointer',
  },
  waitingBox: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            SPACING.sm,
    padding:        SPACING.lg,
    backgroundColor: 'rgba(22,24,38,0.85)',
    borderRadius:   12,
    border:         `1px solid ${COLORS.border}`,
  },
  waitingText: {
    fontSize:   16,
    fontWeight: '700',
    color:      COLORS.good,
    margin:     0,
  },
  waitingProgress: {
    fontSize: 13,
    color:    COLORS.textSecondary,
    margin:   0,
  },
  progressBar: {
    width:           '100%',
    height:          6,
    backgroundColor: 'rgba(42,45,69,0.6)',
    borderRadius:    3,
    overflow:        'hidden',
  },
  progressFill: {
    height:          '100%',
    backgroundColor: COLORS.good,
    borderRadius:    3,
    transition:      'width 0.4s ease',
  },
  waitingHint: {
    fontSize:  12,
    color:     COLORS.textMuted,
    textAlign: 'center',
    margin:    0,
  },
};
