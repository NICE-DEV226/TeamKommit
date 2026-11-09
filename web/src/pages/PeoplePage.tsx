import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, isLoggedIn } from '../lib/api';
import { Star4, Sparkle, Gamepad } from '../components/doodles';
import { ErrorCard, usePageTitle } from '../components/feedback';

interface Person {
  _id: string; displayName: string; bio?: string; timezone: string;
  skills: { skill: string; level: number }[]; preferredRoles: string[];
}

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function PeoplePage() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  usePageTitle('People');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['people', search],
    queryFn: () => get<{ people: Person[] }>(`/teams/people${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  });
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => get<{ user: { lookingForTeam: boolean; discoverable: boolean; isOrganizer?: boolean } }>('/auth/me'),
    enabled: isLoggedIn(),
    staleTime: 60_000,
  });
  const people = data?.people ?? [];
  // Organizers run the event — they're never there to find a team.
  const hiddenFromDirectory = !!me && !me.user.isOrganizer && (!me.user.lookingForTeam || !me.user.discoverable);

  return (
    <div>
      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight">
          <span className="badge-grape">PS1</span>
          People looking for a team
          <Sparkle className="h-6 w-6 text-sunny-500" />
        </h1>
        <p className="mt-1.5 text-sm font-semibold text-ink/60">
          Builders who raised their hand. Find complementary skills and time zones that click.
        </p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); setSearch(q); }} className="mb-6 flex max-w-md gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name…"
          aria-label="Search people" className="input" />
        <button className="btn-sky shrink-0">Search</button>
      </form>

      {hiddenFromDirectory && (
        <div className="sticker-flat mb-6 flex flex-wrap items-center gap-3 p-4" role="status">
          <p className="text-sm font-bold text-ink/70">
            You're not listed here — enable “Looking for a team” (and stay discoverable) in your profile.
          </p>
          <Link to="/profile" className="btn-grape btn-sm ml-auto">Fix profile</Link>
        </div>
      )}

      {isError && <ErrorCard message="Couldn't load the directory — check your connection." onRetry={() => refetch()} />}

      {isLoading && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="sticker-sm h-36 skeleton" />)}
        </div>
      )}

      <ul className="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
        {people.map((p, i) => (
          <li key={p._id} className={i % 4 === 0 ? 'lg:mt-5' : ''}>
            <article className={`sticker card-in flex h-full flex-col p-5 transition-transform duration-200 hover:-translate-y-1 hover:rotate-[-0.5deg] ${['bg-cream', 'bg-grape-500/15', 'bg-sky-400/25', 'bg-mint-400/30'][i % 4]}`} style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
              <div className="flex items-center gap-3">
                <span className="avatar h-11! w-11! text-sm!">{initials(p.displayName)}</span>
                <div className="min-w-0">
                  <h2 className="truncate font-extrabold">{p.displayName}</h2>
                  <p className="font-mono text-[11px] font-medium text-ink/50">{p.timezone}</p>
                </div>
                <Star4 className="ml-auto h-4 w-4 shrink-0 text-grape-500" />
              </div>
              {p.bio && <p className="mt-3 line-clamp-2 text-sm font-medium text-ink/60">{p.bio}</p>}
              {p.skills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.skills.slice(0, 5).map((s, j) => (
                    <span key={s.skill} className={`chip ${['chip-grape', 'chip-sky', 'chip-mint', 'chip-sunny', 'chip-bubble'][j % 5]}`}>
                      {s.skill}
                    </span>
                  ))}
                </div>
              )}
              {p.preferredRoles.length > 0 && (
                <p className="mt-3 text-xs font-bold text-ink/50">
                  wants: {p.preferredRoles.join(', ')}
                </p>
              )}
              <div className="mt-auto pt-4">
                {isLoggedIn() ? (
                  <Link to="/board" className="btn-secondary btn-sm w-full">Browse the board →</Link>
                ) : (
                  <Link to="/auth" className="btn-sunny btn-sm w-full">Sign in to connect</Link>
                )}
              </div>
            </article>
          </li>
        ))}
      </ul>
      {!isLoading && !isError && people.length === 0 && (
        <div className="sticker p-12 text-center">
          <Gamepad className="mx-auto h-12 w-12 text-sky-500" />
          <p className="mt-4 font-bold text-ink/60">No one is looking right now — check back soon.</p>
        </div>
      )}
    </div>
  );
}
