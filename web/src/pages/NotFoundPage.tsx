import { Link } from 'react-router-dom';
import { Squiggle, Star4, Gamepad } from '../components/doodles';
import { usePageTitle } from '../components/feedback';

export default function NotFoundPage() {
  usePageTitle('Page not found');
  return (
    <div className="sticker relative mx-auto mt-10 max-w-md p-10 text-center">
      <Squiggle className="absolute -top-3 left-1/2 h-4 w-24 -translate-x-1/2 text-grape-500/40" />
      <Gamepad className="mx-auto h-14 w-14 text-grape-500 rotate-6 wiggle" />
      <Star4 className="absolute right-8 top-8 h-6 w-6 text-sunny-500 rotate-12" />
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight">This page ghosted</h1>
      <p className="mt-2 text-sm font-semibold text-ink/60">
        The link you followed doesn't exist — teams and submissions live elsewhere.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Link to="/board" className="btn-grape btn-sm">Team board</Link>
        <Link to="/" className="btn-ghost btn-sm">Home</Link>
      </div>
    </div>
  );
}
