// =============================================================================
// TeamVoteResultsScreen.tsx
//
// Shown during the 'team-vote-results' phase.
//
// After all proposal votes are cast, everyone sees:
//   - Whether the team was approved or rejected
//   - A table of every player's vote (approve/reject) with their name
//   - The approve/reject counts
//   - If approved: "Proceeding to mission" (host taps continue)
//   - If rejected: this phase is skipped (resolveTeamVote goes straight back to team-propose)
//
// NOTE: The rejected path never reaches this screen -- the host's auto-resolve
// goes directly back to team-propose on rejection. This screen is only shown
// for APPROVED proposals, so we can show "Proceeding to mission" exclusively.
// =============================================================================

import React from 'react';
import { Player } from '../utils/firebaseGame';
import { CharacterName } from '../utils/gameLogic';
import { COLORS, SPACING, WAITING_PULSE_STYLE } from '../utils/theme';
import QuitButton from '../components/QuitButton';
import CharacterBadge from '../components/CharacterBadge';

interface TeamVoteResultsScreenProps {
  players:          Player[];
  proposalVotes:    Record<string, boolean>;
  missionPlayerIds: string[];
  myCharacter:      CharacterName | null;
  isHost:           boolean;
  approveCount:     number;
  rejectCount:      number;
  approved:         boolean;   // v4.1.1: passed from Firestore, not derived locally
  onContinue:       () => void;
  onResetGame:      () => void;
  soundEnabled:     boolean;
  onToggleSound:    () => void;
  leaderDeviceId:   string;
  characters:       Record<string, CharacterName>;
  myDeviceId:       string;
}

function getPlayerName(players: Player[], deviceId: string): string {
  const p = players.find(function(pl) { return pl.deviceId === deviceId; });
  return p ? p.name : 'Unknown';
}

export default function TeamVoteResultsScreen(props: TeamVoteResultsScreenProps) {
  const {
    players, proposalVotes, missionPlayerIds, myCharacter,
    isHost, approveCount, rejectCount, approved, onContinue, onResetGame,
    soundEnabled, onToggleSound, leaderDeviceId, characters, myDeviceId,
  } = props;

  const total = approveCount + rejectCount;

  const missionPlayerNames = missionPlayerIds.map(function(id) {
    return getPlayerName(players, id);
  });

  return (
    <div style={{ ...styles.screen, backgroundImage: 'url(/assets/images/normal_background.png)' }}>
      <div style={styles.overlay} />
      <div style={styles.content}>

        {/* Top bar */}
        <div style={styles.topBar}>
          <button style={styles.iconButton} onClick={onToggleSound}>{soundEnabled ? '🔊' : '🔇'}</button>
          <span style={styles.topBarTitle}>TEAM VOTE RESULTS</span>
          <div style={styles.topBarRight}>
            {myCharacter && <CharacterBadge character={myCharacter} players={players} characters={characters} myDeviceId={myDeviceId} />}
            <QuitButton onConfirm={onResetGame} isHost={isHost} />
          </div>
        </div>

        <div style={styles.scrollArea}>

          {/* Result banner */}
          <div style={{
            ...styles.resultBanner,
            borderColor:     approved ? COLORS.goodDim : COLORS.evilDim,
            backgroundColor: approved ? 'rgba(13,42,30,0.88)' : 'rgba(42,13,13,0.88)',
          }}>
            <span style={styles.resultEmoji}>{approved ? '✅' : '❌'}</span>
            <h2 style={{
              ...styles.resultTitle,
              color: approved ? COLORS.good : COLORS.evil,
            }}>
              {approved ? 'TEAM APPROVED' : 'TEAM REJECTED'}
            </h2>
            <p style={styles.resultCounts}>
              {approveCount} approve · {rejectCount} reject
            </p>
          </div>

          {/* Proposed team — show regardless of outcome */}
          <div style={{
            ...styles.missionTeamBox,
            borderColor: approved ? COLORS.goodDim : COLORS.evilDim,
          }}>
            <p style={styles.missionTeamLabel}>
              {approved ? 'GOING ON THE MISSION' : 'REJECTED TEAM'}
            </p>
            {missionPlayerIds.map(function(id) {
              const name = getPlayerName(players, id);
              return (
                <div key={id} style={styles.missionMemberRow}>
                  <span style={styles.missionMemberName}>{name}{id === leaderDeviceId ? ' 👑' : ''}</span>
                  <span style={styles.missionMemberIcon}>{approved ? '⚔️' : '✕'}</span>
                </div>
              );
            })}
          </div>

          {/* Vote table: who voted what */}
          <div style={styles.voteTable}>
            <p style={styles.voteTableLabel}>ALL VOTES</p>
            {players.map(function(player) {
              const vote        = proposalVotes[player.deviceId];
              const votedApprove = vote === true;
              const votedReject  = vote === false;
              const pending      = vote === undefined;
              return (
                <div key={player.deviceId} style={styles.voteRow}>
                  <span style={styles.voteName}>{player.name}{player.deviceId === leaderDeviceId ? ' 👑' : ''}</span>
                  <div style={styles.voteTokenWrapper}>
                    <span style={{
                      ...styles.voteLabel,
                      color: votedApprove ? COLORS.good : votedReject ? COLORS.evil : COLORS.textMuted,
                    }}>
                      {pending ? '—' : votedApprove ? 'Approve' : 'Reject'}
                    </span>
                    {!pending && (
                      <img
                        src={`/assets/images/tokens/${votedApprove ? 'approve' : 'reject'}.svg`}
                        style={styles.voteTokenImage}
                        alt={votedApprove ? 'Approve' : 'Reject'}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        {/* Fixed bottom bar */}
        <div style={styles.bottomBar}>
          {isHost ? (
            <button style={styles.continueButton} onClick={onContinue}>
              {approved ? 'PROCEED TO MISSION →' : 'BACK TO PROPOSALS →'}
            </button>
          ) : (
            <p style={{ ...styles.guestWaiting, ...WAITING_PULSE_STYLE }}>
              ⏳ Waiting for host to continue...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  screen: { width: '100%', height: '100%', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' },
  overlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.70)' },
  content: { position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column' },
  topBar: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: `${SPACING.sm}px ${SPACING.md}px`,
    borderBottom: '1px solid rgba(42,45,69,0.8)', backgroundColor: 'rgba(13,15,26,0.7)', flexShrink: 0,
  },
  topBarTitle: { fontSize: 11, color: COLORS.textMuted, letterSpacing: '3px', fontWeight: '600' },
  topBarRight: { display: 'flex', alignItems: 'center', gap: SPACING.sm },
  iconButton: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: COLORS.textPrimary, padding: '4px 8px' },
  scrollArea: { flex: 1, overflowY: 'auto', padding: SPACING.md, display: 'flex', flexDirection: 'column', gap: SPACING.lg },
  bottomBar: { flexShrink: 0, padding: `${SPACING.md}px ${SPACING.md}px`, borderTop: '1px solid rgba(42,45,69,0.5)', backgroundColor: 'rgba(13,15,26,0.85)' },
  resultBanner: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACING.sm,
    padding: SPACING.lg, borderRadius: 20, border: '1px solid',
  },
  resultEmoji: { fontSize: 40 },
  resultTitle: { fontSize: 26, fontWeight: '800', letterSpacing: '3px', margin: 0 },
  resultCounts: { fontSize: 14, color: COLORS.textSecondary, margin: 0 },
  missionTeamBox: {
    padding: SPACING.md, backgroundColor: 'rgba(13,42,30,0.6)',
    borderRadius: 12, border: `1px solid ${COLORS.goodDim}`,
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  missionTeamLabel: { fontSize:  11, color: COLORS.good, letterSpacing: '3px', fontWeight: '700', margin: '0 0 4px 0' },
  missionMemberRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', backgroundColor: 'rgba(13,15,26,0.4)', borderRadius: 8 },
  missionMemberName: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  missionMemberIcon: { fontSize: 14 },
  voteTable: {
    padding: SPACING.md, backgroundColor: 'rgba(22,24,38,0.85)',
    borderRadius: 12, border: `1px solid ${COLORS.border}`,
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  voteTableLabel: { fontSize:  11, color: COLORS.textMuted, letterSpacing: '3px', fontWeight: '700', margin: '0 0 4px 0' },
  voteRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 10px', backgroundColor: 'rgba(13,15,26,0.4)', borderRadius: 8,
  },
  voteName: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  voteTokenWrapper: { display: 'flex', alignItems: 'center', gap: 8 },
  voteTokenImage: { width: 32, height: 32, objectFit: 'contain' },
  votePending: { fontSize: 14, color: COLORS.textMuted },
  voteLabel: { fontSize: 13, fontWeight: '600' },
  continueButton: {
    width: '100%', padding: `${SPACING.md}px`, backgroundColor: COLORS.gold,
    border: 'none', borderRadius: 20, fontSize: 14, fontWeight: '800',
    color: COLORS.bgDark, letterSpacing: '3px', cursor: 'pointer',
  },
  guestWaiting: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', margin: 0 },
};
