import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, isLoggedIn } from '../lib/api';
import { Star4, Sparkle, Squiggle, Plus, Cloud, CursorTag, ArrowCurve, CommitMark, Trophy, Rocket, DeadlineClock, Gamepad } from '../components/doodles';
import Reveal from '../components/Reveal';
import { usePageTitle } from '../components/feedback';

interface Team {
  _id: string; name: string; description: string; memberCount: number; maxSize: number;
  placesLeft: number; leaderName: string; skillsSought: string[];
}

const MARQUEE_ITEMS = [
  '50 racers → 1 seat', 'Zero lost submissions', 'Live board', 'Resumable uploads',
  'Deterministic matching · no LLM', 'Server-clock deadlines', 'Invite codes that expire', 'Audit everything',
];

function SeatDots({ filled, total }: { filled: number; total: number }) {
  return (
    <div className="flex gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-3 w-3 rounded-full border-2 border-ink ${i < filled ? 'bg-ink' : 'bg-mint-400'}`} />
      ))}
    </div>
  );
}

export default function LandingPage() {
  usePageTitle('');
  const { data } = useQuery({
    queryKey: ['board', ''],
    queryFn: () => get<{ teams: Team[] }>('/board'),
  });
  const teams = data?.teams ?? [];
  const openSeats = teams.reduce((n, t) => n + t.placesLeft, 0);
  const featured = teams.slice(0, 6);
  const loggedIn = isLoggedIn();

  return (
    <div className="-mx-4 -mt-8 sm:-mt-10">
      {/* ============ HERO ============ */}
      <section className="full-bleed relative overflow-hidden border-b-2 border-ink bg-sunny-400">
        <Squiggle className="absolute left-[8%] top-16 h-6 w-40 text-ink/30 -rotate-6" />
        <Squiggle className="absolute bottom-20 right-[12%] h-6 w-32 text-ink/30 rotate-6" />
        <Sparkle className="absolute left-[15%] top-8 h-8 w-8 text-grape-500 floaty" />
        <Sparkle className="absolute right-[20%] top-24 h-6 w-6 text-bubble-500 floaty" />
        <Star4 className="absolute bottom-16 left-[45%] h-10 w-10 text-ink/55 rotate-12 floaty" />
        <Plus className="absolute right-[8%] top-10 h-8 w-8 text-ink/50 wiggle" />

        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-16 sm:pt-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <div className="mb-5 flex items-center gap-3">
              <span className="sticker-sm flex h-12 w-12 items-center justify-center rounded-2xl bg-grape-500 p-1.5 rotate-[-3deg]">
                <CommitMark className="h-full w-full" />
              </span>
              <p className="badge-ink -rotate-1">Hack4Hack 2026 · Crew Hiring Challenge</p>
            </div>
            <h1 className="text-5xl font-extrabold leading-[0.98] tracking-tight sm:text-7xl">
              Find your crew.
              <br />
              <span className="relative inline-block">
                <span className="absolute inset-x-0 bottom-1 h-5 bg-ink/90 -z-0" />
                <span className="relative text-sunny-400">Ship it.</span>
              </span>
            </h1>
            <p className="mt-6 max-w-md text-lg font-semibold text-ink/75">
              The platform where hackathon teams form without the race — and submissions
              survive the final ten minutes.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              {loggedIn ? (
                <Link to="/board" className="btn-primary relative text-base">
                  Open the board
                  <ArrowCurve className="absolute -right-8 -top-6 h-10 w-10 text-ink" />
                </Link>
              ) : (
                <Link to="/auth" className="btn-primary relative text-base">
                  Join the hackathon
                  <ArrowCurve className="absolute -right-8 -top-6 h-10 w-10 text-ink" />
                </Link>
              )}
              <Link to="/board" className="btn-secondary">See live teams</Link>
            </div>

            {/* compact composition for <lg — the absolute layout needs width */}
            <div className="mt-10 flex flex-wrap items-center gap-4 lg:hidden" aria-hidden="true">
              <span className="sticker-sm flex h-14 w-14 items-center justify-center rounded-2xl bg-grape-500 p-1.5 rotate-[-4deg]">
                <CommitMark className="h-full w-full" />
              </span>
              <div className="sticker-sm w-64 rotate-[-2deg] p-3.5">
                <p className="text-xs font-extrabold">“Null Pointers” · 3/4 seats</p>
                <div className="mt-2 flex gap-1">
                  <span className="h-2.5 flex-1 rounded-full border border-ink bg-ink" />
                  <span className="h-2.5 flex-1 rounded-full border border-ink bg-ink" />
                  <span className="h-2.5 flex-1 rounded-full border border-ink bg-ink" />
                  <span className="h-2.5 flex-1 rounded-full border border-ink bg-mint-400" />
                </div>
              </div>
              <span className="badge-sunny rotate-[-3deg] px-3 py-1 text-xs">50 racers → 1 seat</span>
            </div>
          </div>

          {/* hero composition: overlapping sticker cards — one-shot staggered
              entrance (pop-in), no perpetual motion on content cards */}
          <div className="relative hidden h-[420px] lg:block" aria-hidden="true">
            <div className="sticker absolute left-0 top-4 w-72 rotate-[-4deg] p-5 pop-in" style={{ animationDelay: '0ms' }}>
              <CursorTag name="Robin" className="absolute -top-4 right-4" />
              <p className="text-sm font-extrabold">“Null Pointers”</p>
              <p className="mt-1 text-xs font-semibold text-ink/50">4 seats · 1 left · led by Ada</p>
              <SeatDots filled={3} total={4} />
              <div className="mt-3 flex gap-1.5">
                <span className="chip-grape text-[10px]!">backend</span>
                <span className="chip-sky text-[10px]!">design</span>
              </div>
            </div>

            <div className="sticker-sm absolute right-0 top-0 w-56 rotate-[5deg] bg-mint-400/50 p-4 pop-in" style={{ animationDelay: '110ms' }}>
              <p className="font-mono text-xs font-bold">CHECKING…</p>
              <div className="mt-2 h-3 overflow-hidden rounded-full border-2 border-ink bg-cream">
                <div className="h-full w-2/3 bg-grape-500" />
              </div>
              <p className="mt-1.5 text-[10px] font-bold text-ink/60">zip-bomb scan · links · preview</p>
            </div>

            <div className="sticker-sm absolute left-2 top-[46%] w-60 rotate-[3deg] bg-sky-400/40 p-3.5 pop-in" style={{ animationDelay: '220ms' }}>
              <p className="text-xs font-extrabold">Join request</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="avatar h-7! w-7! text-[10px]!">MK</span>
                <p className="text-[11px] font-bold text-ink/60">Maya wants in · 2s ago</p>
              </div>
              <div className="mt-2.5 flex gap-2">
                <span className="rounded-full border-2 border-ink bg-mint-400 px-2.5 py-0.5 text-[10px] font-extrabold">Accept</span>
                <span className="rounded-full border-2 border-ink bg-cream px-2.5 py-0.5 text-[10px] font-extrabold text-ink/50">Decline</span>
              </div>
            </div>

            <div className="sticker-ink absolute bottom-2 left-20 w-64 rotate-[2deg] p-4 pop-in" style={{ animationDelay: '330ms' }}>
              <div className="flex items-center gap-2">
                <Cloud className="h-8 w-10 text-mint-400" />
                <p className="text-xs font-bold text-cream/80">worker-7 claimed job #4821<br />lease 30s · retry-safe</p>
              </div>
            </div>

            <span className="sticker-sm absolute right-6 top-[52%] flex h-16 w-16 items-center justify-center rounded-2xl bg-grape-500 p-1.5 rotate-[7deg] pop-in" style={{ animationDelay: '420ms' }}>
              <CommitMark className="h-full w-full" />
            </span>

            <div className="badge-sunny absolute bottom-0 right-8 rotate-[-6deg] px-4 py-1.5 text-sm pop-in" style={{ animationDelay: '500ms' }}>
              exactly once ✓
            </div>

            <Rocket className="absolute -left-8 top-24 h-20 w-20 rotate-[-12deg] pop-in" />
            <DeadlineClock className="absolute bottom-16 right-2 h-14 w-14 rotate-12 pop-in" />
          </div>
        </div>
      </section>

      {/* ============ MARQUEE ============ */}
      <div className="full-bleed overflow-hidden border-b-2 border-ink bg-ink py-3 text-cream">
        <div className="marquee" aria-hidden="true">
          <div className="marquee-inner flex gap-8 pr-8">
            {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
              <span key={i} className="flex items-center gap-8 whitespace-nowrap text-sm font-extrabold uppercase tracking-widest">
                {item}
                <Star4 className="h-3.5 w-3.5 text-sunny-400" />
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ============ LIVE STATS ============ */}
      <Reveal as="section" className="full-bleed border-b-2 border-ink bg-cream">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px sm:grid-cols-4">
          {[
            [teams.length, 'teams on the board', 'bg-grape-500 text-white'],
            [openSeats, 'seats still open', 'bg-sunny-400 text-ink'],
            ['1', 'winner per last seat', 'bg-mint-400 text-ink'],
            ['0', 'submissions lost', 'bg-bubble-400 text-white'],
          ].map(([val, label, cls]) => (
            <div key={label as string} className="border-ink/10 px-6 py-8 text-center sm:border-x-2 sm:first:border-l-0 sm:last:border-r-0">
              <p className={`mx-auto mb-2 inline-block rounded-full border-2 border-ink px-4 py-1 font-mono text-2xl font-extrabold ${cls}`}>{val}</p>
              <p className="text-xs font-bold uppercase tracking-wider text-ink/50">{label}</p>
            </div>
          ))}
        </div>
      </Reveal>

      {/* ============ HOW IT WORKS ============ */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <Reveal>
          <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
            Two problems. <span className="highlight-bar">One platform.</span>
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-sm font-semibold text-ink/60">
            Team formation that survives the click-fest, and submissions that survive the deadline.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {/* PS1 card */}
          <Reveal as="article" className="sticker relative overflow-hidden p-7">
            <Sparkle className="absolute right-5 top-5 h-6 w-6 text-grape-500 floaty" />
            <Gamepad className="absolute -bottom-3 -right-3 h-16 w-16 rotate-[10deg] opacity-90" />
            <span className="badge-grape">Problem 01</span>
            <h3 className="mt-4 text-2xl font-extrabold leading-tight">Race-proof teams</h3>
            <p className="mt-2 text-sm font-medium text-ink/65">
              Hundreds click “join” at the same second. Exactly one gets the last seat —
              enforced by a conditional update inside a MongoDB transaction, not by luck.
            </p>
            <ul className="mt-5 space-y-2.5">
              {[
                'Invite codes, join requests, live board',
                'Leadership succession + audit log',
                'Deterministic matching — submodular skill coverage on a circular week, zero LLM, every point explained',
              ].map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm font-semibold">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-mint-400 text-[10px] font-extrabold">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link to="/board" className="btn-mint mt-6">Explore teams →</Link>
          </Reveal>

          {/* PS2 card */}
          <Reveal as="article" delay={120} className="sticker relative overflow-hidden p-7 md:mt-8">
            <Sparkle className="absolute right-5 top-5 h-6 w-6 text-tang-400 floaty" />
            <DeadlineClock className="absolute -bottom-3 -right-3 h-16 w-16 rotate-[-8deg] opacity-90" />
            <span className="badge-sunny">Problem 02</span>
            <h3 className="mt-4 text-2xl font-extrabold leading-tight">Deadline-crush submissions</h3>
            <p className="mt-2 text-sm font-medium text-ink/65">
              2,000 teams submit in the last 10 minutes. Files go straight to object storage
              via resumable chunks — the API never streams a byte.
            </p>
            <ul className="mt-5 space-y-2.5">
              {[
                'Server-clock deadline + documented grace',
                'Background checks: magic bytes, zip-bombs, links, previews',
                'Exactly-once workers — proven by killing them mid-job',
              ].map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm font-semibold">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-sky-400 text-[10px] font-extrabold text-white">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            {loggedIn
              ? <Link to="/submissions" className="btn-sky mt-6">Submit a project →</Link>
              : <Link to="/auth" className="btn-sky mt-6">Submit a project →</Link>}
          </Reveal>
        </div>
      </section>

      {/* ============ THE ENGINE — deterministic matching, no LLM ============ */}
      <section className="full-bleed border-y-2 border-ink bg-ink py-20 text-cream">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal className="mb-12 text-center">
            <span className="badge-sunny">The matching engine</span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">
              No LLM. <span className="text-sunny-400">Just math.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm font-semibold text-cream/60">
              Every teammate suggestion is computed by a deterministic engine — reproducible,
              auditable, and decomposed term by term. No model, no vibes, no black box.
            </p>
          </Reveal>

          <Reveal className="sticker-ink mx-auto max-w-3xl p-6 sm:p-8" delay={100}>
            <div className="flex flex-wrap items-center justify-center gap-2 font-mono text-xs font-bold">
              {['taxonomy', '→', 'submodular Δskill', '→', 'circular week', '→', 'quorum ρ', '→', '√(V_T·V_P)'].map((s, i) =>
                s === '→'
                  ? <span key={i} className="text-sunny-400">{s}</span>
                  : <span key={i} className="rounded-full border-2 border-cream/30 bg-cream/10 px-3 py-1">{s}</span>
              )}
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                ['Canonical skills', 'React.js, frontend and JS collapse into one discipline — 20 canonical skills, ~80 aliases. Coverage can\'t be gamed by synonyms.'],
                ['Submodular coverage', 'f(S) = Σ w·min(1, cov/2). Diminishing returns are exact math — a second backend adds less than the first. Greedy keeps a (1−1/e) guarantee.'],
                ['Circular availability', 'The week is a 10,080-minute circle, not 7 days of strings. Overnight windows and timezones intersect exactly, weighted by circadian plausibility.'],
              ].map(([title, body]) => (
                <div key={title} className="rounded-2xl border-2 border-cream/20 bg-cream/5 p-4">
                  <p className="font-extrabold text-sunny-400">{title}</p>
                  <p className="mt-1.5 text-xs font-medium leading-relaxed text-cream/70">{body}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-center font-mono text-[11px] font-bold text-cream/40">
              V_T = 0.5·Δskill + 0.3·novelty + 0.2·avail &nbsp;·&nbsp; V_P = 0.6·fit + 0.4·role &nbsp;·&nbsp; score = √(V_T·V_P) &nbsp;·&nbsp; ties break on id — same input, same ranking, always.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ============ FEATURED TEAMS ============ */}
      {featured.length > 0 && (
        <section className="full-bleed border-y-2 border-ink bg-grape-500/10 py-20">
          <div className="mx-auto max-w-6xl px-4">
            <Reveal className="mb-10 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Happening right now</h2>
                <p className="mt-2 text-sm font-semibold text-ink/60">A live slice of the board — updates stream in via SSE.</p>
              </div>
              <Link to="/board" className="btn-secondary">Full board ({teams.length})</Link>
            </Reveal>
            <ul className="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((t, i) => (
                <Reveal as="li" key={t._id} delay={i * 70} className={i === 1 ? 'lg:mt-6' : ''}>
                  <Link to={`/teams/${t._id}`}
                    className={`sticker group flex h-full flex-col p-5 transition-all duration-150 hover:-translate-y-1 hover:shadow-[8px_10px_0_var(--color-ink)] ${['bg-cream', 'bg-sky-400/30', 'bg-mint-400/30', 'bg-bubble-400/25', 'bg-sunny-400/40', 'bg-cream'][i % 6]}`}>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-lg font-extrabold leading-snug">{t.name}</h3>
                      {t.placesLeft === 0
                        ? <span className="badge-neutral shrink-0">Full</span>
                        : <span className="badge-ok shrink-0">{t.placesLeft} left</span>}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-medium text-ink/60">{t.description || 'No description yet.'}</p>
                    <div className="mt-4">
                      <SeatDots filled={t.memberCount} total={t.maxSize} />
                      <p className="mt-2 font-mono text-xs font-medium text-ink/50">{t.memberCount}/{t.maxSize} · {t.leaderName}</p>
                    </div>
                    {t.skillsSought.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {t.skillsSought.slice(0, 3).map((s, j) => (
                          <span key={s} className={`chip px-2! py-0! text-[10px]! ${['chip-grape', 'chip-sky', 'chip-mint', 'chip-sunny', 'chip-bubble'][j % 5]}`}>{s}</span>
                        ))}
                      </div>
                    )}
                  </Link>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ============ FINAL CTA ============ */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <Reveal>
        <div className="sticker-ink relative overflow-hidden p-10 text-center sm:p-16">
          <Sparkle className="absolute left-10 top-8 h-7 w-7 text-sunny-400 floaty" />
          <Sparkle className="absolute bottom-10 right-14 h-5 w-5 text-mint-400 floaty" />
          <Star4 className="absolute right-10 top-10 h-8 w-8 text-bubble-400 rotate-12 floaty" />
          <Trophy className="absolute -left-4 -top-4 h-24 w-24 rotate-[-10deg] sm:left-6 sm:top-6" />
          <Rocket className="absolute -bottom-6 right-8 h-20 w-20 rotate-[14deg] sm:bottom-4 sm:right-16" />
          <h2 className="mx-auto max-w-2xl text-3xl font-extrabold leading-tight text-cream sm:text-5xl">
            The deadline is coming.
            <br />
            <span className="text-sunny-400">Your crew shouldn't be.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm font-semibold text-cream/60">
            Form your team, stress-free. Submit your project, stress-free.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            {loggedIn ? (
              <>
                <Link to="/board" className="btn-sunny text-base">Find a team</Link>
                <Link to="/submissions" className="btn-grape text-base">Submit project</Link>
              </>
            ) : (
              <Link to="/auth" className="btn-sunny text-base">Create free account</Link>
            )}
          </div>
          <Squiggle className="mx-auto mt-8 h-4 w-48 text-cream/30" />
        </div>
        </Reveal>
      </section>
    </div>
  );
}
