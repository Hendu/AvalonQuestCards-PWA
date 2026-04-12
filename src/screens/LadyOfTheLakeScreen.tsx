// =============================================================================
// LadyOfTheLakeScreen.tsx  (v4.0)
//
// TOKEN HOLDER FLOW (amILady === true):
//
//   1. SELECTION VIEW — list of eligible targets, tap to pick, Confirm button.
//
//   2. REVEAL VIEW — shown immediately after Confirm, BEFORE Firestore write.
//      Alignment is computed locally from the `characters` map.
//      Token holder sees the dramatic alignment card.
//      "Continue →" calls onSubmitInvestigation, which writes ladyResult and
//      advances phase to team-propose. Screen unmounts naturally after that.
//
//   RECONNECT CASE: if ladyResult is already set on mount (token holder
//   disconnected after investigating but before tapping Continue), skip
//   straight to the reveal view showing the stored result. Continue
//   re-submits idempotently (submitLadyResult is a set, not append).
//
// SPECTATOR VIEW (amILady === false):
//   Token holder name, ladyHistory, "Waiting for..." message.
//
// Both views render <DisconnectWaitModal> when pendingDisconnect is non-null.
// =============================================================================

import React, { useState } from 'react';
import { Player, PendingDisconnect } from '../utils/firebaseGame';
import { CharacterName, CHARACTERS } from '../utils/gameLogic';
import { COLORS, SPACING } from '../utils/theme';
import CharacterBadge      from '../components/CharacterBadge';
import DisconnectWaitModal from '../components/DisconnectWaitModal';

interface LadyOfTheLakeScreenProps {
  players:     Player[];
  myDeviceId:  string;
  myCharacter: CharacterName | null;
  myName:      string;
  amILady:     boolean;
  ladyDeviceId: string | null;
  ladyHistory:  string[];
  ladyResult:   { targetDeviceId: string; alignment: 'good' | 'evil' } | null;
  // characters map needed to compute alignment locally before writing to Firestore
  characters:   Record<string, CharacterName>;
  onSubmitInvestigation: (targetDeviceId: string) => void;
  onResetGame:           () => void;
  pendingDisconnect:        PendingDisconnect | null;
  isHost:                   boolean;
  disconnectedPlayerIsHost: boolean;
  onHostEndGame:            () => void;
  onGuestLeave:             () => void;
}

function nameOf(players: Player[], deviceId: string): string {
  return players.find(function(p) { return p.deviceId === deviceId; })?.name ?? '???';
}

export default function LadyOfTheLakeScreen(props: LadyOfTheLakeScreenProps) {
  const {
    players, myDeviceId, myCharacter, myName,
    amILady, ladyDeviceId, ladyHistory, ladyResult,
    characters,
    onSubmitInvestigation, onResetGame,
    pendingDisconnect, isHost, disconnectedPlayerIsHost,
    onHostEndGame, onGuestLeave,
  } = props;

  const [selectedTarget,    setSelectedTarget]    = useState<string | null>(null);
  // After tapping Confirm, we show the reveal locally before writing to Firestore
  const [revealedTarget,    setRevealedTarget]    = useState<string | null>(null);
  const [revealedAlignment, setRevealedAlignment] = useState<'good' | 'evil' | null>(null);
  const [isSubmitting,      setIsSubmitting]      = useState(false);

  const ladyName = ladyDeviceId ? nameOf(players, ladyDeviceId) : 'Unknown';

  // Eligible targets: exclude anyone in ladyHistory AND exclude the token
  // holder themselves. ladyHistory includes the initial holder (seeded at
  // game start) which covers them for subsequent rounds, but the active
  // holder on their first turn may not yet be in history, so we also
  // explicitly exclude myDeviceId.
  const eligibleTargets = players.filter(function(p) {
    return !ladyHistory.includes(p.deviceId) && p.deviceId !== myDeviceId;
  });

  // -------------------------------------------------------------------------
  // RECONNECT CASE: ladyResult already set on mount
  // Token holder disconnected after confirming but before tapping Continue.
  // We read the stored result and skip straight to the reveal view.
  // -------------------------------------------------------------------------
  const [reconnectTargetId]    = useState<string | null>(function() {
    return (amILady && ladyResult) ? ladyResult.targetDeviceId : null;
  });
  const [reconnectAlignment]   = useState<'good' | 'evil' | null>(function() {
    return (amILady && ladyResult) ? ladyResult.alignment : null;
  });

  // -------------------------------------------------------------------------
  // SHARED: lady history strip
  // -------------------------------------------------------------------------
  function renderLadyHistory() {
    if (ladyHistory.length === 0) return null;
    return (
      <div style={styles.historyBlock}>
        <p style={styles.sectionLabel}>LADY HISTORY — public knowledge</p>
        <div style={styles.historyList}>
          {ladyHistory.map(function(deviceId, idx) {
            const name = nameOf(players, deviceId);
            const isMe = deviceId === myDeviceId;
            // "current holder" is whoever ladyDeviceId points to, not the last
            // entry in history. History trails behind by one after each handoff.
            const isCurrent = deviceId === ladyDeviceId;
            return (
              <div key={deviceId} style={styles.historyRow}>
                <span style={styles.historyIndex}>{idx + 1}</span>
                <span style={{ ...styles.historyName, ...(isMe ? styles.historyNameMe : {}) }}>
                  {name}{isMe ? ' (you)' : ''}
                </span>
                {isCurrent && (
                  <span style={styles.currentBadge}>current holder</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // REVEAL VIEW — shown to token holder after confirming, or on reconnect
  // -------------------------------------------------------------------------
  const showReveal      = revealedAlignment !== null || reconnectAlignment !== null;
  const displayAlignment = revealedAlignment ?? reconnectAlignment;
  const displayTargetId  = revealedTarget    ?? reconnectTargetId;
  const displayTargetName = displayTargetId ? nameOf(players, displayTargetId) : '???';

  if (amILady && showReveal && displayAlignment !== null) {
    const isGood = displayAlignment === 'good';
    return (
      <div style={{ ...styles.screen, backgroundImage: 'url(/assets/images/normal_background.png)' }}>
        <div style={styles.overlay} />
        <div style={styles.content}>
          <div style={styles.topBar}>
            <span style={styles.topBarTitle}>LADY OF THE LAKE</span>
            {myCharacter && <CharacterBadge character={myCharacter} />}
          </div>

          <div style={styles.scrollArea}>
            <div style={styles.resultContainer}>

              <div style={styles.tokenIcon}>
                <span style={styles.tokenEmoji}>🌊</span>
              </div>

              <p style={styles.resultHeaderLabel}>THE LAKE REVEALS ITS SECRET</p>

              <p style={styles.resultTargetName}>{displayTargetName}</p>

              <div style={{
                ...styles.alignmentCard,
                borderColor:     isGood ? COLORS.goodDim : COLORS.evilDim,
                backgroundColor: isGood ? 'rgba(13,42,30,0.95)' : 'rgba(42,13,13,0.95)',
              }}>
                <span style={styles.alignmentEmoji}>{isGood ? '✦' : '✧'}</span>
                <span style={{ ...styles.alignmentLabel, color: isGood ? COLORS.good : COLORS.evil }}>
                  {isGood ? 'GOOD' : 'EVIL'}
                </span>
                <p style={styles.alignmentSubtext}>
                  {isGood
                    ? 'This player serves the forces of Good.'
                    : 'This player serves the forces of Evil.'}
                </p>
              </div>

              <p style={styles.resultHint}>
                Only you can see this. The token now passes to {displayTargetName}.
              </p>

              {renderLadyHistory()}
            </div>
          </div>

          <div style={styles.bottomBar}>
            <button
              style={{ ...styles.primaryBtn, ...(isSubmitting ? styles.primaryBtnDisabled : {}) }}
              onClick={function() {
                if (isSubmitting || !displayTargetId) return;
                setIsSubmitting(true);
                onSubmitInvestigation(displayTargetId);
                // Phase will advance to team-propose on the next Firestore tick.
                // Screen unmounts naturally; no local cleanup needed.
              }}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'CONTINUING...' : 'CONTINUE →'}
            </button>
          </div>
        </div>

        {pendingDisconnect && (
          <DisconnectWaitModal
            pendingDisconnect={pendingDisconnect}
            isHost={isHost}
            disconnectedPlayerIsHost={disconnectedPlayerIsHost}
            onHostEndGame={onHostEndGame}
            onGuestLeave={onGuestLeave}
          />
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TOKEN HOLDER: selection UI
  // -------------------------------------------------------------------------
  if (amILady) {
    return (
      <div style={{ ...styles.screen, backgroundImage: 'url(/assets/images/normal_background.png)' }}>
        <div style={styles.overlay} />
        <div style={styles.content}>
          <div style={styles.topBar}>
            <span style={styles.topBarTitle}>LADY OF THE LAKE</span>
            {myCharacter && <CharacterBadge character={myCharacter} />}
          </div>

          <div style={styles.scrollArea}>
            <div style={styles.heroSection}>
              <div style={styles.tokenIcon}><span style={styles.tokenEmoji}>🌊</span></div>
              <p style={styles.heroTitle}>The Lake Stirs</p>
              <p style={styles.heroSubtitle}>
                You hold the Lady of the Lake token. Choose a player to investigate —
                the waters will reveal whether their heart is Good or Evil.
                Your choice will be public, but the result is yours alone to know.
              </p>
            </div>

            {renderLadyHistory()}

            <div>
              <p style={styles.sectionLabel}>CHOOSE A PLAYER TO INVESTIGATE</p>
              {eligibleTargets.length === 0 ? (
                <p style={styles.noTargetsText}>No eligible players remain.</p>
              ) : (
                <div style={styles.targetList}>
                  {eligibleTargets.map(function(player) {
                    const isSelected = selectedTarget === player.deviceId;
                    return (
                      <button
                        key={player.deviceId}
                        style={{
                          ...styles.targetRow,
                          ...(isSelected ? styles.targetRowSelected : {}),
                        }}
                        onClick={function() {
                          setSelectedTarget(selectedTarget === player.deviceId ? null : player.deviceId);
                        }}
                      >
                        <span style={{
                          ...styles.targetName,
                          ...(isSelected ? styles.targetNameSelected : {}),
                        }}>
                          {player.name}
                        </span>
                        {isSelected && <span style={styles.selectedCheck}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div style={styles.bottomBar}>
            <button
              style={{
                ...styles.primaryBtn,
                ...(!selectedTarget || isSubmitting ? styles.primaryBtnDisabled : {}),
              }}
              onClick={function() {
                if (!selectedTarget || isSubmitting) return;
                const targetChar = characters[selectedTarget];
                if (!targetChar) return;
                const alignment = CHARACTERS[targetChar].alignment;
                setRevealedTarget(selectedTarget);
                setRevealedAlignment(alignment);
              }}
              disabled={!selectedTarget || isSubmitting}
            >
              {selectedTarget ? 'INVESTIGATE →' : 'SELECT A PLAYER'}
            </button>
          </div>
        </div>

        {pendingDisconnect && (
          <DisconnectWaitModal
            pendingDisconnect={pendingDisconnect}
            isHost={isHost}
            disconnectedPlayerIsHost={disconnectedPlayerIsHost}
            onHostEndGame={onHostEndGame}
            onGuestLeave={onGuestLeave}
          />
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // SPECTATOR VIEW
  // -------------------------------------------------------------------------
  return (
    <div style={{ ...styles.screen, backgroundImage: 'url(/assets/images/normal_background.png)' }}>
      <div style={styles.overlay} />
      <div style={styles.content}>
        <div style={styles.topBar}>
          <span style={styles.topBarTitle}>LADY OF THE LAKE</span>
          {myCharacter && <CharacterBadge character={myCharacter} />}
        </div>

        <div style={styles.scrollArea}>
          <div style={styles.heroSection}>
            <div style={styles.tokenIcon}><span style={styles.tokenEmoji}>🌊</span></div>
            <p style={styles.heroTitle}>The Lake Stirs</p>
            <p style={styles.heroSubtitle}>
              The Lady of the Lake token has been invoked. The token holder will
              secretly learn one player's alignment. Their choice will be public,
              but only they will know the result.
            </p>
          </div>

          <div style={styles.holderCard}>
            <p style={styles.holderLabel}>TOKEN HOLDER</p>
            <p style={styles.holderName}>{ladyName}</p>
            <p style={styles.holderWaiting}>Waiting for {ladyName} to investigate...</p>
          </div>

          {renderLadyHistory()}
        </div>

        <div style={styles.bottomBar}>
          {/* Intentionally empty for spectators — no action available during LoTL */}
        </div>
      </div>

      {pendingDisconnect && (
        <DisconnectWaitModal
          pendingDisconnect={pendingDisconnect}
          isHost={isHost}
          disconnectedPlayerIsHost={disconnectedPlayerIsHost}
          onHostEndGame={onHostEndGame}
          onGuestLeave={onGuestLeave}
        />
      )}
    </div>
  );
}


// =============================================================================
// STYLES
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
  screen:           { width: '100%', height: '100%', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' },
  overlay:          { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.78)' },
  content:          { position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column' },
  topBar:           { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${SPACING.sm}px ${SPACING.md}px`, borderBottom: '1px solid rgba(42,45,69,0.8)', backgroundColor: 'rgba(13,15,26,0.7)', flexShrink: 0 },
  topBarTitle:      { fontSize: 11, color: COLORS.textMuted, letterSpacing: '3px', fontWeight: '600' },
  scrollArea:       { flex: 1, overflowY: 'auto', padding: SPACING.md, display: 'flex', flexDirection: 'column', gap: SPACING.lg },
  bottomBar:        { flexShrink: 0, padding: `${SPACING.md}px`, borderTop: '1px solid rgba(42,45,69,0.5)', backgroundColor: 'rgba(13,15,26,0.85)' },
  bottomRow:        { display: 'flex', gap: SPACING.sm, alignItems: 'center' },
  // Hero
  heroSection:      { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACING.md, paddingTop: SPACING.sm },
  tokenIcon:        { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(30,55,80,0.7)', border: '1px solid rgba(100,160,200,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tokenEmoji:       { fontSize: 40 },
  heroTitle:        { fontSize: 24, fontWeight: '800', color: COLORS.textPrimary, margin: 0, textAlign: 'center', letterSpacing: '1px' },
  heroSubtitle:     { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: '1.6', margin: 0, maxWidth: 340, alignSelf: 'center' },
  // History
  historyBlock:     { display: 'flex', flexDirection: 'column', gap: SPACING.sm, backgroundColor: 'rgba(22,24,38,0.85)', borderRadius: 14, padding: SPACING.md, border: `1px solid ${COLORS.border}` },
  sectionLabel:     { fontSize: 11, color: COLORS.textMuted, letterSpacing: '3px', fontWeight: '600', margin: 0 },
  historyList:      { display: 'flex', flexDirection: 'column', gap: 6 },
  historyRow:       { display: 'flex', alignItems: 'center', gap: SPACING.sm },
  historyIndex:     { fontSize: 12, color: COLORS.textMuted, width: 18, textAlign: 'right', flexShrink: 0 },
  historyName:      { fontSize: 14, color: COLORS.textSecondary, flex: 1 },
  historyNameMe:    { color: COLORS.gold, fontWeight: '700' },
  currentBadge:     { fontSize: 11, color: 'rgba(100,160,200,0.9)', backgroundColor: 'rgba(30,55,80,0.5)', padding: '2px 8px', borderRadius: 6, letterSpacing: '1px' },
  // Target list
  targetList:       { display: 'flex', flexDirection: 'column', gap: 8, marginTop: SPACING.sm },
  targetRow:        { display: 'flex', alignItems: 'center', gap: SPACING.sm, padding: `${SPACING.sm}px ${SPACING.md}px`, backgroundColor: 'rgba(22,24,38,0.85)', border: `1px solid ${COLORS.border}`, borderRadius: 12, cursor: 'pointer', width: '100%', textAlign: 'left' },
  targetRowSelected:{ borderColor: 'rgba(100,160,200,0.7)', backgroundColor: 'rgba(30,55,80,0.5)' },
  targetName:       { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary, flex: 1 },
  targetNameSelected: { color: COLORS.textPrimary },
  selectedCheck:    { fontSize: 18, color: 'rgba(100,160,200,0.9)', flexShrink: 0 },
  noTargetsText:    { fontSize: 13, color: COLORS.textMuted, fontStyle: 'italic', marginTop: SPACING.sm },
  // Holder card (spectator)
  holderCard:       { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACING.sm, backgroundColor: 'rgba(30,55,80,0.35)', border: '1px solid rgba(100,160,200,0.3)', borderRadius: 16, padding: SPACING.lg },
  holderLabel:      { fontSize: 11, color: 'rgba(100,160,200,0.7)', letterSpacing: '3px', fontWeight: '600', margin: 0 },
  holderName:       { fontSize: 28, fontWeight: '800', color: COLORS.textPrimary, margin: 0 },
  holderWaiting:    { fontSize: 13, color: COLORS.textSecondary, margin: 0, textAlign: 'center' },
  // Result reveal
  resultContainer:  { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACING.lg, paddingTop: SPACING.sm },
  resultHeaderLabel:{ fontSize: 11, color: COLORS.textMuted, letterSpacing: '3px', fontWeight: '600', margin: 0, textAlign: 'center' },
  resultTargetName: { fontSize: 28, fontWeight: '800', color: COLORS.textPrimary, margin: 0, textAlign: 'center' },
  alignmentCard:    { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACING.sm, padding: SPACING.xl, borderRadius: 20, border: '1px solid', width: '100%', maxWidth: 300 },
  alignmentEmoji:   { fontSize: 48, lineHeight: 1 },
  alignmentLabel:   { fontSize: 28, fontWeight: '900', letterSpacing: '4px', margin: 0 },
  alignmentSubtext: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', margin: 0, lineHeight: '1.5' },
  resultHint:       { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', margin: 0, lineHeight: '1.5', fontStyle: 'italic' },
  // Buttons
  primaryBtn:         { padding: `${SPACING.md}px`, backgroundColor: 'rgba(100,160,200,0.85)', border: 'none', borderRadius: 20, fontSize: 15, fontWeight: '800', color: '#0d1820', letterSpacing: '2px', cursor: 'pointer', width: '100%', textAlign: 'center' },
  primaryBtnFlex:     { flex: 1 },
  primaryBtnDisabled: { opacity: 0.4, cursor: 'default' },
};
