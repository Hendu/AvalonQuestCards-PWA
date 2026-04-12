// =============================================================================
// botBrain.ts  (v4.1)
//
// Pure decision-making logic for bot players. All functions are stateless and
// side-effect free. No Firestore calls here.
//
// DESIGN PHILOSOPHY — validated by simulation (sim1–sim14, 300k game runs):
//
//   Target: 50% good win rate when Percival is used and no special evil
//   characters are in play (Assassin + Minions only). Achieved at 50.8%.
//
//   Key mechanisms:
//
//   HEATMAP: After each failed mission, all players on that team accumulate
//   a heat score. All good bots heavily reject teams with high average heat.
//   This is the single biggest lever — alone it jumps good wins from 5% to 38%.
//
//   GRADUATED REJECTION: Good bots reject aggressively on proposal 1, ease
//   off at proposal 2, ease off more at proposal 3, and always approve at
//   proposal 4 (to prevent 5-rejection auto-evil-win). This allows very high
//   base rejection rates with zero auto-loss risk.
//
//   PERCIVAL COORDINATION: Without Morgana in play, Percival knows exactly
//   who Merlin is. He always includes Merlin in his own proposals, and rejects
//   any team without Merlin on proposals 1-2 (95%/85%). This makes Percival
//   a second reliable information source alongside Merlin.
//
//   MERLIN BLENDING: Merlin rejects evil teams but modulates based on his
//   running reject ratio to avoid being obviously identified by the Assassin.
//   Blend factor 0.10 — enough to stay somewhat hidden without sacrificing
//   too much steering power. Detectability gap vs Loyal Servant: ~20pp
//   (down from 43pp without blending).
//
//   THINK DELAY: All bot actions are delayed 1.2–4.5 seconds with per-role
//   variance so bots don't vote as an instant bloc.
//
// Information hiding — each bot only acts on what their role can see:
//   Merlin:        sees all evil (since no Mordred in recommended setup)
//   Percival:      sees Merlin only (no Morgana = no confusion)
//   Loyal Servant: sees nobody
//   Assassin:      sees Minion allies (not Oberon if present)
//   Minion:        sees Assassin (not Oberon if present)
//   Oberon:        sees nobody; nobody sees Oberon
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
//
// Tracks how many failed missions each player has appeared on.
// Built from public game history only — no alignment knowledge needed.
// All good bots use this to reject teams with high average heat.
// -----------------------------------------------------------------------------

export function computeHeatmap(
  failedMissionTeams: string[][]   // each entry is a list of deviceIds on a failed mission
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
//
// Returns what a bot is allowed to know about other players' alignments,
// based strictly on their character's vision rules.
// -----------------------------------------------------------------------------

export interface BotKnowledge {
  knownEvil:       string[];   // deviceIds this bot knows are evil
  knownGood:       string[];   // deviceIds this bot knows are good (unused currently)
  merlinDeviceId:  string | null;  // Percival only: exact Merlin identity (no Morgana = no ambiguity)
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
      // Merlin sees all evil except Mordred (not in recommended bot setup)
      if (CHARACTERS[character].alignment === 'evil' && character !== 'Mordred') {
        knownEvil.push(deviceId);
      }
    } else if (myCharacter === 'Percival') {
      // Without Morgana: Percival sees exactly one player as Merlin — no ambiguity
      if (character === 'Merlin') {
        merlinDeviceId = deviceId;
      }
      // If Morgana is present, Percival can't distinguish — but recommended setup excludes her
      if (character === 'Morgana') {
        // In this case treat it as 50/50 — don't set merlinDeviceId
        merlinDeviceId = null;
      }
    } else if (
      CHARACTERS[myCharacter].alignment === 'evil' &&
      myCharacter !== 'Oberon'
    ) {
      // Evil (except Oberon) sees all evil except Oberon
      if (CHARACTERS[character].alignment === 'evil' && character !== 'Oberon') {
        knownEvil.push(deviceId);
      }
    }
    // Loyal Servants, Oberon: see nobody
  }

  return { knownEvil, knownGood, merlinDeviceId };
}


// -----------------------------------------------------------------------------
// TEAM PROPOSAL
//
// Returns an array of deviceIds to include on the mission team.
//
// Simulation findings:
//   - Good leaders sort candidates by heat score (least suspicious first)
//   - Percival always includes Merlin when he proposes
//   - Evil leaders always include themselves, try to include one ally
//   - Oberon proposes randomly (no knowledge of allies)
// -----------------------------------------------------------------------------

export function decideBotProposal(
  myDeviceId:         string,
  myCharacter:        CharacterName,
  characters:         Record<string, CharacterName>,
  allPlayers:         Player[],
  heatmap:            Record<string, number>,
  missionSize:        number
): string[] {
  const knowledge = getBotKnowledge(myDeviceId, myCharacter, characters);
  const allIds    = allPlayers.map(function(p) { return p.deviceId; });

  // Oberon: no knowledge, propose randomly including self
  if (myCharacter === 'Oberon') {
    const others = shuffleArray(allIds.filter(function(id) { return id !== myDeviceId; }));
    return [myDeviceId, ...others].slice(0, missionSize);
  }

  if (CHARACTERS[myCharacter].alignment === 'evil') {
    // Evil: always include self, try to include one known ally
    let team: string[] = [myDeviceId];
    const allies = knowledge.knownEvil.filter(function(id) { return id !== myDeviceId; });

    if (allies.length > 0 && missionSize >= 2 && Math.random() > 0.3) {
      team.push(allies[Math.floor(Math.random() * allies.length)]);
    }

    // Fill remaining slots from non-obvious players (sorted by heat ascending)
    const fill = allIds
      .filter(function(id) { return !team.includes(id); })
      .sort(function(a, b) { return (heatmap[a] || 0) - (heatmap[b] || 0); });

    while (team.length < missionSize && fill.length > 0) {
      team.push(fill.shift()!);
    }
    return team.slice(0, missionSize);
  }

  // Good: build cleanest possible team
  let team: string[] = [myDeviceId];

  // Percival always includes Merlin (he knows exactly who it is, no Morgana)
  if (myCharacter === 'Percival' && knowledge.merlinDeviceId && !team.includes(knowledge.merlinDeviceId)) {
    team.push(knowledge.merlinDeviceId);
  }

  // Sort remaining candidates by heat ascending, excluding known evil
  const candidates = allIds
    .filter(function(id) {
      return !team.includes(id) && !knowledge.knownEvil.includes(id);
    })
    .sort(function(a, b) { return (heatmap[a] || 0) - (heatmap[b] || 0); });

  while (team.length < missionSize && candidates.length > 0) {
    team.push(candidates.shift()!);
  }

  // Fallback if still short (edge case)
  if (team.length < missionSize) {
    const rem = allIds.filter(function(id) { return !team.includes(id); });
    while (team.length < missionSize && rem.length > 0) {
      team.push(rem.shift()!);
    }
  }

  return team.slice(0, missionSize);
}


// -----------------------------------------------------------------------------
// PROPOSAL VOTE
//
// Returns true = approve, false = reject.
//
// Simulation findings:
//   - GRADUATED REJECTION is the key to preventing auto-losses while keeping
//     high rejection rates. Rates scale down as proposal count rises:
//       prop 1: full rate
//       prop 2: ~65% of rate
//       prop 3: ~25% of rate
//       prop 4+: always approve (hard rule)
//
//   - HEATMAP CHECK: all good bots reject teams with avg heat >= 0.3 first,
//     before any character-specific logic.
//
//   - PERCIVAL: rejects teams without Merlin 95%/85%/40% on props 1/2/3.
//     Trusts any team that includes Merlin.
//
//   - MERLIN: blend factor 0.10 — modulates rejection rate based on running
//     reject ratio to avoid being identified as Merlin by voting pattern alone.
//
//   - LOYAL SERVANT: rejects at 95%/62%/24% on props 1/2/3.
//     Aggressive but safe due to easing schedule.
// -----------------------------------------------------------------------------

export function decideBotProposalVote(
  myDeviceId:        string,
  myCharacter:       CharacterName,
  characters:        Record<string, CharacterName>,
  missionPlayerIds:  string[],
  heatmap:           Record<string, number>,
  proposalCount:     number,    // 1-5; at 4+ everyone approves to avoid auto-loss
  merlinRejectRatio: number     // running ratio of rejects/total for Merlin (0-1)
): boolean {
  // Hard rule: everyone approves at proposal 4+ to prevent 5-rejection auto-evil-win
  if (proposalCount >= 4) return true;

  const noise = 0.12;

  // ---------------------------------------------------------------------------
  // EVIL BOTS
  // ---------------------------------------------------------------------------
  if (myCharacter === 'Oberon') {
    // Oberon votes randomly — he doesn't know the plan
    return Math.random() > 0.45;
  }

  if (CHARACTERS[myCharacter].alignment === 'evil') {
    const knowledge = getBotKnowledge(myDeviceId, myCharacter, characters);
    const hasAlly   = missionPlayerIds.some(function(id) {
      return knowledge.knownEvil.includes(id) || id === myDeviceId;
    });
    const base = hasAlly;
    return Math.random() < noise ? !base : base;
  }

  // ---------------------------------------------------------------------------
  // GOOD BOTS — heatmap check first
  // ---------------------------------------------------------------------------
  const avgHeat = missionPlayerIds.reduce(function(sum, id) {
    return sum + (heatmap[id] || 0);
  }, 0) / Math.max(missionPlayerIds.length, 1);

  if (avgHeat >= 0.3 && proposalCount <= 3) {
    // Reject hot teams — 85% chance, eases with proposal count
    const rejectChance = proposalCount === 1 ? 0.85 : proposalCount === 2 ? 0.65 : 0.30;
    return Math.random() > rejectChance;
  }

  // ---------------------------------------------------------------------------
  // MERLIN — strategic blending
  // ---------------------------------------------------------------------------
  if (myCharacter === 'Merlin') {
    const knowledge = getBotKnowledge(myDeviceId, myCharacter, characters);
    const hasEvil   = missionPlayerIds.some(function(id) {
      return knowledge.knownEvil.includes(id);
    });

    if (!hasEvil) {
      // Clean team — approve with noise
      return Math.random() < noise ? false : true;
    }

    // Evil on team — want to reject, but blend to stay hidden
    // Strictness increases with proposal count (same as a human Merlin would)
    const strictness = [0.40, 0.60, 0.80][Math.min(proposalCount - 1, 2)];

    // Blend pressure: if running reject ratio is getting suspicious, force some approvals
    const blend = 0.10;
    let pressure = 0;
    if      (merlinRejectRatio > 0.50) pressure = 0.65 * blend;
    else if (merlinRejectRatio > 0.35) pressure = 0.40 * blend;
    else if (merlinRejectRatio > 0.25) pressure = 0.20 * blend;
    else                               pressure = 0.08 * blend;

    const rejects = Math.random() < strictness && Math.random() >= pressure;
    return Math.random() < noise ? !rejects : !rejects;
  }

  // ---------------------------------------------------------------------------
  // PERCIVAL — reject teams without Merlin on early proposals
  // ---------------------------------------------------------------------------
  if (myCharacter === 'Percival') {
    const knowledge = getBotKnowledge(myDeviceId, myCharacter, characters);

    // If Merlin is on the team, trust the team — approve
    if (knowledge.merlinDeviceId && missionPlayerIds.includes(knowledge.merlinDeviceId)) {
      return Math.random() < noise ? false : true;
    }

    // Merlin not on team — suspicious; reject rate eases with proposal count
    const rejectRate = proposalCount === 1 ? 0.95 : proposalCount === 2 ? 0.85 : 0.40;
    return Math.random() > rejectRate;
  }

  // ---------------------------------------------------------------------------
  // LOYAL SERVANT — graduated rejection, no alignment knowledge
  // Aggressive on prop 1, eases off to prevent auto-loss cascade
  // ---------------------------------------------------------------------------
  const servantRejectRates = [0.95, 0.62, 0.24];
  const rejectRate = servantRejectRates[Math.min(proposalCount - 1, 2)];
  return Math.random() > rejectRate;
}


// -----------------------------------------------------------------------------
// MISSION VOTE
//
// Returns 'success' or 'fail'.
// Only evil bots can vote fail.
//
// Simulation findings:
//   - Quest 1: evil bots conservative (15% fail) to avoid immediate suspicion
//   - Oberon: always aggressive (85% fail) — no coordination, acting alone
//   - Coordinated evil: 75% fail rate on quests 2+, always fail when evilWins >= 2
// -----------------------------------------------------------------------------

export function decideBotMissionVote(
  myDeviceId:      string,
  myCharacter:     CharacterName,
  characters:      Record<string, CharacterName>,
  evilWins:        number,
  currentQuest:    number,
  missionPlayerIds: string[]
): 'success' | 'fail' {
  if (CHARACTERS[myCharacter].alignment !== 'evil') return 'success';

  // Oberon fails aggressively — he's acting alone with no coordination pressure
  if (myCharacter === 'Oberon') {
    return Math.random() < 0.85 ? 'fail' : 'success';
  }

  // Coordinated evil
  if (evilWins >= 2) return 'fail';  // need this win

  // Quest 1: be conservative — failing quest 1 is very suspicious
  if (currentQuest === 1) {
    return Math.random() < 0.15 ? 'fail' : 'success';
  }

  // Quests 2-5: fail 75% of the time
  return Math.random() < 0.75 ? 'fail' : 'success';
}


// -----------------------------------------------------------------------------
// LADY OF THE LAKE TARGET
//
// Returns a deviceId to investigate, or null if no eligible targets.
// -----------------------------------------------------------------------------

export function decideBotLadyTarget(
  myDeviceId:  string,
  myCharacter: CharacterName,
  characters:  Record<string, CharacterName>,
  eligibleIds: string[],   // already filtered: no history members, no self
  heatmap:     Record<string, number>
): string | null {
  if (eligibleIds.length === 0) return null;

  const knowledge = getBotKnowledge(myDeviceId, myCharacter, characters);

  if (CHARACTERS[myCharacter].alignment === 'evil' && myCharacter !== 'Oberon') {
    // Evil: investigate a good player to seem trustworthy
    const goodTargets = eligibleIds.filter(function(id) {
      return !knowledge.knownEvil.includes(id);
    });
    if (goodTargets.length > 0 && Math.random() > 0.15) {
      return goodTargets[Math.floor(Math.random() * goodTargets.length)];
    }
    return eligibleIds[Math.floor(Math.random() * eligibleIds.length)];
  }

  // Good: investigate the most heat-scored player we don't already know about
  const unknowns = eligibleIds.filter(function(id) {
    return !knowledge.knownEvil.includes(id);
  });

  const targets = unknowns.length > 0 ? unknowns : eligibleIds;
  const sorted  = [...targets].sort(function(a, b) {
    return (heatmap[b] || 0) - (heatmap[a] || 0);
  });

  // 70% pick most suspicious, 30% pick randomly from top half
  if (Math.random() < 0.70 && sorted.length > 0) {
    return sorted[0];
  }
  const topHalf = sorted.slice(0, Math.ceil(sorted.length / 2));
  return topHalf[Math.floor(Math.random() * topHalf.length)];
}


// -----------------------------------------------------------------------------
// ASSASSINATION
//
// Evil assassin bot guesses who Merlin is.
// Without Morgana: Percival knows Merlin, so Assassin watches who Percival
// protects/proposes and who rejects the most (Merlin tends to reject evil teams).
// Accuracy: 45% — reasonable without Morgana confusion to help.
// -----------------------------------------------------------------------------

export function decideBotAssassination(
  myDeviceId:   string,
  myCharacter:  CharacterName,
  characters:   Record<string, CharacterName>,
  allPlayers:   Player[],
  heatmap:      Record<string, number>
): string {
  const knowledge    = getBotKnowledge(myDeviceId, myCharacter, characters);
  const goodPlayers  = allPlayers.filter(function(p) {
    return !isEvil(p.deviceId, characters) && p.deviceId !== myDeviceId;
  });

  if (goodPlayers.length === 0) return allPlayers[0].deviceId;

  // Merlin tends to reject the most proposals (even with blending).
  // Use heatmap inversely — Merlin avoids being on failed teams,
  // so he has LOW heat but HIGH reject count.
  // Simplified: pick the good player who is LEAST on the heatmap
  // (stayed off suspicious teams = probably had information = probably Merlin)
  const sorted = [...goodPlayers].sort(function(a, b) {
    return (heatmap[a.deviceId] || 0) - (heatmap[b.deviceId] || 0);
  });

  // 45% accuracy: pick the most Merlin-likely candidate, else random good
  return Math.random() < 0.45
    ? sorted[0].deviceId
    : goodPlayers[Math.floor(Math.random() * goodPlayers.length)].deviceId;
}


// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

function isEvil(deviceId: string, characters: Record<string, CharacterName>): boolean {
  const char = characters[deviceId];
  return !!char && CHARACTERS[char].alignment === 'evil';
}


// -----------------------------------------------------------------------------
// THINK DELAY
//
// Returns a randomized delay in ms before a bot acts.
// Different roles get different ranges to create natural timing variation.
// -----------------------------------------------------------------------------

export function botThinkDelay(
  min = 1200,
  max = 3200
): number {
  return Math.floor(min + Math.random() * (max - min));
}

// Role-specific delays for more natural feel
export const BOT_DELAYS = {
  roleReveal:   { min: 800,  max: 2000 },  // quick -- they don't need to "read" much
  proposalVote: { min: 1000, max: 3500 },  // deliberate
  missionVote:  { min: 1500, max: 4000 },  // most deliberate -- big decision
  ladyTarget:   { min: 2000, max: 4500 },  // dramatic pause
  assassination:{ min: 2500, max: 5500 },  // long pause -- feels weighty
};