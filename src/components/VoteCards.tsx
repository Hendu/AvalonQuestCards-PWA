// =============================================================================
// VoteCards.tsx
//
// Secret voting cards with 3D flip animation.
//
// FIX #3 -- hover jank:
//   The original used CSS classes + hover which conflicted with the flip
//   transition. Now we use a proper state machine with pointer-events: none
//   on the unchosen card immediately when any card is tapped, so there's
//   no chance of hover states interfering mid-animation.
//
// State machine per card:
//   'down'     -- face-down (showing back.png), waiting to be revealed
//   'up'       -- face-up (showing success or fail), waiting to be chosen
//   'chosen'   -- being flipped back face-down (the one the player picked)
//   'returned' -- the other card, stays face-up briefly then fades
// =============================================================================

import React, { useState, useEffect } from 'react';
import { VoteResult, shuffleArray } from '../utils/gameLogic';
import { COLORS } from '../utils/theme';

const STYLE_ID = 'vote-cards-styles';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .vc-scene {
      width: 110px;
      height: 155px;
      perspective: 700px;
      position: relative;
    }

    .vc-inner {
      width: 100%;
      height: 100%;
      position: relative;
      transform-style: preserve-3d;
      transition: transform 0.38s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* State classes control the rotation */
    .vc-inner.state-down     { transform: rotateY(0deg);   }
    .vc-inner.state-up       { transform: rotateY(180deg); }
    .vc-inner.state-chosen   { transform: rotateY(360deg); }
    .vc-inner.state-returned { transform: rotateY(180deg); opacity: 0.3; }

    .vc-face {
      position: absolute;
      inset: 0;
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
    }

    /* Front = card back image, visible at 0deg */
    .vc-front { transform: rotateY(0deg); }

    /* Back face = success or fail image, visible at 180deg */
    .vc-back  { transform: rotateY(180deg); }

    .vc-face img {
      width: 110px;
      height: 155px;
      display: block;
      border-radius: 6px;
    }

    .vc-scene.choosable {
      cursor: pointer;
    }

    /* Once a card is chosen, disable hover on everything */
    .vc-scene.locked {
      cursor: default;
      pointer-events: none;
    }

    @keyframes vc-pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.35; }
    }
    .vc-pulse {
      animation: vc-pulse 1.8s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);
}

interface VoteCardsProps {
  onVote:   (result: VoteResult) => void;
  disabled: boolean;
}

type CardState = 'down' | 'up' | 'chosen' | 'returned';

export default function VoteCards(props: VoteCardsProps) {
  const { onVote, disabled } = props;

  useEffect(function() { injectStyles(); }, []);

  const [isRevealed, setIsRevealed]  = useState(false);
  const [cardOrder,  setCardOrder]   = useState<VoteResult[]>(['success', 'fail']);
  const [locked,     setLocked]      = useState(false);  // true once a card is tapped

  // Each card has its own state
  const [states, setStates] = useState<[CardState, CardState]>(['down', 'down']);

  // Brief lockout after reveal so the player can't accidentally vote
  // before seeing their cards -- prevents misvotes on fast taps
  const [revealLocked, setRevealLocked] = useState(false);

  function handleReveal() {
    if (disabled || isRevealed || locked) return;

    const shuffled = shuffleArray<VoteResult>(['success', 'fail']);
    setCardOrder(shuffled);
    setIsRevealed(true);
    setRevealLocked(true);

    // Flip both cards face-up with a slight stagger
    setStates(['up', 'down']);
    setTimeout(function() {
      setStates(['up', 'up']);
    }, 90);

    // After 600ms the cards are fully visible -- now allow voting
    setTimeout(function() {
      setRevealLocked(false);
    }, 600);
  }

  function handleCardChosen(index: number) {
    if (locked || !isRevealed || states[index] !== 'up') return;

    // Lock immediately -- disables hover and pointer events on both cards
    setLocked(true);

    // Chosen card flips back down; unchosen card dims
    const otherIndex = index === 0 ? 1 : 0;
    const newStates: [CardState, CardState] = ['down', 'down'];
    newStates[index]      = 'chosen';
    newStates[otherIndex] = 'returned';
    setStates(newStates);

    // After flip animation, submit vote and reset
    setTimeout(function() {
      const vote = cardOrder[index];
      onVote(vote);

      // Full reset for next player
      setIsRevealed(false);
      setLocked(false);
      setRevealLocked(false);
      setStates(['down', 'down']);
      setCardOrder(['success', 'fail']);
    }, 520);
  }

  return (
    <div style={styles.container}>
      <div style={styles.cardRow}>
        {([0, 1] as const).map(function(index) {
          const cardState = states[index];
          const cardValue = cardOrder[index];

          // choosable = face-up AND nothing chosen yet
          const isChoosable  = (cardState === 'up' && !locked && !revealLocked);
          const isRevealable = (cardState === 'down' && !isRevealed && !disabled && !locked);

          const sceneClass = [
            'vc-scene',
            isChoosable  ? 'choosable' : '',
            locked       ? 'locked'    : '',
            isRevealable ? 'choosable' : '',
          ].filter(Boolean).join(' ');

          // clicking a face-down card reveals both; clicking a face-up card votes
          function handleClick() {
            if (isRevealable) handleReveal();
            else if (isChoosable) handleCardChosen(index);
          }

          return (
            <div
              key={index}
              className={sceneClass}
              onClick={(isRevealable || isChoosable) ? handleClick : undefined}
            >
              <div className={`vc-inner state-${cardState}`}>

                {/* Front face: always the card back */}
                <div className="vc-face vc-front">
                  <img src="/assets/images/back.png" alt="card" />
                </div>

                {/* Back face: the actual vote value */}
                <div className="vc-face vc-back">
                  <img
                    src={cardValue === 'success'
                      ? '/assets/images/success.png'
                      : '/assets/images/fail.png'}
                    alt={cardValue}
                  />
                </div>

              </div>
            </div>
          );
        })}
      </div>

      {/* Prompt text */}
      {!isRevealed && !disabled && (
        <p className="vc-pulse" style={styles.promptText}>TAP TO VIEW YOUR CARDS</p>
      )}
      {isRevealed && !locked && (
        <p style={styles.promptText}>CHOOSE YOUR CARD TO VOTE</p>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    gap:           12,
  },
  cardRow: {
    display:        'flex',
    flexDirection:  'row',
    gap:            24,
    justifyContent: 'center',
  },
  promptText: {
    fontSize:      11,
    color:         COLORS.textMuted,
    letterSpacing: '2px',
    textTransform: 'uppercase',
    textAlign:     'center',
    margin:        0,
  },
};
