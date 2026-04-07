// =============================================================================
// gameLogic.ts
//
// Pure game logic -- no UI dependencies, just tables, types, and functions.
//
// v3 additions:
//   - Character types and knowledge rules (Merlin, Percival, etc.)
//   - Evil count table by player count
//   - Character assignment (shuffle + assign)
//   - Leader rotation
//   - Team proposal vote evaluation (approve/reject majority)
//   - 5-rejection auto-evil-win rule
//   - Assassination resolution
// =============================================================================

export type VoteResult   = 'success' | 'fail';
export type QuestOutcome = 'good' | 'evil' | null;
export type GameWinner   = 'good' | 'evil' | null;
export type GameMode     = 'local' | 'network';

// v3: expanded phase list
// setup              -- start screen, not in a game yet
// lobby              -- waiting room, host selects characters, players join
// role-reveal        -- each player sees their character card privately
// team-propose       -- current leader taps players to propose a team
// team-vote          -- all players vote approve/reject simultaneously
// team-vote-results  -- reveal who voted what before proceeding
// voting             -- approved mission players vote success/fail
// results            -- quest outcome shown
// assassination      -- good won 3 quests, assassin picks their Merlin guess
// gameover           -- game is over
export type GamePhase =
  | 'setup'
  | 'lobby'
  | 'role-reveal'
  | 'team-propose'
  | 'team-vote'
  | 'team-vote-results'
  | 'voting'
  | 'results'
  | 'assassination'
  | 'gameover';

export interface QuestResult {
  missionPassed: boolean;
  failCount:     number;
  successCount:  number;
}

// =============================================================================
// CHARACTER TYPES
// =============================================================================

export type CharacterName =
  | 'Merlin'
  | 'Percival'
  | 'Loyal Servant of Arthur'
  | 'Assassin'
  | 'Morgana'
  | 'Mordred'
  | 'Oberon'
  | 'Minion of Mordred';

export type CharacterAlignment = 'good' | 'evil';

export interface CharacterInfo {
  name:        CharacterName;
  alignment:   CharacterAlignment;
  description: string;
  flavor:      string;
  isOptional:  boolean;
}

// Master character definitions used for the lobby picker and role reveal cards
export const CHARACTERS: Record<CharacterName, CharacterInfo> = {
  'Merlin': {
    name:        'Merlin',
    alignment:   'good',
    isOptional:  false,
    description: 'You know who the evil players are (except Mordred). Keep your identity secret or the Assassin will strike.',
    flavor:      'The wise counselor who sees darkness but must remain hidden.',
  },
  'Percival': {
    name:        'Percival',
    alignment:   'good',
    isOptional:  true,
    description: 'You know who Merlin and Morgana are, but not which is which. Protect the true Merlin.',
    flavor:      'The loyal knight who seeks the light in the shadows.',
  },
  'Loyal Servant of Arthur': {
    name:        'Loyal Servant of Arthur',
    alignment:   'good',
    isOptional:  true,
    description: 'You know nothing of the other players. Trust your instincts and serve the quest.',
    flavor:      'A steadfast knight in service to the king.',
  },
  'Assassin': {
    name:        'Assassin',
    alignment:   'evil',
    isOptional:  false,
    description: 'You know your fellow evil players. If Good wins 3 quests, you get one chance to identify and assassinate Merlin.',
    flavor:      'The blade in the dark, waiting for the final strike.',
  },
  'Morgana': {
    name:        'Morgana',
    alignment:   'evil',
    isOptional:  true,
    description: 'You appear as Merlin to Percival. Sow confusion and protect your Assassin ally.',
    flavor:      'The enchantress who mimics the light to hide her darkness.',
  },
  'Mordred': {
    name:        'Mordred',
    alignment:   'evil',
    isOptional:  true,
    description: 'You are hidden from Merlin. Even the wise counselor cannot see your true nature.',
    flavor:      'The hidden traitor, invisible even to those who see all.',
  },
  'Oberon': {
    name:        'Oberon',
    alignment:   'evil',
    isOptional:  true,
    description: 'You do not know your evil allies, and they do not know you. Act alone in the shadows.',
    flavor:      'The lone shadow, unknown even to darkness itself.',
  },
  'Minion of Mordred': {
    name:        'Minion of Mordred',
    alignment:   'evil',
    isOptional:  true,
    description: 'You know your fellow evil players. Sabotage quests and protect the Assassin.',
    flavor:      'A servant of evil hiding among the good.',
  },
};

// =============================================================================
// EVIL COUNT TABLE
//
// Standard Avalon rules: number of evil players by total player count.
// These counts include the Assassin.
// =============================================================================
export const EVIL_COUNT: Record<number, number> = {
  5:  2,
  6:  2,
  7:  3,
  8:  3,
  9:  3,
  10: 4,
};

export function getEvilCount(totalPlayers: number): number {
  return EVIL_COUNT[totalPlayers] ?? 2;
}

export function getGoodCount(totalPlayers: number): number {
  return totalPlayers - getEvilCount(totalPlayers);
}

// =============================================================================
// CHARACTER SELECTION VALIDATION
//
// Used in the lobby to determine if the host's selection is valid enough
// to enable the Start Game button.
// =============================================================================

export interface CharacterSelectionValidation {
  isValid: boolean;
  message: string;
}

// Returns the full character list: always includes Merlin + Assassin,
// plus whatever optional characters the host selected.
export function getFullCharacterList(optionalSelected: CharacterName[]): CharacterName[] {
  const base: CharacterName[] = ['Merlin', 'Assassin'];
  const extras = optionalSelected.filter(function(n) {
    return n !== 'Merlin' && n !== 'Assassin';
  });
  return [...base, ...extras];
}

export function validateCharacterSelection(
  optionalSelected: CharacterName[],
  totalPlayers:     number
): CharacterSelectionValidation {
  const allSelected = getFullCharacterList(optionalSelected);
  const evilNeeded  = getEvilCount(totalPlayers);
  const goodNeeded  = getGoodCount(totalPlayers);

  const evilCount = allSelected.filter(function(n) {
    return CHARACTERS[n].alignment === 'evil';
  }).length;
  const goodCount = allSelected.filter(function(n) {
    return CHARACTERS[n].alignment === 'good';
  }).length;

  const slotsRemaining = totalPlayers - allSelected.length;
  if (slotsRemaining > 0) {
    return {
      isValid: false,
      message: `Select ${slotsRemaining} more character${slotsRemaining !== 1 ? 's' : ''}.`,
    };
  }

  if (allSelected.length > totalPlayers) {
    return {
      isValid: false,
      message: `Too many characters selected (${allSelected.length} for ${totalPlayers} players).`,
    };
  }

  if (evilCount !== evilNeeded) {
    return {
      isValid: false,
      message: `Need exactly ${evilNeeded} evil characters for ${totalPlayers} players (have ${evilCount}).`,
    };
  }

  if (goodCount !== goodNeeded) {
    return {
      isValid: false,
      message: `Need exactly ${goodNeeded} good characters for ${totalPlayers} players (have ${goodCount}).`,
    };
  }

  return { isValid: true, message: 'Ready to start!' };
}

// Returns which optional characters are valid to add given current selection.
// Used to grey out unavailable options in the picker.
export function getSelectableOptionalCharacters(
  currentOptionalSelected: CharacterName[],
  totalPlayers:            number
): CharacterName[] {
  const allSelected  = getFullCharacterList(currentOptionalSelected);
  const evilNeeded   = getEvilCount(totalPlayers);
  const goodNeeded   = getGoodCount(totalPlayers);
  const currentEvil  = allSelected.filter(function(n) { return CHARACTERS[n].alignment === 'evil'; }).length;
  const currentGood  = allSelected.filter(function(n) { return CHARACTERS[n].alignment === 'good'; }).length;
  const evilSlotsLeft = evilNeeded - currentEvil;
  const goodSlotsLeft = goodNeeded - currentGood;

  const optionals: CharacterName[] = [
    'Percival',
    'Loyal Servant of Arthur',
    'Morgana',
    'Mordred',
    'Oberon',
    'Minion of Mordred',
  ];

  return optionals.filter(function(name) {
    // Already selected -- always show so it can be toggled off
    if (currentOptionalSelected.includes(name)) return true;
    // No slots left
    if (evilSlotsLeft <= 0 && goodSlotsLeft <= 0) return false;
    const info = CHARACTERS[name];
    if (info.alignment === 'evil' && evilSlotsLeft <= 0) return false;
    if (info.alignment === 'good' && goodSlotsLeft <= 0) return false;

    return true;
  });
}


// =============================================================================
// CHARACTER ASSIGNMENT
//
// Called by the host's device when starting the game.
// Shuffles the full character list and assigns one to each player (by join order).
// Returns a map of deviceId -> CharacterName.
// =============================================================================
export function assignCharacters(
  playerDeviceIds:   string[],
  fullCharacterList: CharacterName[]
): Record<string, CharacterName> {
  const shuffled = shuffleArray(fullCharacterList);
  const assignment: Record<string, CharacterName> = {};
  for (let i = 0; i < playerDeviceIds.length; i++) {
    assignment[playerDeviceIds[i]] = shuffled[i];
  }
  return assignment;
}


// =============================================================================
// CHARACTER KNOWLEDGE
//
// Computes what a given character can see about other players at role reveal.
// =============================================================================

export interface CharacterVisionEntry {
  deviceId: string;
  label:    string;   // what to show under this person's name
}

export function getCharacterVision(
  myCharacter: CharacterName,
  myDeviceId:  string,
  characters:  Record<string, CharacterName>
): CharacterVisionEntry[] {
  const entries: CharacterVisionEntry[] = [];

  for (const [deviceId, character] of Object.entries(characters)) {
    if (deviceId === myDeviceId) continue;

    if (myCharacter === 'Merlin') {
      // Merlin sees all evil EXCEPT Mordred
      if (CHARACTERS[character].alignment === 'evil' && character !== 'Mordred') {
        entries.push({ deviceId, label: 'Evil' });
      }
    } else if (myCharacter === 'Percival') {
      // Percival sees Merlin and Morgana but not which is which
      if (character === 'Merlin' || character === 'Morgana') {
        entries.push({ deviceId, label: 'Merlin or Morgana' });
      }
    } else if (CHARACTERS[myCharacter].alignment === 'evil' && myCharacter !== 'Oberon') {
      // Evil (except Oberon) sees each other, but NOT Oberon
      if (CHARACTERS[character].alignment === 'evil' && character !== 'Oberon') {
        entries.push({ deviceId, label: character });
      }
    }
    // Oberon and Loyal Servants see nobody
  }

  return entries;
}


// =============================================================================
// MISSION SIZE AND FAIL TABLES
// =============================================================================

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


// =============================================================================
// TEAM PROPOSAL VOTE EVALUATION
//
// Majority = strictly more than half. Ties go to reject (standard Avalon rule).
// =============================================================================

export interface ProposalVoteResult {
  approved:     boolean;
  approveCount: number;
  rejectCount:  number;
}

export function evaluateProposalVotes(
  votes: Record<string, boolean>  // deviceId -> true (approve) / false (reject)
): ProposalVoteResult {
  let approveCount = 0;
  let rejectCount  = 0;
  for (const vote of Object.values(votes)) {
    if (vote) approveCount++;
    else      rejectCount++;
  }
  const total    = approveCount + rejectCount;
  const approved = approveCount > total / 2;
  return { approved, approveCount, rejectCount };
}


// =============================================================================
// ASSASSINATION RESOLUTION
// =============================================================================

export function resolveAssassination(
  targetDeviceId: string,
  characters:     Record<string, CharacterName>
): GameWinner {
  if (characters[targetDeviceId] === 'Merlin') return 'evil';
  return 'good';
}


// =============================================================================
// SHARED UTILITIES (unchanged from v2)
// =============================================================================

export function shuffleArray<T>(originalArray: T[]): T[] {
  const array = [...originalArray];
  let currentIndex = array.length;
  while (currentIndex > 0) {
    const randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex = currentIndex - 1;
    const temp              = array[currentIndex];
    array[currentIndex]     = array[randomIndex];
    array[randomIndex]      = temp;
  }
  return array;
}

export function evaluateVotes(
  votes:        VoteResult[],
  totalPlayers: number,
  questNumber:  number
): QuestResult {
  let failCount    = 0;
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

export function generateRoomCode(): string {
  const chars = 'ACDEFGHJKMNPQRTUWXZ234679';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}