import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Types } from 'mongoose';
import { Membership } from '../models/Membership.js';
import { setupTestDb, teardownTestDb, makeUser, makeHackathon, makeTeamWithLeader } from './helpers.js';
import { createTeam } from '../domain/teams.js';
import { suggestTeammates } from '../domain/matching.js';
import {
  WEEK_MINUTES,
  windowsToWeekIntervals,
  intersectIntervals,
  totalMinutes,
  tzOffsetMinutes,
  localMinuteOfDay,
  circadianWeight,
  scheduleOverlap,
} from '../domain/time.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);

/* ================= pure circular-time math ================= */

describe('weekly schedule math (circular, 10080-minute week)', () => {
  it('overnight window wraps midnight; adjacent pieces merge into one interval', () => {
    // Monday 22:00 → Tuesday 02:00 — contiguous, so merge yields a single span
    const iv = windowsToWeekIntervals([{ dayOfWeek: 1, startMin: 22 * 60, endMin: 2 * 60 }]);
    expect(totalMinutes(iv)).toBe(4 * 60);
    expect(iv).toEqual([{ start: 1440 + 1320, end: 2880 + 120 }]);
  });

  it('dayOfWeek omitted repeats across all 7 days', () => {
    const iv = windowsToWeekIntervals([{ startMin: 540, endMin: 1020 }]); // 9h–17h daily
    expect(totalMinutes(iv)).toBe(8 * 60 * 7);
  });

  it('Saturday-night window wraps into Sunday across the week boundary', () => {
    // Saturday 23:00 → Sunday 01:00
    const iv = windowsToWeekIntervals([{ dayOfWeek: 6, startMin: 23 * 60, endMin: 60 }]);
    expect(totalMinutes(iv)).toBe(120);
    expect(iv.some((i) => i.start === 0 && i.end === 60)).toBe(true); // wrapped into Sunday
  });

  it('overlapping windows merge instead of double-counting', () => {
    const iv = windowsToWeekIntervals([
      { dayOfWeek: 2, startMin: 540, endMin: 720 },
      { dayOfWeek: 2, startMin: 600, endMin: 780 },
    ]);
    expect(iv).toEqual([{ start: 2 * 1440 + 540, end: 2 * 1440 + 780 }]);
  });

  it('interval intersection is exact', () => {
    const a = windowsToWeekIntervals([{ dayOfWeek: 3, startMin: 600, endMin: 900 }]);
    const b = windowsToWeekIntervals([{ dayOfWeek: 3, startMin: 700, endMin: 1000 }]);
    expect(intersectIntervals(a, b)).toEqual([{ start: 3 * 1440 + 700, end: 3 * 1440 + 900 }]);
  });

  it('week circle size is invariant', () => {
    expect(WEEK_MINUTES).toBe(10080);
  });
});

describe('timezone + circadian weighting', () => {
  it('resolves IANA offsets', () => {
    const summer = new Date('2026-07-01T12:00:00Z');
    expect(tzOffsetMinutes('UTC', summer)).toBe(0);
    expect(tzOffsetMinutes('Europe/Paris', summer)).toBe(120);
    expect(tzOffsetMinutes('America/New_York', summer)).toBe(-240);
    expect(tzOffsetMinutes('Not/AZone', summer)).toBe(0); // graceful fallback
  });

  it('local minute-of-day wraps correctly across midnight', () => {
    // UTC 23:30 + Paris(+120) → 01:30 next day
    expect(localMinuteOfDay(23 * 60 + 30, 120)).toBe(90);
  });

  it('circadian weight peaks 9–21 local, troughs at night', () => {
    expect(circadianWeight(15 * 60)).toBe(1);
    expect(circadianWeight(3 * 60)).toBeCloseTo(0.3);
    expect(circadianWeight(12 * 60)).toBeGreaterThan(circadianWeight(2 * 60));
  });

  it('night overlap is worth less than day overlap for the same raw minutes', () => {
    // Two UTC-identical schedules; one overlap at 03:00 UTC, one at 15:00 UTC.
    const nightA = windowsToWeekIntervals([{ dayOfWeek: 2, startMin: 170, endMin: 230 }]); // ~03:00
    const nightB = windowsToWeekIntervals([{ dayOfWeek: 2, startMin: 180, endMin: 240 }]);
    const dayA = windowsToWeekIntervals([{ dayOfWeek: 2, startMin: 890, endMin: 950 }]);   // ~15:00
    const dayB = windowsToWeekIntervals([{ dayOfWeek: 2, startMin: 900, endMin: 960 }]);
    const n = scheduleOverlap(nightA, nightB, { aOffset: 0, bOffset: 0 });
    const d = scheduleOverlap(dayA, dayB, { aOffset: 0, bOffset: 0 });
    expect(n.sharedMinutes).toBe(d.sharedMinutes);
    expect(n.weightedMinutes).toBeLessThan(d.weightedMinutes);
  });
});

/* ================= matching engine ================= */

describe('suggestions — submodular coverage + availability quorum', () => {
  it('candidate filling a missing skill beats one duplicating a saturated skill', async () => {
    const hackathon = await makeHackathon();
    const leader = await makeUser({ skills: [{ skill: 'backend', level: 1.0, canLead: true }] });
    const res = await createTeam({
      hackathonId: hackathon._id as Types.ObjectId, creatorId: leader._id as Types.ObjectId,
      name: 'Cover', maxSize: 4, skillsSought: ['backend', 'design'],
    });
    if (!res.ok) throw new Error('setup');
    // Second backend member saturates the skill slot (level-sum 2.0 = SKILL_NEED)
    const second = await makeUser({ skills: [{ skill: 'backend', level: 1.0 }] });
    await Membership.create({
      hackathonId: hackathon._id, teamId: res.teamId, participantId: second._id,
      role: 'MEMBER', status: 'ACTIVE', source: 'JOIN_REQUEST',
    });

    const filler = await makeUser({
      lookingForTeam: true, discoverable: true,
      skills: [{ skill: 'design', level: 0.9 }], preferredRoles: ['design'],
    });
    const duplicator = await makeUser({
      lookingForTeam: true, discoverable: true,
      skills: [{ skill: 'backend', level: 0.9 }], preferredRoles: ['backend'],
    });

    const suggestions = await suggestTeammates(res.teamId, hackathon._id as Types.ObjectId);
    const sFiller = suggestions.find((s) => s.userId.toString() === filler._id.toString())!;
    const sDup = suggestions.find((s) => s.userId.toString() === duplicator._id.toString())!;
    // Submodularity: backend is saturated → duplicator's marginal gain ≈ 0
    expect(sDup.components.skillGain).toBe(0);
    expect(sFiller.components.skillGain).toBeGreaterThan(0.1);
    expect(sFiller.mutualScore).toBeGreaterThan(sDup.mutualScore);
    // explanations carry numbers
    expect(sFiller.reasons.join(' ')).toMatch(/coverage|missing skills/i);
  });

  it('availability overlap with the team lifts the score', async () => {
    const hackathon = await makeHackathon();
    const leader = await makeUser({
      skills: [{ skill: 'backend', level: 0.8 }],
      availability: [{ startMin: 540, endMin: 1020 }], // 9:00–17:00 UTC daily
    });
    const res = await createTeam({
      hackathonId: hackathon._id as Types.ObjectId, creatorId: leader._id as Types.ObjectId,
      name: 'Avail', maxSize: 4, skillsSought: ['backend'],
    });
    if (!res.ok) throw new Error('setup');

    const same = await makeUser({
      lookingForTeam: true, discoverable: true,
      skills: [{ skill: 'frontend', level: 0.8 }],
      availability: [{ startMin: 600, endMin: 960 }], // inside leader's window
    });
    const disjoint = await makeUser({
      lookingForTeam: true, discoverable: true,
      skills: [{ skill: 'frontend', level: 0.8 }],
      availability: [{ startMin: 0, endMin: 120 }],   // 00:00–02:00 — no overlap
    });

    const suggestions = await suggestTeammates(res.teamId, hackathon._id as Types.ObjectId);
    const sSame = suggestions.find((s) => s.userId.toString() === same._id.toString())!;
    const sDisjoint = suggestions.find((s) => s.userId.toString() === disjoint._id.toString())!;
    expect(sSame.components.availability).toBeGreaterThan(sDisjoint.components.availability);
    expect(sSame.reasons.join(' ')).toMatch(/Shares ~\d+h/);
  });

  it('candidate with canLead fills the leadership gap and says so', async () => {
    const hackathon = await makeHackathon();
    const leader = await makeUser({ skills: [{ skill: 'backend', level: 0.8 }] }); // no canLead
    const res = await createTeam({
      hackathonId: hackathon._id as Types.ObjectId, creatorId: leader._id as Types.ObjectId,
      name: 'Lead', maxSize: 4, skillsSought: ['backend'],
    });
    if (!res.ok) throw new Error('setup');
    const lead = await makeUser({
      lookingForTeam: true, discoverable: true,
      skills: [{ skill: 'backend', level: 0.7 }, { skill: 'devops', level: 0.8, canLead: true }],
      preferredRoles: ['devops'],
    });
    const suggestions = await suggestTeammates(res.teamId, hackathon._id as Types.ObjectId);
    const s = suggestions.find((x) => x.userId.toString() === lead._id.toString())!;
    expect(s.components.roleFit).toBe(1);
    expect(s.reasons.join(' ')).toMatch(/leadership gap/i);
  });
});

describe('skill taxonomy — canonicalization', () => {
  it('aliases collapse to canonical disciplines', async () => {
    const { canonicalSkill, canonicalSkills } = await import('../domain/taxonomy.js');
    expect(canonicalSkill('React.js')).toBe('frontend');
    expect(canonicalSkill('Node')).toBe('backend');
    expect(canonicalSkill('Machine Learning')).toBe('ai-ml');
    expect(canonicalSkill('Kubernetes')).toBe('devops');
    expect(canonicalSkill('Figma')).toBe('design');
    expect(canonicalSkill('quantum-computing')).toBe('quantum-computing'); // unknown passes through
    expect(canonicalSkills(['React', 'frontend', 'Vue'])).toEqual(['frontend']);
  });
});
