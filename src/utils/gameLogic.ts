// =============================================================================
// gameLogic.ts
//
// Pure game logic -- identical to the React Native version.
// No UI dependencies, just tables, types, and functions.
// =============================================================================

export type VoteResult   = 'success' | 'fail';
export type QuestOutcome = 'good' | 'evil' | null;
export type GameWinner   = 'good' | 'evil' | null;
export type GamePhase    = 'setup' | 'lobby' | 'voting' | 'results' | 'gameover';
export type GameMode     = 'local' | 'network';

export interface QuestResult {
  missionPassed: boolean;
  failCount: number;
  successCount: number;
}

// votes_required[totalPlayers][questNumber]
export const VOTES_REQUIRED: Record<number, number[]> = {
  5:  [0, 2, 3, 2, 3, 3],
  6:  [0, 2, 3, 4, 3, 4],
  7:  [0, 2, 3, 3, 4, 4],
  8:  [0, 3, 4, 4, 5, 5],
  9:  [0, 3, 4, 4, 5, 5],
  10: [0, 3, 4, 4, 5, 5],
};

// fails_required[totalPlayers][questNumber]
export const FAILS_REQUIRED: Record<number, number[]> = {
  5:  [0, 1, 1, 1, 1, 1],
  6:  [0, 1, 1, 1, 1, 1],
  7:  [0, 1, 1, 1, 2, 1],
  8:  [0, 1, 1, 1, 2, 1],
  9:  [0, 1, 1, 1, 2, 1],
  10: [0, 1, 1, 1, 2, 1],
};

export function getMissionSize(totalPlayers: number, questNumber: number): number {
  return VOTES_REQUIRED[totalPlayers][questNumber];
}

export function getFailsRequired(totalPlayers: number, questNumber: number): number {
  return FAILS_REQUIRED[totalPlayers][questNumber];
}

export function shuffleArray<T>(originalArray: T[]): T[] {
  const array = [...originalArray];
  let currentIndex = array.length;
  while (currentIndex > 0) {
    const randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex = currentIndex - 1;
    const temp = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temp;
  }
  return array;
}

export function evaluateVotes(
  votes: VoteResult[],
  totalPlayers: number,
  questNumber: number
): QuestResult {
  let failCount = 0;
  let successCount = 0;
  for (let i = 0; i < votes.length; i++) {
    if (votes[i] === 'fail') failCount++;
    else if (votes[i] === 'success') successCount++;
  }
  const failsNeeded = getFailsRequired(totalPlayers, questNumber);
  return {
    missionPassed: failCount < failsNeeded,
    failCount,
    successCount,
  };
}

export function checkForWinner(goodWins: number, evilWins: number): GameWinner {
  if (goodWins >= 3) return 'good';
  if (evilWins >= 3) return 'evil';
  return null;
}

// Generates a random 6-character uppercase room code (e.g. "XK4T2R")
// Uses characters that are easy to read aloud -- no 0/O, 1/I/L confusion
export function generateRoomCode(): string {
  const chars = 'ACDEFGHJKMNPQRTUWXZ234679';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
