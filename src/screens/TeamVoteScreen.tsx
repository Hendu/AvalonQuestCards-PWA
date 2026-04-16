// =============================================================================
// TeamVoteScreen.tsx
//
// Shown during the 'team-vote' phase.
//
// All players simultaneously vote to approve or reject the proposed team.
// This is different from mission voting (success/fail) — here the votes
// are public after reveal and the flip card mechanic uses approve/reject tokens.
//
// Flow:
//   1. All players see the proposed team roster
//   2. Each player taps Approve or Reject (their own device, privately)
//   3. After voting: "Waiting for others..."
//   4. When all votes are in, auto-resolves (host's device calls resolveTeamVote)
//   5. Moves to team-vote-results to reveal who voted what
// =============================================================================

import React from 'react';
import { Player } from '../utils/firebaseGame';
import { CharacterName } from '../utils/gameLogic';
import { COLORS, SPACING, WAITING_PULSE_STYLE } from '../utils/theme';
import QuitButton from '../components/QuitButton';
import CharacterBadge from '../components/CharacterBadge';

interface TeamVoteScreenProps {
  players:              Player[];
  missionPlayerIds:     string[];
  proposalVotes:        Record<string, boolean>;
  myDeviceId:           string;
  myCharacter:          CharacterName | null;
  myName:               string;
  leaderName:           string;
  currentQuest:         number;
  proposalCount:        number;
  totalPlayers:         number;
  haveICastProposalVote: boolean;
  onVote:               (approve: boolean) => void;
  onResetGame:          () => void;
  isHost:               boolean;
  soundEnabled:         boolean;
  onToggleSound:        () => void;
  leaderDeviceId:       string;
  characters:           Record<string, CharacterName>;
}

function getPlayerName(players: Player[], deviceId: string): string {
  const p = players.find(function(pl) { return pl.deviceId === deviceId; });
  return p ? p.name : 'Unknown';
}

export default function TeamVoteScreen(props: TeamVoteScreenProps) {
  const {
    players, missionPlayerIds, proposalVotes,
    myDeviceId, myCharacter, myName,
    leaderName, currentQuest, proposalCount, totalPlayers,
    haveICastProposalVote, isHost, onVote, onResetGame, soundEnabled, onToggleSound,
    leaderDeviceId, characters,
  } = props;

  const votesIn  = Object.keys(proposalVotes).length;
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
          <span style={styles.topBarTitle}>QUEST {currentQuest} · TEAM VOTE</span>
          <div style={styles.topBarRight}>
            {myCharacter && <CharacterBadge character={myCharacter} players={players} characters={characters} myDeviceId={myDeviceId} />}
            <QuitButton onConfirm={onResetGame} isHost={isHost} />
          </div>
        </div>

        <div style={styles.scrollArea}>

          {/* Leader / proposal info */}
          <div style={styles.proposalBox}>
            <p style={styles.proposalLabel}>
              PROPOSAL {proposalCount + 1} OF 5 · PROPOSED BY {leaderName.toUpperCase()}
            </p>
          </div>

          {/* Proposed team */}
          <div style={styles.teamBox}>
            <p style={styles.teamLabel}>PROPOSED TEAM</p>
            {missionPlayerIds.map(function(id) {
              const name = getPlayerName(players, id);
              return (
                <div key={id} style={styles.teamMemberRow}>
                  <span style={styles.teamMemberName}>{name}{id === leaderDeviceId ? ' 👑' : ''}</span>
                  <span style={styles.teamMemberBadge}>⚔️</span>
                </div>
              );
            })}
          </div>

          {/* Vote progress */}
          <div style={styles.progressBox}>
            <p style={styles.progressText}>{votesIn} of {totalPlayers} votes cast</p>
            <div style={styles.progressDots}>
              {players.map(function(player) {
                const hasVoted = player.deviceId in proposalVotes;
                return (
                  <div
                    key={player.deviceId}
                    style={{
                      ...styles.progressDot,
                      backgroundColor: hasVoted ? COLORS.gold : 'rgba(42,45,69,0.6)',
                    }}
                  />
                );
              })}
            </div>
          </div>

          <div style={styles.divider} />

        </div>

        {/* Fixed bottom bar -- vote buttons must always be reachable */}
        <div style={styles.bottomBar}>
          {!haveICastProposalVote ? (
            <div style={styles.voteSection}>
              <p style={styles.votePrompt}>Do you approve this team?</p>
              <p style={styles.voteHint}>Your vote is secret until all votes are in.</p>
              <div style={styles.voteButtons}>
                <button style={styles.approveButton} onClick={function() { onVote(true); }}>
                  <span style={styles.approveLabel}>APPROVE</span>
                  <img src="/assets/images/tokens/approve.svg" style={styles.tokenImage} alt="Approve" />
                </button>
                <button style={styles.rejectButton} onClick={function() { onVote(false); }}>
                  <span style={styles.rejectLabel}>REJECT</span>
                  <img src="/assets/images/tokens/reject.svg" style={styles.tokenImage} alt="Reject" />
                </button>
              </div>
            </div>
          ) : (
            <div style={styles.votedBox}>
              <p style={styles.votedText}>✓ Your vote is cast</p>
              <p style={{ ...styles.votedHint, ...WAITING_PULSE_STYLE }}>Waiting for others...</p>
            </div>
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
  proposalBox: {
    padding: `${SPACING.sm}px ${SPACING.md}px`,
    backgroundColor: 'rgba(22,24,38,0.7)',
    borderRadius: 10, border: `1px solid ${COLORS.border}`, textAlign: 'center',
  },
  proposalLabel: { fontSize: 11, color: COLORS.textMuted, letterSpacing: '2px', margin: 0, fontWeight: '600' },
  teamBox: {
    padding: SPACING.md, backgroundColor: 'rgba(22,24,38,0.85)',
    borderRadius: 12, border: `1px solid ${COLORS.border}`,
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  teamLabel: { fontSize:  11, color: COLORS.gold, letterSpacing: '3px', fontWeight: '700', margin: '0 0 4px 0' },
  teamMemberRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', backgroundColor: 'rgba(13,15,26,0.4)', borderRadius: 8 },
  teamMemberName: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  teamMemberBadge: { fontSize: 14 },
  progressBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  progressText: { fontSize: 13, color: COLORS.textMuted, margin: 0 },
  progressDots: { display: 'flex', gap: 8 },
  progressDot: { width: 12, height: 12, borderRadius: '50%', transition: 'background-color 0.3s ease' },
  divider: { height: 1, backgroundColor: 'rgba(42,45,69,0.6)' },
  voteSection: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACING.md },
  votePrompt: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, textAlign: 'center', margin: 0 },
  voteHint: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', margin: 0 },
  voteButtons: { display: 'flex', gap: SPACING.lg, justifyContent: 'center', width: '100%' },
  approveButton: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACING.sm,
    padding: SPACING.md, backgroundColor: 'rgba(13,42,30,0.85)',
    border: `2px solid ${COLORS.goodDim}`, borderRadius: 16, cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  rejectButton: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACING.sm,
    padding: SPACING.md, backgroundColor: 'rgba(42,13,13,0.85)',
    border: `2px solid ${COLORS.evilDim}`, borderRadius: 16, cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  tokenImage: { width: 80, height: 80, objectFit: 'contain' },
  approveLabel: { fontSize: 13, fontWeight: '800', color: COLORS.good, letterSpacing: '2px' },
  rejectLabel:  { fontSize: 13, fontWeight: '800', color: COLORS.evil, letterSpacing: '2px' },
  votedBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACING.sm, padding: SPACING.xl },
  votedText: { fontSize: 18, fontWeight: '700', color: COLORS.good, margin: 0 },
  votedHint: { fontSize: 14, color: COLORS.textMuted, margin: 0 },
};
