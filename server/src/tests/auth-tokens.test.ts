import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { setupTestDb, teardownTestDb, makeUser } from './helpers.js';
import { createApp } from '../api/app.js';
import { User } from '../models/User.js';

let app: ReturnType<typeof createApp>;
beforeAll(async () => { await setupTestDb(); app = createApp(); });
afterAll(teardownTestDb);

const sha = (raw: string) => createHash('sha256').update(raw).digest('hex');

describe('email verification', () => {
  it('register stores a hashed verify token and exposes emailVerified=false', async () => {
    const email = `verify-${Date.now()}@test.dev`;
    const reg = await request(app).post('/api/auth/register')
      .send({ email, password: 'password123', displayName: 'Verify Me' });
    expect(reg.status).toBe(201);
    expect(reg.body.user.emailVerified).toBe(false);
    const doc = await User.findOne({ email }).lean();
    expect(doc!.verifyTokenHash).toBeTruthy();
    expect(doc!.verifyTokenHash).not.toContain('@'); // hashed, not raw
  });

  it('verify-email marks the account verified and consumes the token', async () => {
    const user = await makeUser({ emailVerified: false });
    const raw = 'raw-verify-token-abc';
    await User.updateOne({ _id: user._id }, {
      $set: { verifyTokenHash: sha(raw), verifyTokenExpires: new Date(Date.now() + 3600_000) },
    });
    const ok = await request(app).post('/api/auth/verify-email').send({ token: raw });
    expect(ok.status).toBe(200);
    const doc = await User.findById(user._id).lean();
    expect(doc!.emailVerified).toBe(true);
    expect(doc!.verifyTokenHash).toBeUndefined();
    // single-use: replay fails
    const replay = await request(app).post('/api/auth/verify-email').send({ token: raw });
    expect(replay.status).toBe(400);
  });

  it('expired verify token is rejected', async () => {
    const user = await makeUser({ emailVerified: false });
    const raw = 'expired-token';
    await User.updateOne({ _id: user._id }, {
      $set: { verifyTokenHash: sha(raw), verifyTokenExpires: new Date(Date.now() - 1000) },
    });
    const res = await request(app).post('/api/auth/verify-email').send({ token: raw });
    expect(res.status).toBe(400);
  });
});

describe('password reset', () => {
  it('forgot-password always returns 200 and reset-password rotates credentials', async () => {
    const user = await makeUser({ emailVerified: false });
    const email = user.email;
    // unknown email → still 200 (no enumeration)
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@nowhere.dev' });
    expect(unknown.status).toBe(200);
    const known = await request(app).post('/api/auth/forgot-password').send({ email });
    expect(known.status).toBe(200);
    const doc = await User.findById(user._id).lean();
    expect(doc!.resetTokenHash).toBeTruthy();

    // we can't read the raw token from the email — plant one directly instead
    const raw = 'raw-reset-token-xyz';
    await User.updateOne({ _id: user._id }, {
      $set: { resetTokenHash: sha(raw), resetTokenExpires: new Date(Date.now() + 60_000) },
    });
    const reset = await request(app).post('/api/auth/reset-password')
      .send({ token: raw, password: 'newpassword456' });
    expect(reset.status).toBe(200);

    const oldLogin = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post('/api/auth/login').send({ email, password: 'newpassword456' });
    expect(newLogin.status).toBe(200);
    const after = await User.findById(user._id).lean();
    expect(after!.emailVerified).toBe(true); // mailbox ownership proven
    expect(after!.resetTokenHash).toBeUndefined();
    // single-use
    const replay = await request(app).post('/api/auth/reset-password').send({ token: raw, password: 'another999' });
    expect(replay.status).toBe(400);
  });

  it('reset rejects short passwords and bad tokens', async () => {
    const short = await request(app).post('/api/auth/reset-password').send({ token: 'x', password: 'short' });
    expect(short.status).toBe(400);
    const bad = await request(app).post('/api/auth/reset-password').send({ token: 'nope', password: 'longenough1' });
    expect(bad.status).toBe(400);
  });
});
