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
// MISSION RECORD
//
// Extends the failed-team heatmap with leader identity and recency.
// Stored per completed mission (pass or fail).
// -----------------------------------------------------------------------------

export interface MissionRecord {
  leaderDeviceId: string;
  teamDeviceIds:  string[];
  missionPassed:  boolean;
  questIndex:     number;   // 0-4, used for recency weighting
}


// -----------------------------------------------------------------------------
// HEATMAP  (recency-weighted)
//
// Recent failures count more than old ones. Being on the last failed mission
// is far more suspicious than being on one three quests ago.
// Weights: most recent failure = 3.0, second most = 2.0, all older = 1.0
// -----------------------------------------------------------------------------

export function computeHeatmap(
  missionHistory: MissionRecord[]
): Record<string, number> {
  const failures = missionHistory
    .filter(function(r) { return !r.missionPassed; })
    .sort(function(a, b) { return b.questIndex - a.questIndex; }); // newest first

  const heat: Record<string, number> = {};
  failures.forEach(function(record, idx) {
    const weight = idx === 0 ? 3.0 : idx === 1 ? 2.0 : 1.0;
    for (const id of record.teamDeviceIds) {
      heat[id] = (heat[id] || 0) + weight;
    }
  });
  return heat;
}


// -----------------------------------------------------------------------------
// PROPOSAL AUTHORSHIP SUSPICION
//
// Public knowledge: who proposed which team, and whether it passed.
// Evil leaders tend to propose teams containing their allies — those teams
// then fail. High "propose-fail rate" = suspicious leader.
// Score = failed missions proposed / total missions proposed (as leader).
// -----------------------------------------------------------------------------

export function computeProposalSuspicion(
  missionHistory: MissionRecord[]
): Record<string, number> {
  const proposed: Record<string, number> = {};
  const proposedFails: Record<string, number> = {};

  for (const record of missionHistory) {
    proposed[record.leaderDeviceId] = (proposed[record.leaderDeviceId] || 0) + 1;
    if (!record.missionPassed) {
      proposedFails[record.leaderDeviceId] = (proposedFails[record.leaderDeviceId] || 0) + 1;
    }
  }

  const suspicion: Record<string, number> = {};
  for (const id of Object.keys(proposed)) {
    suspicion[id] = (proposedFails[id] || 0) / proposed[id];
  }
  return suspicion;
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
  roleReveal:    { min: 400,  max: 1000  },
  leaderPropose: { min: 5000, max: 7000  }, // linger on team-propose screen
  proposalVote:  { min: 300,  max: 1000  }, // individual approve/reject votes
  missionVote:   { min: 750,  max: 2000  },
  ladyTarget:    { min: 8000, max: 12000 }, // linger on LOTL screen
  assassination: { min: 1250, max: 2750  },
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
// VOTE HISTORY SUSPICION
//
// Public knowledge: who voted approve/reject on each proposal, and whether
// that mission passed or failed. From this we can derive per-player suspicion.
//
// Evil players tend to approve teams that fail (their allies are on them).
// Good players tend to reject teams that fail (Merlin/Percival can see evil).
// Loyal Servant can use this as a weak but real signal.
// -----------------------------------------------------------------------------

export interface VoteRecord {
  voterId:      string;
  approved:     boolean;
  missionPassed: boolean;
}

export function computeVoteSuspicion(
  voteHistory: VoteRecord[]
): Record<string, number> {
  // Suspicion score = (times approved a failing mission) / (total votes cast)
  // Range 0-1. Higher = more suspicious.
  const approvedFails:  Record<string, number> = {};
  const totalVotes:     Record<string, number> = {};

  for (const record of voteHistory) {
    totalVotes[record.voterId]    = (totalVotes[record.voterId]    || 0) + 1;
    if (record.approved && !record.missionPassed) {
      approvedFails[record.voterId] = (approvedFails[record.voterId] || 0) + 1;
    }
  }

  const suspicion: Record<string, number> = {};
  for (const id of Object.keys(totalVotes)) {
    suspicion[id] = (approvedFails[id] || 0) / totalVotes[id];
  }
  return suspicion;
}


// Per-player reject rate on failing missions — high = likely had alignment knowledge
// Used by Merlin for blending calibration and Percival for decoy targeting
export function computeRejectOnFailRate(
  voteHistory: VoteRecord[]
): Record<string, number> {
  const rejectsOnFail: Record<string, number> = {};
  const totalVotes:    Record<string, number> = {};

  for (const record of voteHistory) {
    totalVotes[record.voterId] = (totalVotes[record.voterId] || 0) + 1;
    if (!record.approved && !record.missionPassed) {
      rejectsOnFail[record.voterId] = (rejectsOnFail[record.voterId] || 0) + 1;
    }
  }

  const rates: Record<string, number> = {};
  for (const id of Object.keys(totalVotes)) {
    rates[id] = (rejectsOnFail[id] || 0) / totalVotes[id];
  }
  return rates;
}


// Average reject-on-fail rate across all players with enough vote history
// Merlin uses this as a baseline to know if he's standing out
export function computePopulationRejectRate(
  voteHistory: VoteRecord[],
  excludeId:   string
): number {
  const rates = computeRejectOnFailRate(voteHistory);
  const others = Object.entries(rates).filter(function([id]) { return id !== excludeId; });
  if (others.length === 0) return 0;
  return others.reduce(function(s, [, r]) { return s + r; }, 0) / others.length;
}


// -----------------------------------------------------------------------------
// DECISION: PROPOSAL VOTE
// -----------------------------------------------------------------------------

export function decideBotProposalVote(
  myDeviceId:         string,
  myCharacter:        CharacterName,
  characters:         Record<string, CharacterName>,
  missionPlayerIds:   string[],
  heatmap:            Record<string, number>,
  proposalCount:      number,
  merlinRejectRatio:  number,
  voteHistory:        VoteRecord[],
  ladyKnowledge:      Record<string, 'good' | 'evil'>,
  merlinDeviceId:     string | null,
  proposalSuspicion:  Record<string, number>,   // leader propose-fail rate
  currentLeaderId:    string                     // who proposed this team
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

  // ---------------------------------------------------------------------------
  // PROPOSER SELF-CONSISTENCY
  // If this bot proposed the team, it should almost always approve its own work.
  // Only override if LoTL has confirmed someone evil is on it (hard evidence),
  // or if a team member is extremely hot (last two failed missions) AND
  // the bot did NOT put itself on the team (unlikely to self-sabotage).
  // ---------------------------------------------------------------------------
  const iAmProposer = myDeviceId === currentLeaderId;
  if (iAmProposer) {
    // Hard override: LoTL confirmed evil on team — even proposer should pull back
    const hasConfirmedEvil = missionPlayerIds.some(function(id) {
      return (ladyKnowledge[id] === 'evil');
    });
    if (hasConfirmedEvil) {
      // Proposer got new LoTL info after proposing — 60% chance they reconsider
      return Math.random() > 0.60;
    }

    // Soft override: very high heat on team members they didn't put themselves on
    const iAmOnTeam = missionPlayerIds.includes(myDeviceId);
    const otherHeat = missionPlayerIds
      .filter(function(id) { return id !== myDeviceId; })
      .reduce(function(sum, id) { return sum + (heatmap[id] || 0); }, 0) /
      Math.max(missionPlayerIds.length - (iAmOnTeam ? 1 : 0), 1);

    if (otherHeat >= 0.7 && !iAmOnTeam) {
      // Teammate looks really bad and proposer isn't personally invested — 25% reconsider
      return Math.random() > 0.25;
    }

    // Otherwise: proposers back their own teams strongly
    // 4% noise flip, otherwise approve
    return Math.random() > 0.04;
  }

  // Vote-based suspicion — available to all good bots
  const voteSuspicion = computeVoteSuspicion(voteHistory);

  // Lady knowledge — if this bot has investigated someone via LoTL, use it
  const hasKnownEvil = missionPlayerIds.some(function(id) {
    return ladyKnowledge[id] === 'evil';
  });
  const hasKnownGood = missionPlayerIds.every(function(id) {
    return ladyKnowledge[id] === 'good' || !ladyKnowledge[id];
  });

  // If LoTL revealed a confirmed evil player on this team, reject strongly
  if (hasKnownEvil && proposalCount <= 3) {
    const rejectChance = proposalCount === 1 ? 0.95 : proposalCount === 2 ? 0.80 : 0.50;
    return Math.random() > rejectChance;
  }

  // Heatmap check
  const avgHeat = missionPlayerIds.reduce(function(sum, id) {
    return sum + (heatmap[id] || 0);
  }, 0) / Math.max(missionPlayerIds.length, 1);

  if (avgHeat >= 0.3 && proposalCount <= 3) {
    const rejectChance = proposalCount === 1 ? 0.85 : proposalCount === 2 ? 0.65 : 0.30;
    return Math.random() > rejectChance;
  }

  // Leader suspicion: if this leader has a high propose-fail rate, be skeptical
  // Only meaningful after at least 2 missions have been proposed by this leader
  const leaderSuspicion = proposalSuspicion[currentLeaderId] || 0;
  if (leaderSuspicion >= 0.67 && proposalCount <= 3) {
    // Leader has failed 2/3+ of their proposed missions — suspicious
    const rejectChance = proposalCount === 1 ? 0.75 : proposalCount === 2 ? 0.55 : 0.20;
    return Math.random() > rejectChance;
  }

  // ---------------------------------------------------------------------------
  // MERLIN
  // ---------------------------------------------------------------------------
  if (myCharacter === 'Merlin') {
    const knowledge = getBotKnowledge(myDeviceId, myCharacter, characters);
    const hasEvil   = missionPlayerIds.some(function(id) { return knowledge.knownEvil.includes(id); });
    if (!hasEvil) return Math.random() < noise ? false : true;

    // Compare Merlin's reject-on-fail rate to the population average.
    // If he's a significant outlier, he's becoming identifiable — blend harder.
    const rejectRates    = computeRejectOnFailRate(voteHistory);
    const myRejectRate   = rejectRates[myDeviceId] || 0;
    const popRejectRate  = computePopulationRejectRate(voteHistory, myDeviceId);
    const outlierDelta   = myRejectRate - popRejectRate;  // how much above average

    // Base blend factor — increases when Merlin is standing out statistically
    let blend = 0.10;
    if      (outlierDelta > 0.40) blend = 0.35;  // very obvious — blend hard
    else if (outlierDelta > 0.25) blend = 0.22;  // noticeable
    else if (outlierDelta > 0.10) blend = 0.14;  // slightly above average

    // Also modulate by raw reject ratio (original signal)
    let pressure = 0;
    if      (merlinRejectRatio > 0.50) pressure = 0.65 * blend;
    else if (merlinRejectRatio > 0.35) pressure = 0.40 * blend;
    else if (merlinRejectRatio > 0.25) pressure = 0.20 * blend;
    else                               pressure = 0.08 * blend;

    const strictness = [0.40, 0.60, 0.80][Math.min(proposalCount - 1, 2)];
    const rejects    = Math.random() < strictness && Math.random() >= pressure;
    return Math.random() < noise ? !rejects : !rejects;
  }

  // ---------------------------------------------------------------------------
  // PERCIVAL (no Morgana — knows Merlin exactly)
  // ---------------------------------------------------------------------------
  if (myCharacter === 'Percival') {
    const knowledge = getBotKnowledge(myDeviceId, myCharacter, characters);
    const merlinId  = knowledge.merlinDeviceId;

    if (merlinId && missionPlayerIds.includes(merlinId)) {
      // Merlin is on the team — check if anyone else looks suspicious
      const avgVoteSuspicion = missionPlayerIds
        .filter(function(id) { return id !== merlinId; })
        .reduce(function(s, id) { return s + (voteSuspicion[id] || 0); }, 0) /
        Math.max(missionPlayerIds.length - 1, 1);
      if (avgVoteSuspicion > 0.6 && proposalCount <= 2) {
        return Math.random() > 0.60;
      }
      return Math.random() < noise ? false : true;
    }

    // Merlin not on team.
    // DECOY LOGIC: Percival mirrors Merlin's reject pattern deliberately
    // to make himself look like an information-holder to the Assassin.
    // He checks Merlin's recent votes and tries to match the pattern.
    if (merlinId && voteHistory.length >= 3) {
      const merlinVotes      = voteHistory.filter(function(r) { return r.voterId === merlinId; });
      const merlinRejectRate = merlinVotes.length > 0
        ? merlinVotes.filter(function(r) { return !r.approved; }).length / merlinVotes.length
        : 0;

      // Percival targets a reject rate slightly HIGHER than Merlin's
      // so he looks more suspicious (draws Assassin toward himself)
      const decoyRejectRate = Math.min(0.98, merlinRejectRate + 0.15);

      const baseReject = proposalCount === 1 ? 0.95 : proposalCount === 2 ? 0.85 : 0.40;
      // Blend between base strategic rejection and the decoy rate
      const targetReject = (baseReject + decoyRejectRate) / 2;
      const adjusted = Math.min(0.98, targetReject + (voteSuspicion[myDeviceId] || 0) * 0.10);
      return Math.random() > adjusted;
    }

    // Fallback — no Merlin vote history yet, use vote suspicion
    const avgVoteSuspicion = missionPlayerIds.reduce(function(s, id) {
      return s + (voteSuspicion[id] || 0);
    }, 0) / Math.max(missionPlayerIds.length, 1);
    const baseReject = proposalCount === 1 ? 0.95 : proposalCount === 2 ? 0.85 : 0.40;
    const adjusted = Math.min(0.98, baseReject + avgVoteSuspicion * 0.20);
    return Math.random() > adjusted;
  }

  // ---------------------------------------------------------------------------
  // LOYAL SERVANT — vote suspicion + lady knowledge
  // ---------------------------------------------------------------------------
  const avgVoteSuspicion = missionPlayerIds.reduce(function(s, id) {
    return s + (voteSuspicion[id] || 0);
  }, 0) / Math.max(missionPlayerIds.length, 1);

  const servantRates = [0.95, 0.62, 0.24];
  let baseReject = servantRates[Math.min(proposalCount - 1, 2)];
  baseReject = Math.min(0.98, baseReject + avgVoteSuspicion * 0.25);
  // Also factor in whether the leader has a bad proposal track record
  baseReject = Math.min(0.98, baseReject + leaderSuspicion * 0.15);
  if (hasKnownGood && Object.keys(ladyKnowledge).length > 0) {
    baseReject = Math.max(0, baseReject - 0.15);
  }
  return Math.random() > baseReject;
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
//
// The Assassin knows who is evil. Everyone else is a good candidate for Merlin.
// She scores each good player across four public signals:
//
//   1. REJECT RATIO ON EVIL TEAMS: how often did this player reject proposals
//      that contained a known evil player? High = likely had information = Merlin.
//
//   2. CORRECT VOTE RATE: how often did this player's vote match the "correct"
//      outcome (rejected failing teams, approved passing teams)? Merlin votes
//      correctly more than Servants even with blending.
//
//   3. HEAT SCORE (inverse): Merlin avoids being on failed mission teams.
//      Low heat = stayed clean = may have steered proposals deliberately.
//
//   4. APPROVE RATE ON GOOD TEAMS: Merlin approves clean teams readily.
//      Servants approve randomly. High approval of eventually-passing teams
//      is a weak positive signal.
//
// Each signal produces a 0-1 score. They are weighted and summed into a final
// suspicion score. The highest-scoring good player is the assassination target.
// -----------------------------------------------------------------------------

export function decideBotAssassination(
  myDeviceId:  string,
  myCharacter: CharacterName,
  characters:  Record<string, CharacterName>,
  allPlayers:  Player[],
  heatmap:     Record<string, number>,
  voteHistory: VoteRecord[]
): string {
  const knowledge   = getBotKnowledge(myDeviceId, myCharacter, characters);
  const goodPlayers = allPlayers.filter(function(p) {
    return p.deviceId !== myDeviceId && !knowledge.knownEvil.includes(p.deviceId);
  });

  if (goodPlayers.length === 0) return allPlayers[0].deviceId;
  if (goodPlayers.length === 1) return goodPlayers[0].deviceId;

  // Build per-player vote stats from public history
  // We know who is evil, so we can categorize each proposal outcome
  const stats: Record<string, {
    rejectsOnEvilTeam:  number;
    rejectsOnCleanTeam: number;
    approvesOnFailTeam: number;
    approvesOnPassTeam: number;
    totalVotes:         number;
  }> = {};

  goodPlayers.forEach(function(p) {
    stats[p.deviceId] = {
      rejectsOnEvilTeam:  0,
      rejectsOnCleanTeam: 0,
      approvesOnFailTeam: 0,
      approvesOnPassTeam: 0,
      totalVotes:         0,
    };
  });

  // We don't have the team composition per vote in voteHistory (only voterId,
  // approved, missionPassed), so we use what we have:
  //   - approved + missionPassed  = approved a good team (good signal for correctness)
  //   - approved + !missionPassed = approved a failing team (evil signal)
  //   - rejected + missionPassed  = rejected a good team (mild bad signal)
  //   - rejected + !missionPassed = rejected a failing team (good signal — likely knew)
  for (const record of voteHistory) {
    if (!stats[record.voterId]) continue;
    const s = stats[record.voterId];
    s.totalVotes++;
    if (!record.approved && !record.missionPassed) s.rejectsOnEvilTeam++;
    if (!record.approved &&  record.missionPassed) s.rejectsOnCleanTeam++;
    if ( record.approved && !record.missionPassed) s.approvesOnFailTeam++;
    if ( record.approved &&  record.missionPassed) s.approvesOnPassTeam++;
  }

  // Score each good player — higher score = more likely to be Merlin
  const scores: Record<string, number> = {};

  for (const player of goodPlayers) {
    const id = player.deviceId;
    const s  = stats[id];
    let score = 0;

    if (s.totalVotes > 0) {
      // Signal 1: reject rate on failing missions (weight 0.40)
      // Merlin rejects evil teams — this is the strongest signal
      const rejectOnFailRate = s.rejectsOnEvilTeam / s.totalVotes;
      score += rejectOnFailRate * 0.40;

      // Signal 2: overall correctness rate (weight 0.30)
      // correct = (rejected fails + approved passes) / total
      const correct = (s.rejectsOnEvilTeam + s.approvesOnPassTeam) / s.totalVotes;
      score += correct * 0.30;

      // Signal 3: approved failing teams (weight -0.20, negative — reduces score)
      // Merlin rarely approves evil teams; high rate here suggests NOT Merlin
      const approveFailRate = s.approvesOnFailTeam / s.totalVotes;
      score -= approveFailRate * 0.20;
    }

    // Signal 4: inverse heat score (weight 0.10)
    // Merlin stays off failed mission teams deliberately
    const maxHeat = Math.max(1, ...Object.values(heatmap));
    const heatScore = (heatmap[id] || 0) / maxHeat;
    score += (1 - heatScore) * 0.10;

    scores[id] = Math.max(0, score);
  }

  // Sort by score descending
  const ranked = [...goodPlayers].sort(function(a, b) {
    return (scores[b.deviceId] || 0) - (scores[a.deviceId] || 0);
  });

  // If we have meaningful vote history, lean heavily on the top scorer.
  // Without history (early game), fall back to the old heatmap approach.
  const hasHistory = voteHistory.length >= goodPlayers.length * 2;

  if (hasHistory) {
    // 65% pick the top-scored player, 25% pick 2nd, 10% random
    const roll = Math.random();
    if (roll < 0.65) return ranked[0].deviceId;
    if (roll < 0.90 && ranked.length > 1) return ranked[1].deviceId;
    return goodPlayers[Math.floor(Math.random() * goodPlayers.length)].deviceId;
  } else {
    // Fallback: original heatmap approach (low heat = stayed clean = likely Merlin)
    const byHeat = [...goodPlayers].sort(function(a, b) {
      return (heatmap[a.deviceId] || 0) - (heatmap[b.deviceId] || 0);
    });
    return Math.random() < 0.45
      ? byHeat[0].deviceId
      : goodPlayers[Math.floor(Math.random() * goodPlayers.length)].deviceId;
  }
}