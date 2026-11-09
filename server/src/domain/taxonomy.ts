/**
 * Skill taxonomy — canonical skill IDs with alias resolution.
 *
 * Why this exists: matching math (coverage, marginal gain) is only as good
 * as the identity of a "skill". Without canonicalization, `react`,
 * `React.js` and `frontend` count as three different skills and coverage
 * is silently wrong. Versioned so the mapping can evolve without
 * invalidating stored data (stored values are canonicalized on write AND
 * normalized again on read for legacy rows).
 */

export const TAXONOMY_VERSION = 1;

/** Canonical skill IDs — disciplines, not technologies. */
export const CANONICAL_SKILLS = [
  'frontend', 'backend', 'fullstack', 'mobile', 'ai-ml', 'data', 'database',
  'devops', 'cloud', 'design', 'product', 'security', 'qa', 'blockchain',
  'iot', 'gamedev', 'xr', 'research', 'tech-comm', 'finance',
] as const;
export type CanonicalSkill = (typeof CANONICAL_SKILLS)[number];

const ALIASES: Record<string, CanonicalSkill> = {
  // frontend
  frontend: 'frontend', 'front-end': 'frontend', web: 'frontend', 'web-dev': 'frontend',
  ui: 'frontend', 'ui-engineering': 'frontend', 'web-design': 'design',
  react: 'frontend', 'reactjs': 'frontend', 'react-js': 'frontend', vue: 'frontend',
  angular: 'frontend', svelte: 'frontend', nextjs: 'frontend', 'next-js': 'frontend',
  nuxt: 'frontend', html: 'frontend', css: 'frontend', javascript: 'frontend',
  typescript: 'frontend', tailwind: 'frontend', 'three-js': 'frontend', threejs: 'frontend',
  webgl: 'frontend', jquery: 'frontend',
  // backend
  backend: 'backend', server: 'backend', api: 'backend', 'api-design': 'backend',
  node: 'backend', nodejs: 'backend', 'node-js': 'backend', express: 'backend', django: 'backend',
  flask: 'backend', fastapi: 'backend', 'spring-boot': 'backend', rails: 'backend',
  laravel: 'backend', golang: 'backend', 'go-lang': 'backend', rust: 'backend',
  java: 'backend', kotlin: 'backend', scala: 'backend', graphql: 'backend', rest: 'backend',
  // fullstack
  fullstack: 'fullstack', 'full-stack': 'fullstack', mern: 'fullstack', mean: 'fullstack',
  // mobile
  mobile: 'mobile', ios: 'mobile', android: 'mobile', 'react-native': 'mobile',
  flutter: 'mobile', swift: 'mobile', 'mobile-dev': 'mobile',
  // ai-ml
  'ai-ml': 'ai-ml', ai: 'ai-ml', ml: 'ai-ml', 'machine-learning': 'ai-ml',
  'deep-learning': 'ai-ml', llm: 'ai-ml', genai: 'ai-ml', 'gen-ai': 'ai-ml',
  pytorch: 'ai-ml', tensorflow: 'ai-ml', nlp: 'ai-ml', 'computer-vision': 'ai-ml',
  'ml-engineering': 'ai-ml', 'ai-engineering': 'ai-ml', rag: 'ai-ml', agents: 'ai-ml',
  // data
  data: 'data', 'data-science': 'data', 'data-engineering': 'data', analytics: 'data',
  pandas: 'data', etl: 'data', dbt: 'data', 'business-intelligence': 'data',
  // database
  database: 'database', db: 'database', sql: 'database', nosql: 'database',
  mongodb: 'database', postgres: 'database', postgresql: 'database', mysql: 'database',
  redis: 'database', sqlite: 'database', 'database-design': 'database',
  // devops / cloud
  devops: 'devops', 'ci-cd': 'devops', cicd: 'devops', kubernetes: 'devops', k8s: 'devops',
  docker: 'devops', terraform: 'devops', 'github-actions': 'devops', infra: 'devops',
  sre: 'devops', 'platform-engineering': 'devops',
  cloud: 'cloud', aws: 'cloud', gcp: 'cloud', azure: 'cloud', vercel: 'cloud',
  'cloudflare-workers': 'cloud', serverless: 'cloud',
  // design / product
  design: 'design', 'ui-ux': 'design', ux: 'design', 'graphic-design': 'design',
  figma: 'design', branding: 'design', 'visual-design': 'design', illustration: 'design',
  product: 'product', pm: 'product', 'product-management': 'product', roadmap: 'product',
  // security / qa
  security: 'security', cybersecurity: 'security', infosec: 'security', pentest: 'security',
  'appsec': 'security', 'secure-coding': 'security',
  qa: 'qa', testing: 'qa', 'quality-assurance': 'qa', 'e2e-testing': 'qa',
  // others
  blockchain: 'blockchain', web3: 'blockchain', solidity: 'blockchain', ethereum: 'blockchain',
  crypto: 'blockchain',
  iot: 'iot', embedded: 'iot', arduino: 'iot', 'raspberry-pi': 'iot', firmware: 'iot',
  gamedev: 'gamedev', 'game-dev': 'gamedev', unity: 'gamedev', unreal: 'gamedev',
  'game-design': 'gamedev',
  xr: 'xr', ar: 'xr', vr: 'xr', 'mixed-reality': 'xr', metaverse: 'xr',
  research: 'research', 'r-and-d': 'research', prototyping: 'research',
  'tech-comm': 'tech-comm', 'technical-writing': 'tech-comm', documentation: 'tech-comm',
  finance: 'finance', fintech: 'finance', 'financial-modeling': 'finance',
};

function slug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/**
 * Resolve any free-text skill/role to its canonical ID.
 * Unknown skills pass through as their slug — nothing is rejected,
 * coverage math just treats them as their own category.
 */
export function canonicalSkill(raw: string): string {
  const s = slug(raw);
  if (!s) return '';
  return ALIASES[s] ?? s;
}

/** Canonicalize + dedupe a list, preserving first-seen order. */
export function canonicalSkills(list: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const c = canonicalSkill(raw);
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}
