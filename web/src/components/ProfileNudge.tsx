import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, isLoggedIn } from '../lib/api';
import { Gamepad } from './doodles';

const THRESHOLD = 60;

export function useProfileCompleteness() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => get<{ user: { profileCompleteness?: number; emailVerified?: boolean } }>('/auth/me'),
    enabled: isLoggedIn(),
    staleTime: 60_000,
    retry: false,
  });
}

export default function ProfileNudge() {
  const { data } = useProfileCompleteness();
  const score = data?.user?.profileCompleteness;
  if (score === undefined || score >= THRESHOLD) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border-2 border-tang-400/60 bg-tang-400/10 px-5 py-4">
      <Gamepad className="h-10 w-10 shrink-0 -rotate-6 text-tang-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-cream">Complete your profile — better matches</p>
        <p className="mt-0.5 text-xs font-semibold text-cream/60">
          Your matching score is {score}% — skills, availability and a bio make teammate suggestions actually useful.
        </p>
      </div>
      <Link to="/profile" className="btn-sm shrink-0 rounded-xl border-2 border-ink bg-tang-400 px-4 py-2 text-xs font-extrabold text-ink hover:bg-tang-500">
        Complete profile
      </Link>
    </div>
  );
}
