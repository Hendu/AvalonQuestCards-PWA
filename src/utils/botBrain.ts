// =============================================================================
// botBrain.ts  (v4.1)
//
// Pure decision-making logic for bot players. All functions are stateless and
// side-effect free. No API calls, no Firestore.
//
// Simulation-validated at 50.8% good win rate (100k games) with:
//   Merlin + Percival + Loyal Servant vs Assassin + Minion (no special evils)
//
// Key mechanisms:
//   HEATMAP        — tracks failed mission teams; all good bots reject hot teams
//   GRADUATED REJECTION — rates scale down as proposal count rises, preventing
//                    5-rejection auto-evil-win regardless of base rate
//   PERCIVAL       — knows Merlin exactly (no Morgana); always includes Merlin
//                    in proposals; rejects teams without Merlin on props 1-2
//   MERLIN BLEND   — rejects evil teams but modulates based on running reject
//                    ratio to avoid being identified by voting pattern
//   LOYAL SERVANT  — aggressive early rejection (95%) easing to always-approve
//                    at proposal 4
// =============================================================================

import {
  CharacterName,
  CHARACTERS,
  getMissionSize,
  shuffleArray,
} from './gameLogic';
import { Player } from './firebaseGame';


// -----------------------------------------------------------------------------
// BOT IDENTITY
// -----------------------------------------------------------------------------

export const BOT_NAMES = [
  'Aldric', 'Brenna', 'Caius', 'Dwyn', 'Elowen',
  'Faron', 'Gwynn', 'Hadwin', 'Isolde', 'Joren',
  'Kevan', 'Lyra', 'Maren', 'Nolan', 'Oryn',
  'Petra', 'Quinn', 'Rowan', 'Sable', 'Tavish',
];

export const BOT_DEVICE_PREFIX = 'bot_';

export function isBotDeviceId(deviceId: string): boolean {
  return deviceId.startsWith(BOT_DEVICE_PREFIX);
}

export function makeBotDeviceId(): string {
  return BOT_DEVICE_PREFIX + Math.random().toString(36).slice(2, 8);
}

export function makeBotPlayer(name: string): Player {
  return {
    deviceId: makeBotDeviceId(),
    name,
    joinedAt: Date.now() + Math.floor(Math.random() * 100),
    isBot:    true,
  };
}

export function pickBotNames(count: number, usedNames: string[]): string[] {
  const available = BOT_NAMES.filter(function(n) { return !usedNames.includes(n); });
  return shuffleArray(available).slice(0, count);
}


// -----------------------------------------------------------------------------
// HEATMAP
// -----------------------------------------------------------------------------

export function computeHeatmap(
  failedMissionTeams: string[][]
): Record<string, number> {
  const heat: Record<string, number> = {};
  for (const team of failedMissionTeams) {
    for (const id of team) {
      heat[id] = (heat[id] || 0) + 1;
    }
  }
  return heat;
}


// -----------------------------------------------------------------------------
// BOT KNOWLEDGE (information hiding)
// -----------------------------------------------------------------------------

export interface BotKnowledge {
  knownEvil:      string[];
  knownGood:      string[];
  merlinDeviceId: string | null;
}

export function getBotKnowledge(
  myDeviceId:  string,
  myCharacter: CharacterName,
  characters:  Record<string, CharacterName>
): BotKnowledge {
  const knownEvil:  string[] = [];
  const knownGood:  string[] = [];
  let merlinDeviceId: string | null = null;

  for (const [deviceId, character] of Object.entries(characters)) {
    if (deviceId === myDeviceId) continue;

    if (myCharacter === 'Merlin') {
      if (CHARACTERS[character].alignment === 'evil' && character !== 'Mordred') {
        knownEvil.push(deviceId);
      }
    } else if (myCharacter === 'Percival') {
      if (character === 'Merlin') merlinDeviceId = deviceId;
      if (character === 'Morgana') merlinDeviceId = null;
    } else if (
      CHARACTERS[myCharacter].alignment === 'evil' &&
      myCharacter !== 'Oberon'
    ) {
      if (CHARACTERS[character].alignment === 'evil' && character !== 'Oberon') {
        knownEvil.push(deviceId);
      }
    }
  }

  return { knownEvil, knownGood, merlinDeviceId };
}


// -----------------------------------------------------------------------------
// THINK DELAY
// -----------------------------------------------------------------------------

export const BOT_DELAYS = {
  roleReveal:    { min: 400,  max: 1000 },
  proposalVote:  { min: 500,  max: 1750 },
  missionVote:   { min: 750,  max: 2000 },
  ladyTarget:    { min: 1000, max: 2250 },
  assassination: { min: 1250, max: 2750 },
};

export function botThinkDelay(min = 1200, max = 3200): number {
  return Math.floor(min + Math.random() * (max - min));
}


// -----------------------------------------------------------------------------
// DECISION: TEAM PROPOSAL
// -----------------------------------------------------------------------------

export function decideBotProposal(
  myDeviceId:  string,
  myCharacter: CharacterName,
  characters:  Record<string, CharacterName>,
  allPlayers:  Player[],
  heatmap:     Record<string, number>,
  missionSize: number
): string[] {
  const knowledge = getBotKnowledge(myDeviceId, myCharacter, characters);
  const allIds    = allPlayers.map(function(p) { return p.deviceId; });

  if (myCharacter === 'Oberon') {
    const others = shuffleArray(allIds.filter(function(id) { return id !== myDeviceId; }));
    return [myDeviceId, ...others].slice(0, missionSize);
  }

  if (CHARACTERS[myCharacter].alignment === 'evil') {
    let team: string[] = [myDeviceId];
    const allies = knowledge.knownEvil.filter(function(id) { return id !== myDeviceId; });
    if (allies.length > 0 && missionSize >= 2 && Math.random() > 0.3) {
      team.push(allies[Math.floor(Math.random() * allies.length)]);
    }
    const fill = allIds
      .filter(function(id) { return !team.includes(id); })
      .sort(function(a, b) { return (heatmap[a] || 0) - (heatmap[b] || 0); });
    while (team.length < missionSize && fill.length > 0) team.push(fill.shift()!);
    return team.slice(0, missionSize);
  }

  let team: string[] = [myDeviceId];
  if (myCharacter === 'Percival' && knowledge.merlinDeviceId && !team.includes(knowledge.merlinDeviceId)) {
    team.push(knowledge.merlinDeviceId);
  }
  const candidates = allIds
    .filter(function(id) { return !team.includes(id) && !knowledge.knownEvil.includes(id); })
    .sort(function(a, b) { return (heatmap[a] || 0) - (heatmap[b] || 0); });
  while (team.length < missionSize && candidates.length > 0) team.push(candidates.shift()!);
  if (team.length < missionSize) {
    const rem = allIds.filter(function(id) { return !team.includes(id); });
    while (team.length < missionSize && rem.length > 0) team.push(rem.shift()!);
  }
  return team.slice(0, missionSize);
}


// -----------------------------------------------------------------------------
// DECISION: PROPOSAL VOTE
// -----------------------------------------------------------------------------

export function decideBotProposalVote(
  myDeviceId:        string,
  myCharacter:       CharacterName,
  characters:        Record<string, CharacterName>,
  missionPlayerIds:  string[],
  heatmap:           Record<string, number>,
  proposalCount:     number,
  merlinRejectRatio: number
): boolean {
  if (proposalCount >= 4) return true;

  const noise = 0.12;

  if (myCharacter === 'Oberon') return Math.random() > 0.45;

  if (CHARACTERS[myCharacter].alignment === 'evil') {
    const knowledge = getBotKnowledge(myDeviceId, myCharacter, characters);
    const hasAlly   = missionPlayerIds.some(function(id) {
      return knowledge.knownEvil.includes(id) || id === myDeviceId;
    });
    return Math.random() < noise ? !hasAlly : hasAlly;
  }

  const avgHeat = missionPlayerIds.reduce(function(sum, id) {
    return sum + (heatmap[id] || 0);
  }, 0) / Math.max(missionPlayerIds.length, 1);

  if (avgHeat >= 0.3 && proposalCount <= 3) {
    const rejectChance = proposalCount === 1 ? 0.85 : proposalCount === 2 ? 0.65 : 0.30;
    return Math.random() > rejectChance;
  }

  if (myCharacter === 'Merlin') {
    const knowledge = getBotKnowledge(myDeviceId, myCharacter, characters);
    const hasEvil   = missionPlayerIds.some(function(id) { return knowledge.knownEvil.includes(id); });
    if (!hasEvil) return Math.random() < noise ? false : true;
    const strictness = [0.40, 0.60, 0.80][Math.min(proposalCount - 1, 2)];
    const blend = 0.10;
    let pressure = 0;
    if      (merlinRejectRatio > 0.50) pressure = 0.65 * blend;
    else if (merlinRejectRatio > 0.35) pressure = 0.40 * blend;
    else if (merlinRejectRatio > 0.25) pressure = 0.20 * blend;
    else                               pressure = 0.08 * blend;
    const rejects = Math.random() < strictness && Math.random() >= pressure;
    return Math.random() < noise ? !rejects : !rejects;
  }

  if (myCharacter === 'Percival') {
    const knowledge = getBotKnowledge(myDeviceId, myCharacter, characters);
    if (knowledge.merlinDeviceId && missionPlayerIds.includes(knowledge.merlinDeviceId)) {
      return Math.random() < noise ? false : true;
    }
    const rejectRate = proposalCount === 1 ? 0.95 : proposalCount === 2 ? 0.85 : 0.40;
    return Math.random() > rejectRate;
  }

  // Loyal Servant
  const servantRates = [0.95, 0.62, 0.24];
  return Math.random() > servantRates[Math.min(proposalCount - 1, 2)];
}


// -----------------------------------------------------------------------------
// DECISION: MISSION VOTE
// -----------------------------------------------------------------------------

export function decideBotMissionVote(
  myDeviceId:       string,
  myCharacter:      CharacterName,
  characters:       Record<string, CharacterName>,
  evilWins:         number,
  currentQuest:     number,
  missionPlayerIds: string[]
): 'success' | 'fail' {
  if (CHARACTERS[myCharacter].alignment !== 'evil') return 'success';
  if (myCharacter === 'Oberon') return Math.random() < 0.85 ? 'fail' : 'success';
  if (evilWins >= 2) return 'fail';
  if (currentQuest === 1) return Math.random() < 0.15 ? 'fail' : 'success';
  return Math.random() < 0.75 ? 'fail' : 'success';
}


// -----------------------------------------------------------------------------
// DECISION: LADY OF THE LAKE
// -----------------------------------------------------------------------------

export function decideBotLadyTarget(
  myDeviceId:  string,
  myCharacter: CharacterName,
  characters:  Record<string, CharacterName>,
  eligibleIds: string[],
  heatmap:     Record<string, number>
): string | null {
  if (eligibleIds.length === 0) return null;
  const knowledge = getBotKnowledge(myDeviceId, myCharacter, characters);

  if (CHARACTERS[myCharacter].alignment === 'evil' && myCharacter !== 'Oberon') {
    const goodTargets = eligibleIds.filter(function(id) { return !knowledge.knownEvil.includes(id); });
    if (goodTargets.length > 0 && Math.random() > 0.15) {
      return goodTargets[Math.floor(Math.random() * goodTargets.length)];
    }
    return eligibleIds[Math.floor(Math.random() * eligibleIds.length)];
  }

  const unknowns = eligibleIds.filter(function(id) { return !knowledge.knownEvil.includes(id); });
  const targets  = unknowns.length > 0 ? unknowns : eligibleIds;
  const sorted   = [...targets].sort(function(a, b) { return (heatmap[b] || 0) - (heatmap[a] || 0); });
  return Math.random() < 0.70 ? sorted[0] : sorted[Math.floor(Math.random() * Math.ceil(sorted.length / 2))];
}


// -----------------------------------------------------------------------------
// DECISION: ASSASSINATION
// -----------------------------------------------------------------------------

export function decideBotAssassination(
  myDeviceId:  string,
  myCharacter: CharacterName,
  characters:  Record<string, CharacterName>,
  allPlayers:  Player[],
  heatmap:     Record<string, number>
): string {
  const knowledge   = getBotKnowledge(myDeviceId, myCharacter, characters);
  const goodPlayers = allPlayers.filter(function(p) {
    return p.deviceId !== myDeviceId && !knowledge.knownEvil.includes(p.deviceId);
  });
  if (goodPlayers.length === 0) return allPlayers[0].deviceId;
  const sorted = [...goodPlayers].sort(function(a, b) {
    return (heatmap[a.deviceId] || 0) - (heatmap[b.deviceId] || 0);
  });
  return Math.random() < 0.45
    ? sorted[0].deviceId
    : goodPlayers[Math.floor(Math.random() * goodPlayers.length)].deviceId;
}