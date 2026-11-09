import { defineRailway, project, service } from "railway/iac";

// Single-service deploy (Railway trial resource limit):
// one container runs API + inline worker + serves the built SPA.
// MongoDB is external (Atlas free tier) via MONGODB_URI.
// Object storage is Cloudflare R2 via S3_* vars.
export default defineRailway(() => {
  const app = service("app", {
    build: { builder: "DOCKERFILE", dockerfilePath: "server/Dockerfile" },
    startCommand: "node server/dist/index.js",
    healthcheckPath: "/api/health",
    env: {
      NODE_ENV: "production",
      INLINE_WORKER: "true",
      MONGODB_URI: "MONGODB_URI_PLACEHOLDER_ATLAS",
      JWT_SECRET: "6d0dadff32d2743e127c8f906d4aabe2dbe398401905b415f10c45174eb53eaa",
      S3_ENDPOINT: "https://REPLACE_ACCOUNT_ID.r2.cloudflarestorage.com",
      S3_PUBLIC_ENDPOINT: "https://REPLACE_ACCOUNT_ID.r2.cloudflarestorage.com",
      S3_REGION: "auto",
      S3_BUCKET: "teamkommit-submissions",
      S3_ACCESS_KEY: "REPLACE_R2_ACCESS_KEY",
      S3_SECRET_KEY: "REPLACE_R2_SECRET_KEY",
      S3_FORCE_PATH_STYLE: "false",
    },
  });

  return project("teamkommit", {
    resources: [app],
  });
});
