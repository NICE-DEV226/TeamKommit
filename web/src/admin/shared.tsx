import { useEffect, useState } from 'react';
import { DeadlineClock, Confetti } from '../components/doodles';

export interface Stats {
  total: number; byStatus: Record<string, number>; lateAttempts: number; failedChecks: number;
}
export interface Overview {
  hackathons: { _id: string; name: string; status: string; submissionOpensAt?: string; submissionDeadline?: string }[];
  recent: { _id: string; title: string; status: string; version: number; fileName: string; updatedAt: string; team: string; hackathon: string }[];
  lateAttempts: { occurredAt: string; actor: string; team: string }[];
}
export interface AdminHackathon {
  _id: string; name: string; slug: string; status: string;
  minTeamSize: number; maxTeamSize: number;
  formationOpensAt: string; formationClosesAt: string;
  submissionOpensAt?: string; submissionDeadline?: string;
  teams: number; submissions: number; participants: number;
  organizerId?: { displayName?: string; email?: string } | string;
  pipelineId?: { _id?: string; name?: string } | string | null;
}
export interface AdminTeam {
  _id: string; name: string; lifecycleStatus: string; recruitmentStatus: string;
  maxSize: number; members: number; pendingRequests: number;
  leaderName: string; leaderless: boolean; skillsSought: string[];
}
export interface AdminMember { membershipId: string; role: string; openToLead: boolean; user?: { displayName?: string; email?: string } }
export interface Organizer { displayName: string; email: string; createdAt: string }

export type StepType = 'file-size' | 'allowed-types' | 'archive-scan' | 'link-check' | 'readme-required';
export interface PipelineStep {
  stepId: string;
  type: StepType;
  enabled: boolean;
  severity: 'reject' | 'warn';
  config: Record<string, unknown>;
}
export interface Pipeline {
  _id: string; name: string; ownerId: string;
  steps: PipelineStep[]; stepCount?: number; usedBy?: number;
  createdAt: string;
}

export const STEP_META: Record<StepType, { label: string; hint: string }> = {
  'file-size': { label: 'File size limit', hint: 'Max upload size in MB' },
  'allowed-types': { label: 'Allowed file types', hint: 'Detected type must be in the list' },
  'archive-scan': { label: 'Archive bomb scan', hint: 'Entries, compression ratio, uncompressed cap' },
  'link-check': { label: 'Link check', hint: 'Submitted URLs must respond' },
  'readme-required': { label: 'README required', hint: 'Archive must contain a README file' },
};

export const STATUS_ORDER = ['ACCEPTED', 'CHECKING', 'UPLOADING', 'NEEDS_FIX', 'REJECTED', 'LATE'];
export const STATUS_COLOR: Record<string, string> = {
  ACCEPTED: 'bg-mint-400', CHECKING: 'bg-sunny-400', UPLOADING: 'bg-sky-400',
  NEEDS_FIX: 'bg-tang-400', REJECTED: 'bg-bubble-400', LATE: 'bg-bubble-500',
};
export const STATUS_BADGE: Record<string, string> = {
  UPLOADING: 'badge-neutral', CHECKING: 'badge-warn',
  ACCEPTED: 'badge-ok', NEEDS_FIX: 'badge-warn', REJECTED: 'badge-bad', LATE: 'badge-bad',
};
export const HACK_STATUS_BADGE: Record<string, string> = {
  DRAFT: 'badge-neutral', REGISTRATION_OPEN: 'badge-sky', FORMATION_OPEN: 'badge-ok',
  CLOSED: 'badge-warn', ARCHIVED: 'badge-neutral',
};

export const panel = 'rounded-2xl border-2 border-cream/15 bg-white/[0.04]';
export const panelTitle = 'text-xs font-extrabold uppercase tracking-[0.15em] text-cream/50';
export const inputDark = 'w-full rounded-xl border-2 border-cream/25 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-cream placeholder:text-cream/30 focus:border-sunny-400 focus:outline-none';
export const labelDark = 'mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-cream/50';

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function DeadlineCard({ name, deadline, opensAt, now }: {
  name: string; deadline?: string; opensAt?: string; now: number;
}) {
  if (!deadline) {
    return <div className={`${panel} p-4`}><p className="truncate text-sm font-extrabold text-cream/80">{name}</p>
      <p className="mt-1 text-xs font-semibold text-cream/40">No submission deadline set</p></div>;
  }
  const ms = new Date(deadline).getTime() - now;
  const open = opensAt ? new Date(opensAt).getTime() <= now : true;
  const abs = Math.abs(ms);
  const d = Math.floor(abs / 86400000);
  const h = Math.floor((abs % 86400000) / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const s = Math.floor((abs % 60000) / 1000);
  const overdue = ms < 0;
  const urgent = !overdue && ms < 6 * 3600000;
  return (
    <div className={`${panel} relative overflow-hidden p-4 ${urgent ? 'border-sunny-400/60' : ''}`}>
      <DeadlineClock className={`absolute -right-1 -top-1 h-16 w-16 rotate-12 ${urgent ? 'text-sunny-400' : 'text-cream/15'}`} />
      <p className="truncate text-sm font-extrabold text-cream/80">{name}</p>
      <p className={`mt-1.5 font-mono text-xl font-extrabold tabular-nums ${overdue ? 'text-bubble-400' : urgent ? 'text-sunny-400' : 'text-cream'}`}>
        {overdue ? 'CLOSED ' : ''}{d > 0 ? `${d}d ` : ''}{String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
      </p>
      <p className="mt-0.5 text-[11px] font-bold text-cream/45">
        {overdue ? 'deadline passed — grace applies' : open ? 'submissions open' : 'opens ' + new Date(opensAt!).toLocaleString()}
      </p>
    </div>
  );
}

export function LateEmpty() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-mint-400/30 bg-mint-400/10 px-4 py-3">
      <Confetti className="h-7 w-7" />
      <p className="text-sm font-bold text-mint-400">No late attempts recorded. Clean so far.</p>
    </div>
  );
}
