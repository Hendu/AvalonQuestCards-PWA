// =============================================================================
// LobbyScreen.tsx
//
// Waiting room shown after creating or joining a room.
//
// HOST sees:
//   - Room code to share
//   - List of players who have joined (updates live)
//   - "Start Game" button -- only enabled when player count matches totalPlayers
//
// GUESTS see:
//   - The room code they joined
//   - Same live player list
//   - "Waiting for host to start..."
// =============================================================================

import React from 'react';
import { Player } from '../utils/firebaseGame';
import { COLORS, SPACING } from '../utils/theme';

interface LobbyScreenProps {
  roomCode:     string;
  isHost:       boolean;
  players:      Player[];
  totalPlayers: number;
  myDeviceId:   string;
  onStartGame:  () => void;
  onLeave:      () => void;
}

export default function LobbyScreen(props: LobbyScreenProps) {
  const { roomCode, isHost, players, totalPlayers, myDeviceId, onStartGame, onLeave } = props;

  const canStart     = isHost && players.length === totalPlayers;
  const playersNeeded = totalPlayers - players.length;

  return (
    <div style={styles.screen}>
      <div style={styles.card}>

        {/* Room code */}
        <p style={styles.label}>ROOM CODE</p>
        <p style={styles.roomCode}>{roomCode}</p>
        <p style={styles.hint}>Share this with your friends</p>

        <div style={styles.divider} />

        {/* Player roster -- live updating */}
        <p style={styles.label}>
          PLAYERS ({players.length} / {totalPlayers})
        </p>

        <div style={styles.playerList}>
          {players.map(function(player) {
            const isMe   = player.deviceId === myDeviceId;
            const isHost2 = player.deviceId === players[0]?.deviceId;
            return (
              <div key={player.deviceId} style={styles.playerRow}>
                <span style={styles.playerName}>
                  {player.name}
                  {isMe    ? ' (you)'   : ''}
                  {isHost2 ? ' 👑' : ''}
                </span>
                <span style={styles.playerReady}>✓</span>
              </div>
            );
          })}

          {/* Empty slots */}
          {Array.from({ length: playersNeeded }).map(function(_, i) {
            return (
              <div key={`empty-${i}`} style={styles.playerRowEmpty}>
                <span style={styles.playerNameEmpty}>Waiting...</span>
              </div>
            );
          })}
        </div>

        <div style={styles.divider} />

        {isHost ? (
          <>
            {!canStart && (
              <p style={styles.hint}>
                Waiting for {playersNeeded} more player{playersNeeded !== 1 ? 's' : ''} to join...
              </p>
            )}
            <button
              style={{
                ...styles.startButton,
                ...(!canStart ? styles.startButtonDisabled : {}),
              }}
              onClick={onStartGame}
              disabled={!canStart}
            >
              START GAME
            </button>
          </>
        ) : (
          <p style={styles.waitingText}>⏳ Waiting for host to start the game...</p>
        )}

        <button style={styles.leaveButton} onClick={onLeave}>
          LEAVE ROOM
        </button>

      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  screen: {
    width:              '100%',
    height:             '100%',
    backgroundImage:    'url(/assets/images/normal_background.png)',
    backgroundSize:     'cover',
    backgroundPosition: 'center',
    display:            'flex',
    alignItems:         'center',
    justifyContent:     'center',
    padding:            SPACING.lg,
  },
  card: {
    width:           '100%',
    maxWidth:        380,
    backgroundColor: 'rgba(13, 15, 26, 0.94)',
    borderRadius:    20,
    border:          `1px solid ${COLORS.border}`,
    padding:         SPACING.xl,
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    gap:             SPACING.md,
    maxHeight:       '90vh',
    overflowY:       'auto',
  },
  label: {
    fontSize:      10,
    color:         COLORS.textMuted,
    letterSpacing: '3px',
    textTransform: 'uppercase',
    margin:        0,
    textAlign:     'center',
  },
  roomCode: {
    fontSize:      44,
    fontWeight:    '800',
    color:         COLORS.gold,
    letterSpacing: '10px',
    margin:        0,
    textAlign:     'center',
  },
  hint: {
    fontSize:  12,
    color:     COLORS.textMuted,
    margin:    0,
    textAlign: 'center',
  },
  divider: {
    width:           '100%',
    height:          1,
    backgroundColor: COLORS.border,
  },
  playerList: {
    width:         '100%',
    display:       'flex',
    flexDirection: 'column',
    gap:           8,
  },
  playerRow: {
    display:         'flex',
    justifyContent:  'space-between',
    alignItems:      'center',
    padding:         `${SPACING.sm}px ${SPACING.md}px`,
    backgroundColor: 'rgba(30, 33, 54, 0.8)',
    borderRadius:    8,
    border:          `1px solid ${COLORS.border}`,
  },
  playerName: {
    fontSize:   15,
    color:      COLORS.textPrimary,
    fontWeight: '600',
  },
  playerReady: {
    fontSize: 14,
    color:    COLORS.good,
  },
  playerRowEmpty: {
    display:         'flex',
    padding:         `${SPACING.sm}px ${SPACING.md}px`,
    backgroundColor: 'rgba(13, 15, 26, 0.5)',
    borderRadius:    8,
    border:          `1px dashed ${COLORS.border}`,
  },
  playerNameEmpty: {
    fontSize: 14,
    color:    COLORS.textMuted,
    fontStyle:'italic',
  },
  startButton: {
    width:           '100%',
    padding:         `${SPACING.md}px`,
    backgroundColor: COLORS.gold,
    border:          'none',
    borderRadius:    20,
    fontSize:        16,
    fontWeight:      '800',
    color:           COLORS.bgDark,
    letterSpacing:   '4px',
    cursor:          'pointer',
  },
  startButtonDisabled: {
    opacity: 0.4,
    cursor:  'default',
  },
  waitingText: {
    fontSize:  14,
    color:     COLORS.textSecondary,
    textAlign: 'center',
    margin:    0,
  },
  leaveButton: {
    background:    'none',
    border:        'none',
    color:         COLORS.textMuted,
    fontSize:      12,
    letterSpacing: '2px',
    cursor:        'pointer',
    padding:       '4px 8px',
    textTransform: 'uppercase',
  },
};
