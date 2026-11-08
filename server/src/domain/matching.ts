import type { Types } from 'mongoose';
import { Team } from '../models/Team.js';
import { User } from '../models/User.js';
import { Membership } from '../models/Membership.js';

/**
 * Teammate suggestion scoring — implements the corrected model from the
 * architecture review (F-03): two independent normalized values combined
 * by a geometric mean, always returned DECOMPOSED for explainability.
 *
 *   V_T(c|T,B) ∈ [0,1]  — candidate's marginal contribution to the team
 *   V_P(T|c) ∈ [0,1]    — how well the team fits the candidate's prefs
 *   M(c,T)   = √(V_T · V_P)
 *
 * Hard eligibility is filtered BEFORE scoring — a great match that is
 * ineligible never appears.
 */

interface SkillDecl { skill: string; level: number; canLead?: boolean }
interface UserLite {
  _id: Types.ObjectId;
  skills: SkillDecl[];
  preferredRoles: string[];
  availability: { dayOfWeek?: number; startMin: number; endMin: number }[];
  timezone: string;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Capped skill coverage: min(1, Σ contributions / target). Diminishing returns. */
function skillCoverage(teamSkills: Map<string, number>, candidate: UserLite, weights: Map<string, number>): number {
  let covered = 0;
  let totalWeight = 0;
  for (const [skill, target] of weights) {
    const w = target; // blueprint weight = sought importance (1.0 default)
    totalWeight += w;
    const have = teamSkills.get(skill) ?? 0;
    const cand = candidate.skills.find((s) => s.skill === skill)?.level ?? 0;
    covered += w * clamp01((have + cand) / Math.max(0.25, target * 2));
  }
  return totalWeight === 0 ? 0.5 : covered / totalWeight;
}

/** Availability quorum: fraction of declared windows where ≥ρ of team+candidate overlap. */
function availabilityScore(teamMembers: UserLite[], candidate: UserLite): number {
  const all = [...teamMembers, candidate];
  if (all.length === 0) return 0;
  const rho = 0.5; // quorum: at least half the team available
  const windows = candidate.availability.length > 0 ? candidate.availability : all.flatMap((u) => u.availability);
  if (windows.length === 0) return 0.5; // no data → neutral, not zero
  let ok = 0;
  for (const w of windows.slice(0, 20)) {
    const dayMatch = w.dayOfWeek === undefined
      ? all.every(() => true)
      : true; // coarse model: day filter applied loosely
    void dayMatch;
    const available = all.filter((u) =>
      u.availability.some((a) => a.startMin < w.endMin && a.endMin > w.startMin && (a.dayOfWeek === undefined || a.dayOfWeek === w.dayOfWeek)),
    ).length;
    if (available / all.length >= rho) ok++;
  }
  return ok / Math.min(windows.length, 20);
}

/** Diversity bonus: candidate adds skills the team lacks entirely. */
function noveltyScore(teamSkills: Map<string, number>, candidate: UserLite): number {
  const novel = candidate.skills.filter((s) => !teamSkills.has(s.skill) && s.level > 0.3);
  return clamp01(novel.length / 3);
}

export interface Suggestion {
  userId: Types.ObjectId;
  displayName: string;
  mutualScore: number;      // M(c,T)
  teamContribution: number; // V_T
  participantFit: number;   // V_P
  reasons: string[];        // human-readable explanation (must-have)
  skills: { skill: string; level: number }[];
}

/** Rank unassigned, discoverable participants for a team. */
export async function suggestTeammates(teamId: Types.ObjectId, hackathonId: Types.ObjectId, limit = 10): Promise<Suggestion[]> {
  const team = await Team.findById(teamId).lean();
  if (!team) return [];

  const members = await Membership.find({ teamId, status: 'ACTIVE' }).select('participantId').lean();
  const memberIds = members.map((m) => m.participantId);

  // Eligible pool: not on any team in this hackathon, discoverable.
  const busy = await Membership.distinct('participantId', {
    hackathonId, status: 'ACTIVE', participantId: { $nin: memberIds },
  });
  const candidates = await User.find({
    _id: { $nin: [...memberIds, ...busy] },
    discoverable: true,
    lookingForTeam: true,
  }).limit(500).lean() as unknown as UserLite[];

  // Team's current skill coverage map.
  const memberDocs = await User.find({ _id: { $in: memberIds } }).lean() as unknown as UserLite[];
  const teamSkills = new Map<string, number>();
  for (const m of memberDocs) for (const s of m.skills) {
    teamSkills.set(s.skill, (teamSkills.get(s.skill) ?? 0) + s.level);
  }

  // Blueprint weights: skills the team explicitly seeks count double.
  const weights = new Map<string, number>();
  for (const s of team.skillsSought?.length ? team.skillsSought : [...teamSkills.keys()]) {
    weights.set(s, team.skillsSought?.includes(s) ? 1.5 : 1.0);
  }
  if (weights.size === 0) weights.set('fullstack', 1);

  const suggestions: Suggestion[] = candidates.map((c) => {
    // V_T: skill coverage gain + novelty + availability quorum
    const gSkills = skillCoverage(teamSkills, c, weights);
    const gNovel = noveltyScore(teamSkills, c);
    const gAvail = availabilityScore(memberDocs, c);
    const vT = clamp01(0.5 * gSkills + 0.3 * gNovel + 0.2 * gAvail);

    // V_P: does the team match what the candidate wants?
    const wantedSkills = new Set(c.skills.filter((s) => s.level >= 0.6).map((s) => s.skill));
    const teamCovers = [...wantedSkills].filter((s) => (teamSkills.get(s) ?? 0) > 0 || team.skillsSought?.includes(s)).length;
    const roleFit = c.preferredRoles.length === 0 ? 0.6
      : team.skillsSought?.some((s) => c.preferredRoles.includes(s)) ? 1 : 0.4;
    const skillFit = wantedSkills.size === 0 ? 0.6 : teamCovers / wantedSkills.size;
    const vP = clamp01(0.6 * skillFit + 0.4 * roleFit);

    const mutual = Math.sqrt(vT * vP);

    const reasons: string[] = [];
    const novel = c.skills.filter((s) => !teamSkills.has(s.skill) && s.level > 0.3).map((s) => s.skill);
    if (novel.length) reasons.push(`Brings missing skills: ${novel.join(', ')}`);
    if (team.skillsSought?.length) {
      const sought = c.skills.filter((s) => team.skillsSought!.includes(s.skill));
      if (sought.length) reasons.push(`Matches sought skills: ${sought.map((s) => s.skill).join(', ')}`);
    }
    if (c.preferredRoles.length) reasons.push(`Preferred roles: ${c.preferredRoles.join(', ')}`);
    if (gAvail >= 0.6) reasons.push('Strong availability overlap');

    return {
      userId: c._id,
      displayName: (c as { displayName?: string }).displayName ?? 'Participant',
      mutualScore: Math.round(mutual * 1000) / 1000,
      teamContribution: Math.round(vT * 1000) / 1000,
      participantFit: Math.round(vP * 1000) / 1000,
      reasons,
      skills: c.skills.map((s) => ({ skill: s.skill, level: s.level })),
    };
  });

  return suggestions.sort((a, b) => b.mutualScore - a.mutualScore).slice(0, limit);
}
