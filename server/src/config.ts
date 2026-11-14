import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/teamkommit?replicaSet=rs0'),
  jwtSecret: required('JWT_SECRET', 'dev-only-secret'),
  jwtAccessTtlSec: 15 * 60,
  jwtRefreshTtlSec: 30 * 24 * 3600,
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),
  mail: {
    apiKey: process.env.BREVO_API_KEY ?? '',
    // Brevo SMTP login (shown in SMTP & API → SMTP tab), e.g. xxx@smtp-brevo.com
    smtpUser: process.env.BREVO_SMTP_USER ?? '',
    from: process.env.MAIL_FROM ?? 'noreply@teamkommit.dev',
    fromName: process.env.MAIL_FROM_NAME ?? 'TeamKommit',
    appUrl: process.env.APP_URL ?? 'http://localhost:5173',
    verifyTtlHours: 24,
    resetTtlMin: 30,
  },
  inlineWorker: process.env.INLINE_WORKER === 'true',
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9090',
    // Host embedded in presigned URLs — MUST be reachable by the browser.
    // In compose: internal endpoint is http://s3mock:9090, public is http://localhost:9090.
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9090',
    region: process.env.S3_REGION ?? 'us-east-1',
    bucket: process.env.S3_BUCKET ?? 'submissions',
    accessKey: process.env.S3_ACCESS_KEY ?? 'minioadmin',
    secretKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  },
  invite: {
    // 128 bits of entropy, base64url → ~22 chars. Brute force is infeasible;
    // rate limiting + expiry are the real defenses.
    codeBytes: 16,
    ttlHours: 72,
    maxAttemptsPerHour: 20,
  },
  submissions: {
    maxFileBytes: 100 * 1024 * 1024,
    chunkBytes: 8 * 1024 * 1024,
    uploadUrlTtlSec: 15 * 60,
    // Grace policy: uploads STARTED before the deadline may complete up to
    // GRACE_UPLOAD_MIN after it; metadata confirmation has a shorter grace.
    graceUploadMin: 15,
    graceConfirmMin: 30,
    linkCheckTimeoutMs: 8000,
    maxLinks: 10,
    zipBombRatio: 100,
    maxZipEntries: 10_000,
  },
  jobs: {
    workerId: `worker-${process.pid}-${Date.now()}`,
    pollIntervalMs: 500,
    leaseMs: 60_000,
    maxAttempts: 5,
  },
} as const;
