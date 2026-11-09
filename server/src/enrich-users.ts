import { connectDb, disconnectDb } from './db.js';
import { User } from './models/User.js';
import { makePersona } from './personas.js';

/**
 * Enrich existing users in-place with realistic personas.
 * Preserves emails, passwordHash, isOrganizer and all relations.
 * Usage: tsx src/enrich-users.ts
 */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  await connectDb();
  const users = await User.find({}, { email: 1, isOrganizer: 1 }).sort({ createdAt: 1 }).lean();
  console.log(`[enrich] ${users.length} users found`);

  const ops: Parameters<typeof User.bulkWrite>[0] = [];
  let i = 0;
  for (const u of users) {
    if (u.isOrganizer) continue;
    // deterministic per-user rand so re-runs are stable
    const rand = mulberry32(0x9e3779b9 ^ (i * 2654435761));
    const persona = makePersona(rand, i);
    ops.push({
      updateOne: {
        filter: { _id: u._id },
        update: { $set: persona },
      },
    });
    i++;
    if (ops.length === 500) {
      await User.bulkWrite(ops, { ordered: false });
      console.log(`[enrich] ${i} updated…`);
      ops.length = 0;
    }
  }
  if (ops.length) await User.bulkWrite(ops, { ordered: false });
  console.log(`[enrich] done — ${i} users enriched`);
  await disconnectDb();
}

main().catch((err) => { console.error(err); process.exit(1); });
