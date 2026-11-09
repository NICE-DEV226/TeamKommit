/**
 * Realistic participant personas for seed/enrichment.
 * Deterministic via injected rand() so seed stays reproducible.
 */

export const SKILL_IDS = ['frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data', 'ml', 'security', 'design', 'product'] as const;
export const ROLE_IDS = ['frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data', 'ml', 'design', 'product', 'security'] as const;

const FIRST = [
  'Ava', 'Liam', 'Maya', 'Noah', 'Ines', 'Lucas', 'Chloe', 'Hugo', 'Lena', 'Gabriel',
  'Sarah', 'Omar', 'Yuki', 'Elena', 'Rafael', 'Amara', 'Felix', 'Priya', 'Jonas', 'Nina',
  'Karim', 'Sofia', 'Ethan', 'Leila', 'Mateo', 'Hana', 'Theo', 'Zara', 'Dante', 'Mira',
  'Alex', 'June', 'Ravi', 'Clara', 'Samir', 'Ivy', 'Marco', 'Tara', 'Owen', 'Lila',
  'Diego', 'Anya', 'Kai', 'Rosa', 'Nils', 'Farah', 'Julien', 'Mina', 'Oscar', 'Aya',
];
const LAST = [
  'Martin', 'Bernard', 'Dubois', 'Moreau', 'Laurent', 'Simon', 'Michel', 'Lefebvre', 'Leroy', 'Roux',
  'Garcia', 'Rodriguez', 'Smith', 'Johnson', 'Brown', 'Taylor', 'Muller', 'Schmidt', 'Rossi', 'Bianchi',
  'Tanaka', 'Suzuki', 'Kim', 'Park', 'Chen', 'Wang', 'Singh', 'Kumar', 'Silva', 'Santos',
  'Novak', 'Kowalski', 'Hansen', 'Berg', 'Johansson', 'Costa', 'Ferreira', 'Dubois', 'Fontaine', 'Girard',
  'Okafor', 'Mensah', 'Haddad', 'Nasser', 'Petrov', 'Ivanov', 'Nowak', 'Weber', 'Fischer', 'Wagner',
];
const TIMEZONES = [
  'Europe/Paris', 'Europe/Paris', 'Europe/Paris',
  'Europe/London', 'Europe/Berlin', 'Europe/Madrid',
  'America/New_York', 'America/New_York', 'America/Toronto', 'America/Chicago',
  'America/Sao_Paulo', 'America/Mexico_City',
  'Asia/Tokyo', 'Asia/Singapore', 'Asia/Seoul', 'Asia/Kolkata', 'Asia/Dubai',
  'Australia/Sydney', 'Australia/Melbourne',
  'Africa/Casablanca', 'Africa/Lagos',
  'UTC',
];

// Skill-flavored bios. {name} and {skills} get interpolated.
const BIO_TEMPLATES = [
  '{name} builds {skill1} tools and dreams in {skill2}.',
  'Full-time {role} — currently obsessed with {skill1}, learning {skill2} on the side.',
  'I ship fast, break nothing (usually). Main stack: {skill1}, side quests: {skill2}.',
  '{role} by day, {skill1} tinkerer by night. Looking for a team that actually ships.',
  'CS student into {skill1} and {skill2}. I ask a lot of questions and write clean code.',
  'Design-minded {role} who cares about {skill1} UX and {skill2} reliability.',
  'Backend-heavy {role}, frontend-curious. Love {skill1}, dabble in {skill2}.',
  'Hackathon regular — 4 years, 11 projects. Strongest in {skill1}, weakest (and proudest) in {skill2}.',
  'I turn coffee into {skill1} commits. Team player, deadline survivor.',
  '{role} who believes {skill2} is underrated. Happy to own the {skill1} side of things.',
  'Junior dev, senior curiosity. Into {skill1} now, {skill2} next.',
  'Ops-first {role} — if it deploys at 3am, I probably built it. {skill1} + {skill2}.',
];

const SKILL_LABEL: Record<string, string> = {
  frontend: 'React', backend: 'Node/Go', fullstack: 'TypeScript', mobile: 'Flutter',
  devops: 'K8s/Terraform', data: 'SQL/Python', ml: 'PyTorch', security: 'AppSec',
  design: 'Figma', product: 'roadmaps',
};
const ROLE_LABEL: Record<string, string> = {
  frontend: 'frontend dev', backend: 'backend dev', fullstack: 'full-stack dev',
  mobile: 'mobile dev', devops: 'DevOps engineer', data: 'data engineer',
  ml: 'ML engineer', design: 'product designer', product: 'product manager',
  security: 'security engineer',
};

export interface Persona {
  displayName: string;
  bio: string;
  timezone: string;
  skills: { skill: string; level: number; canLead: boolean }[];
  preferredRoles: string[];
  availability: { dayOfWeek?: number; startMin: number; endMin: number }[];
  lookingForTeam: boolean;
  discoverable: boolean;
}

export function makePersona(rand: () => number, index: number): Persona {
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
  const first = pick(FIRST);
  const last = pick(LAST);
  const displayName = `${first} ${last}`;

  const skillCount = 2 + Math.floor(rand() * 4); // 2-5
  const pool = [...SKILL_IDS];
  const chosen: string[] = [];
  while (chosen.length < skillCount) {
    const s = pick(pool);
    if (!chosen.includes(s)) chosen.push(s);
  }
  const skills = chosen.map((skill, k) => ({
    skill,
    // First skill tends to be strongest (primary), rest spread 0.35-0.9
    level: k === 0 ? 0.65 + rand() * 0.3 : 0.35 + rand() * 0.55,
    canLead: rand() > 0.65,
  }));

  const roleCount = rand() > 0.75 ? 2 : 1;
  const rolePool = [...ROLE_IDS];
  const roles: string[] = [];
  while (roles.length < roleCount) {
    const r = pick(rolePool);
    if (!roles.includes(r)) roles.push(r);
  }

  const s1 = skills[0]!.skill;
  const s2 = skills[1]?.skill ?? skills[0]!.skill;
  const role = ROLE_LABEL[roles[0]!] ?? 'developer';
  const template = pick(BIO_TEMPLATES);
  const bio = template
    .replace('{name}', first)
    .replace('{skill1}', SKILL_LABEL[s1] ?? s1)
    .replace('{skill2}', SKILL_LABEL[s2] ?? s2)
    .replace('{role}', role);

  // 1-3 availability windows: evenings/weekends, mostly 18:00-24:00 local-ish
  const windows: Persona['availability'] = [];
  const wCount = 1 + Math.floor(rand() * 3);
  for (let w = 0; w < wCount; w++) {
    const startMin = pick([1080, 1140, 1200, 1260, 480, 540, 600]); // 18h-21h or 8h-10h
    const len = pick([120, 180, 240, 360]);
    windows.push({
      ...(rand() > 0.5 ? { dayOfWeek: Math.floor(rand() * 7) } : {}),
      startMin,
      endMin: Math.min(1439, startMin + len),
    });
  }

  return {
    displayName,
    bio,
    timezone: pick(TIMEZONES),
    skills,
    preferredRoles: roles,
    availability: windows,
    lookingForTeam: rand() > 0.35, // ~65% looking
    discoverable: rand() > 0.12, // ~88% discoverable
  };
}
