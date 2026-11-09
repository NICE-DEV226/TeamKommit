import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, ApiError, isLoggedIn } from '../lib/api';
import { Link } from 'react-router-dom';
import { Star4, Sparkle, Confetti } from '../components/doodles';
import { usePageTitle } from '../components/feedback';

interface Submission {
  _id: string; version: number; title: string; status: string;
  description?: string; repoUrl?: string;
  fileName?: string; fileSize?: number; checkResults?: { problems?: string[]; preview?: string };
  confirmedAt?: string; checkedAt?: string;
}
interface UploadSession {
  _id: string; s3Key: string; partCount: number; chunkBytes: number;
}
interface UploadResponse {
  uploadSession: UploadSession;
  partUrls: { partNumber: number; url: string }[];
}

const STATUS_BADGE: Record<string, string> = {
  UPLOADING: 'badge-neutral', CHECKING: 'badge-warn',
  ACCEPTED: 'badge-ok', NEEDS_FIX: 'badge-warn',
  REJECTED: 'badge-bad', LATE: 'badge-bad',
};

export default function SubmissionsPage() {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [links, setLinks] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  usePageTitle('Submissions');

  const { data: teams } = useQuery({
    queryKey: ['myTeams'],
    queryFn: () => get<{ memberships: { team?: { _id: string; name: string } }[] }>('/me/teams'),
    enabled: isLoggedIn(),
  });
  const [teamId, setTeamId] = useState('');
  const effectiveTeam = teamId || teams?.memberships[0]?.team?._id || '';

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => get<{ user: { isOrganizer?: boolean } }>('/auth/me'),
    enabled: isLoggedIn(),
    staleTime: 60_000,
  });
  const isOrganizer = !!me?.user?.isOrganizer;

  const { data: subs } = useQuery({
    queryKey: ['submissions', effectiveTeam],
    queryFn: () => get<{ submissions: Submission[] }>(`/submissions/teams/${effectiveTeam}`),
    enabled: !!effectiveTeam,
    refetchInterval: 4000, // live-ish status without refresh
  });

  /** Resumable chunked upload: parts go DIRECTLY to object storage via
      presigned URLs; the API server never sees file bytes. */
  async function uploadFile(submissionId: string, file: File) {
    setError(''); setProgress({ done: 0, total: Math.ceil(file.size / (8 * 1024 * 1024)) });
    const res = await post<UploadResponse>('/submissions/uploads', {
      submissionId, fileName: file.name, size: file.size, contentType: file.type || 'application/octet-stream',
    });
    const session = res.uploadSession;
    const chunkSize = session.chunkBytes;
    const parts: { partNumber: number; etag: string }[] = [];
    for (let i = 0; i < session.partCount; i++) {
      const start = i * chunkSize;
      const blob = file.slice(start, Math.min(start + chunkSize, file.size));
      const presigned = res.partUrls.find((p) => p.partNumber === i + 1)?.url;
      if (!presigned) throw new ApiError(0, 'UPLOAD_PART_FAILED', `Missing URL for part ${i + 1}`);
      const put = await fetch(presigned, { method: 'PUT', body: blob });
      if (!put.ok) throw new ApiError(put.status, 'UPLOAD_PART_FAILED', `Part ${i + 1} failed`);
      const etag = put.headers.get('ETag');
      if (!etag) throw new ApiError(0, 'UPLOAD_PART_FAILED', `Part ${i + 1}: missing ETag`);
      parts.push({ partNumber: i + 1, etag: etag.replace(/"/g, '') });
      setProgress({ done: i + 1, total: session.partCount });
    }
    await post('/submissions/uploads/complete', { sessionId: session._id, parts });
    setProgress(null);
    qc.invalidateQueries();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !effectiveTeam) { setError('Pick a team and a file'); return; }
    if (file.size > 100 * 1024 * 1024) { setError('File is over the 100 MB limit'); return; }
    setBusy(true); setError('');
    try {
      // Prefer the hackathon whose formation window is still open; fall back
      // to the first one only if none are open.
      const { hackathons } = await get<{ hackathons: { _id: string; status?: string }[] }>('/hackathons');
      const hack = hackathons.find((h) => h.status === 'FORMATION_OPEN') ?? hackathons[0];
      if (!hack) throw new ApiError(0, 'NO_HACKATHON', 'No active hackathon found');
      const sub = await post<{ submission: Submission }>('/submissions', {
        hackathonId: hack._id,
        teamId: effectiveTeam,
        title,
        description: description || undefined,
        repoUrl: repoUrl || undefined,
        links: links.split('\n').map((s) => s.trim()).filter(Boolean),
      });
      await uploadFile(sub.submission._id, file);
      setTitle(''); setDescription(''); setLinks(''); setRepoUrl('');
      if (fileRef.current) fileRef.current.value = '';
      setNotice(`“${sub.submission.title}” v${sub.submission.version} uploaded — checks run in the background.`);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Submission failed');
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }

  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight">
          <span className="badge-sunny">PS2</span>
          Project submissions
          <Sparkle className="h-6 w-6 text-tang-400" />
        </h1>
        <p className="mt-1.5 text-sm font-semibold text-ink/60">
          Files go straight to secure storage in resumable chunks — the API never touches them.
          Status updates live.
        </p>
        {isOrganizer && (
          <Link to="/admin" className="mt-3 inline-flex items-center gap-2 rounded-xl border-2 border-ink bg-sunny-400 px-4 py-2 text-sm font-extrabold text-ink hover:-translate-y-0.5">
            You're an organizer — open the submission control room →
          </Link>
        )}
        {notice && (
          <p role="status" className="mt-3 inline-flex items-center gap-2 rounded-xl border-2 border-ink bg-mint-400/40 px-4 py-2 text-sm font-bold">
            <Confetti className="h-6 w-6" />{notice}
          </p>
        )}
      </div>

      {teams && teams.memberships.length === 0 && (
        <div className="sticker mb-6 p-8 text-center">
          <p className="font-bold text-ink/60">You need a team before you can submit.</p>
          <a href="/board" className="btn-grape btn-sm mt-4 inline-flex">Find a team on the board →</a>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-extrabold">
          <Star4 className="h-5 w-5 text-sky-400" /> Your submissions
          {subs && <span className="badge-neutral">{subs.submissions.length}</span>}
        </h2>
        {!showForm && (
          <button type="button" onClick={() => setShowForm(true)} className="btn-grape btn-sm px-4">
            + New submission
          </button>
        )}
      </div>

      {showForm && (
      <form onSubmit={submit} className="sticker mb-8 space-y-5 p-6 sm:p-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="label">Team</span>
            <select value={effectiveTeam} onChange={(e) => setTeamId(e.target.value)} className="input">
              {teams?.memberships.map((m) => m.team && (
                <option key={m.team._id} value={m.team._id}>{m.team.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Project title</span>
            <input required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className="input" />
          </label>
        </div>
        <label className="block">
          <span className="label">What did you build? <span className="font-semibold text-ink/55">(the story judges read)</span></span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={5000}
            placeholder="The problem, your approach, what you learned…" className="input" />
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="label">Repository URL</span>
            <input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/you/project" className="input input-mono text-xs!" />
          </label>
          <label className="block">
            <span className="label">Other links</span>
            <textarea value={links} onChange={(e) => setLinks(e.target.value)} rows={2}
              placeholder={'https://your-demo.vercel.app\nhttps://youtu.be/demo'}
              className="input font-mono text-xs!" />
          </label>
        </div>
        <p className="-mt-2 text-xs font-semibold text-ink/60">Demo, video, docs — one per line. Every link is checked before the deadline.</p>
        <label className="block">
          <span className="label">Project file</span>
          <input ref={fileRef} type="file" required accept=".zip,.pdf,application/zip,application/pdf"
            className="input file:mr-3 file:rounded-full file:border-2 file:border-ink file:bg-sunny-400 file:px-4 file:py-1.5 file:text-xs file:font-bold file:text-ink" />
          <span className="mt-1.5 block text-xs font-semibold text-ink/50">Zip or PDF, up to 100 MB. Every version is kept — the last one before the deadline counts.</span>
        </label>
        {progress && (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-ink/60">
              <span>Uploading — chunk {progress.done} of {progress.total}</span>
              <span className="font-mono">{pct}%</span>
            </div>
            <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
              className="h-3 w-full overflow-hidden rounded-full border-2 border-ink bg-cream">
              <div className="h-full rounded-full bg-grape-500 transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
        {error && <p role="alert" className="text-sm font-bold text-bubble-500">{error}</p>}
        <div className="flex items-center gap-3 border-t-2 border-dashed border-ink/15 pt-5">
          <button className="btn-grape px-7" disabled={busy}>
            {busy ? (progress ? `Uploading ${pct}%…` : 'Submitting…') : 'Submit project'}
          </button>
          <button type="button" onClick={() => { setShowForm(false); setError(''); }} className="btn-ghost" disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
      )}

      {!subs && effectiveTeam && (
        <div className="space-y-4" aria-busy="true">
          <div className="sticker-sm h-28 skeleton" /><div className="sticker-sm h-28 skeleton" />
        </div>
      )}
      <ul className="space-y-4" aria-live="polite">
        {subs?.submissions.map((s) => (
          <li key={s._id} className="sticker-sm p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-sm font-extrabold">{s.title}</span>
                <span className="ml-2 font-mono text-xs font-semibold text-ink/60">
                  v{s.version}{s.fileName ? ` · ${s.fileName}` : ''}{s.fileSize ? ` · ${(s.fileSize / 1048576).toFixed(1)} MB` : ''}
                </span>
                {s.description && <p className="mt-1.5 line-clamp-2 text-xs font-medium text-ink/55">{s.description}</p>}
                {s.repoUrl && <a href={s.repoUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-bold text-sky-500 hover:underline">{s.repoUrl}</a>}
              </div>
              <span className={`${STATUS_BADGE[s.status] ?? 'badge-neutral'} shrink-0`}>{s.status.replace(/_/g, ' ')}</span>
            </div>
            {s.checkResults?.problems && s.checkResults.problems.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs font-bold text-bubble-500">
                {s.checkResults.problems.map((p, i) => <li key={i}>· {p}</li>)}
              </ul>
            )}
            {s.checkResults?.preview && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-extrabold text-grape-500 hover:underline">Preview</summary>
                <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-2xl border-2 border-ink/20 bg-ink/5 p-3 font-mono text-xs text-ink/70">{s.checkResults.preview}</pre>
              </details>
            )}
          </li>
        ))}
        {subs && subs.submissions.length === 0 && !notice && (
          <li className="sticker p-10 text-center text-sm font-bold text-ink/50">No submissions yet — hit “New submission” to ship your first build.</li>
        )}
      </ul>
    </div>
  );
}
