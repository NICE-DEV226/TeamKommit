import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, ApiError, isLoggedIn } from '../lib/api';

interface Submission {
  _id: string; version: number; title: string; status: string;
  fileName?: string; fileSize?: number; checkResults?: { problems?: string[]; preview?: string };
  confirmedAt?: string; checkedAt?: string;
}
interface UploadSession {
  _id: string; s3Key: string; partCount: number; chunkBytes: number; partUrls?: { partNumber: number; url: string }[];
}

const STATUS_STYLE: Record<string, string> = {
  UPLOADING: 'bg-zinc-700 text-zinc-300', CHECKING: 'bg-amber-500/20 text-amber-300',
  ACCEPTED: 'bg-emerald-500/20 text-emerald-300', NEEDS_FIX: 'bg-orange-500/20 text-orange-300',
  REJECTED: 'bg-red-500/20 text-red-300', LATE: 'bg-red-500/20 text-red-300',
};

export default function SubmissionsPage() {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [links, setLinks] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: teams } = useQuery({
    queryKey: ['myTeams'],
    queryFn: () => get<{ memberships: { team?: { _id: string; name: string } }[] }>('/me/teams'),
    enabled: isLoggedIn(),
  });
  const [teamId, setTeamId] = useState('');
  const effectiveTeam = teamId || teams?.memberships[0]?.team?._id || '';

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
    const session = await post<UploadSession & { partUrls: { partNumber: number; url: string }[] }>('/submissions/uploads', {
      submissionId, fileName: file.name, size: file.size, contentType: file.type || 'application/octet-stream',
    });
    const chunkSize = session.chunkBytes;
    const parts: { partNumber: number; etag: string }[] = [];
    for (let i = 0; i < session.partCount; i++) {
      const start = i * chunkSize;
      const blob = file.slice(start, Math.min(start + chunkSize, file.size));
      const res = await fetch(session.partUrls[i]!.url, { method: 'PUT', body: blob });
      if (!res.ok) throw new ApiError(res.status, 'UPLOAD_PART_FAILED', `Part ${i + 1} failed`);
      const etag = res.headers.get('ETag');
      if (!etag) throw new ApiError(0, 'UPLOAD_PART_FAILED', `Part ${i + 1}: missing ETag`);
      parts.push({ partNumber: i + 1, etag: etag.replace(/"/g, '') });
      setProgress({ done: i + 1, total: session.partCount });
    }
    await post('/submissions/uploads/complete', { sessionId: session._id, parts });
    setProgress(null);
    qc.invalidateQueries({ queryKey: ['submissions'] });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !effectiveTeam) { setError('Pick a team and a file'); return; }
    try {
      const sub = await post<{ submission: Submission }>('/submissions', {
        hackathonId: (await get<{ hackathons: { _id: string }[] }>('/hackathons')).hackathons[0]!._id,
        teamId: effectiveTeam,
        title,
        links: links.split('\n').map((s) => s.trim()).filter(Boolean),
      });
      await uploadFile(sub.submission._id, file);
      setTitle(''); setLinks('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Submission failed');
      setProgress(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">Project submissions</h1>
      <p className="text-sm text-zinc-400 mb-6">Files upload directly to secure storage in resumable chunks. Status updates live.</p>

      <form onSubmit={submit} className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4 mb-8">
        <label className="block text-sm">Team
          <select value={effectiveTeam} onChange={(e) => setTeamId(e.target.value)}
            className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2">
            {teams?.memberships.map((m) => m.team && (
              <option key={m.team._id} value={m.team._id}>{m.team.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">Project title
          <input required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
            className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2" />
        </label>
        <label className="block text-sm">Links (one per line — demo, repo, docs)
          <textarea value={links} onChange={(e) => setLinks(e.target.value)} rows={2}
            className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 font-mono text-sm" />
        </label>
        <label className="block text-sm">Project file (zip / pdf, ≤100 MB)
          <input ref={fileRef} type="file" required className="mt-1 text-sm text-zinc-400 file:mr-3 file:bg-zinc-800 file:px-3 file:py-1.5 file:rounded file:border-0 file:text-zinc-200" />
        </label>
        {progress && (
          <div role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total} className="text-sm text-emerald-400">
            Uploading chunk {progress.done}/{progress.total}…
          </div>
        )}
        {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
        <button className="bg-emerald-500 text-black font-semibold px-6 py-2 rounded hover:bg-emerald-400">
          Submit project
        </button>
      </form>

      <h2 className="font-semibold mb-3">Your submissions</h2>
      <ul className="space-y-3" aria-live="polite">
        {subs?.submissions.map((s) => (
          <li key={s._id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="font-medium">{s.title}</span>
                <span className="ml-2 text-xs text-zinc-500">v{s.version} · {s.fileName} {s.fileSize ? `· ${(s.fileSize / 1048576).toFixed(1)} MB` : ''}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[s.status] ?? 'bg-zinc-700'}`}>{s.status}</span>
            </div>
            {s.checkResults?.problems && s.checkResults.problems.length > 0 && (
              <ul className="mt-2 text-xs text-red-300 list-disc list-inside">
                {s.checkResults.problems.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            )}
            {s.checkResults?.preview && (
              <details className="mt-2">
                <summary className="text-xs text-emerald-400 cursor-pointer">Preview</summary>
                <pre className="mt-1 text-xs text-zinc-400 bg-zinc-950 rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap">{s.checkResults.preview}</pre>
              </details>
            )}
          </li>
        ))}
        {subs && subs.submissions.length === 0 && <li className="text-zinc-500 text-sm">No submissions yet.</li>}
      </ul>
    </div>
  );
}
