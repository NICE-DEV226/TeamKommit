import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor,
  closestCenter, useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { get, post, patch, del, ApiError } from '../lib/api';
import { usePageTitle } from '../components/feedback';
import {
  Pipeline, PipelineStep, StepType, STEP_META,
  panel, panelTitle, inputDark, labelDark,
} from './shared';
import { toast, confirmDialog } from './overlays';

const FILE_TYPES = ['zip', 'pdf', 'image', 'text'] as const;

function newStep(type: StepType): PipelineStep {
  const base = { stepId: crypto.randomUUID().slice(0, 8), type, enabled: true, severity: 'reject' as const };
  switch (type) {
    case 'file-size': return { ...base, config: { maxMB: 100 } };
    case 'allowed-types': return { ...base, severity: 'warn', config: { types: [...FILE_TYPES] } };
    case 'archive-scan': return { ...base, config: { maxEntries: 10_000, maxRatio: 100, maxUncompressedMB: 0 } };
    default: return { ...base, config: {} };
  }
}

export default function PipelinesPage() {
  usePageTitle('Pipelines · Organizer');
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Pipeline | 'new' | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'pipelines'],
    queryFn: () => get<{ pipelines: Pipeline[] }>('/admin/pipelines'),
  });
  const pipelines = data?.pipelines ?? [];

  if (editing) {
    return <PipelineEditor
      pipeline={editing === 'new' ? null : editing}
      onClose={() => setEditing(null)}
      onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ['admin', 'pipelines'] }); qc.invalidateQueries({ queryKey: ['admin', 'hackathons'] }); }}
    />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-bold tracking-[0.2em] text-grape-400">// VALIDATION</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Submission pipelines</h1>
          <p className="mt-1.5 text-sm font-semibold text-cream/50">
            Ordered check steps applied to every submission of an event. Drag to reorder — first failure decides.
          </p>
        </div>
        <button onClick={() => setEditing('new')} className="btn-sunny btn-sm">+ New pipeline</button>
      </header>

      {isLoading && <div className="space-y-3">{[0, 1].map((i) => <div key={i} className={`${panel} h-24 animate-pulse`} />)}</div>}
      {isError && <p role="alert" className="text-sm font-extrabold text-bubble-400">Could not load pipelines.</p>}

      <ul className="grid gap-3 sm:grid-cols-2">
        {pipelines.map((p) => (
          <li key={p._id} className={`${panel} flex flex-col p-5`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-extrabold text-cream">{p.name}</p>
                <p className="mt-1 font-mono text-xs text-cream/45">
                  {p.stepCount ?? p.steps.length} steps{(p.usedBy ?? 0) > 0 ? ` · used by ${p.usedBy} event${p.usedBy! > 1 ? 's' : ''}` : ' · unused'}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={async () => {
                  const full = await get<{ pipeline: Pipeline }>(`/admin/pipelines/${p._id}`);
                  setEditing({ ...full.pipeline, stepCount: p.stepCount, usedBy: p.usedBy });
                }} className="rounded-lg border border-cream/25 px-3 py-1.5 text-xs font-extrabold text-cream/80 hover:bg-white/5">Edit</button>
                <button onClick={async () => {
                  const ok = await confirmDialog({
                    title: `Delete "${p.name}"?`,
                    body: (p.usedBy ?? 0) > 0
                      ? `${p.usedBy} event${p.usedBy! > 1 ? 's' : ''} use this pipeline — they'll fall back to default checks.`
                      : 'Events using it will fall back to default checks.',
                    danger: true,
                  });
                  if (!ok) return;
                  try { await del(`/admin/pipelines/${p._id}`); toast('Pipeline deleted'); qc.invalidateQueries({ queryKey: ['admin', 'pipelines'] }); qc.invalidateQueries({ queryKey: ['admin', 'hackathons'] }); }
                  catch (e) { toast(e instanceof ApiError ? e.message : 'Delete failed', 'err'); }
                }} className="rounded-lg border border-bubble-400/50 px-3 py-1.5 text-xs font-extrabold text-bubble-400 hover:bg-bubble-400/10">Delete</button>
              </div>
            </div>
            <ol className="mt-3 space-y-1">
              {(p.steps ?? []).slice(0, 4).map((s, i) => (
                <li key={s.stepId} className="flex items-center gap-2 text-xs font-semibold text-cream/55">
                  <span className="font-mono text-cream/35">{i + 1}.</span>
                  <span className={s.enabled ? '' : 'line-through opacity-50'}>{STEP_META[s.type]?.label ?? s.type}</span>
                  <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-extrabold ${s.severity === 'reject' ? 'bg-bubble-400/20 text-bubble-400' : 'bg-sunny-400/20 text-sunny-400'}`}>
                    {s.severity === 'reject' ? 'BLOCK' : 'WARN'}
                  </span>
                </li>
              ))}
              {(p.steps ?? []).length > 4 && <li className="text-xs font-semibold text-cream/35">+{p.steps.length - 4} more…</li>}
            </ol>
          </li>
        ))}
      </ul>
      {!isLoading && !isError && pipelines.length === 0 && (
        <div className={`${panel} p-10 text-center`}>
          <p className="text-sm font-semibold text-cream/40">No pipelines yet — events without one use the default checks.</p>
        </div>
      )}
    </div>
  );
}

// ============================ EDITOR ============================

function PipelineEditor({ pipeline, onClose, onSaved }: {
  pipeline: Pipeline | null; onClose: () => void; onSaved: () => void;
}) {
  const initialName = pipeline?.name ?? '';
  const initialSteps = pipeline?.steps ?? [newStep('file-size'), newStep('allowed-types'), newStep('archive-scan'), newStep('link-check')];
  const [name, setName] = useState(initialName);
  const [steps, setSteps] = useState<PipelineStep[]>(initialSteps);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const dirty = name !== initialName || JSON.stringify(steps) !== JSON.stringify(initialSteps);

  async function guardedClose() {
    if (dirty && !(await confirmDialog({ title: 'Discard changes?', body: 'Your pipeline edits will be lost.', danger: true }))) return;
    onClose();
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const stepIds = useMemo(() => steps.map((s) => s.stepId), [steps]);
  const activeStep = activeId ? steps.find((s) => s.stepId === activeId) : null;

  function patchStep(id: string, fn: (s: PipelineStep) => PipelineStep) {
    setSteps((prev) => prev.map((s) => (s.stepId === id ? fn(s) : s)));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over || active.id === over.id) return;
    setSteps((prev) => {
      const from = prev.findIndex((s) => s.stepId === active.id);
      const to = prev.findIndex((s) => s.stepId === over.id);
      return arrayMove(prev, from, to);
    });
  }

  async function save() {
    setBusy(true); setError('');
    try {
      if (pipeline) await patch(`/admin/pipelines/${pipeline._id}`, { name, steps });
      else await post('/admin/pipelines', { name, steps });
      toast(pipeline ? 'Pipeline saved' : 'Pipeline created');
      onSaved();
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Save failed'); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <button onClick={guardedClose} className="mb-2 text-xs font-extrabold text-cream/50 hover:text-cream">← All pipelines</button>
          <p className="font-mono text-xs font-bold tracking-[0.2em] text-grape-400">// PIPELINE EDITOR{dirty ? ' · UNSAVED' : ''}</p>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pipeline name"
            className="mt-2 w-full max-w-md rounded-xl border-2 border-cream/25 bg-white/[0.06] px-4 py-2.5 text-xl font-extrabold text-cream placeholder:text-cream/30 focus:border-sunny-400 focus:outline-none" />
        </div>
        <div className="flex gap-2">
          <button onClick={guardedClose} className="rounded-lg border border-cream/25 px-4 py-2 text-xs font-extrabold text-cream/60 hover:bg-white/5">Cancel</button>
          <button onClick={save} disabled={busy || name.trim().length < 2} className="btn-sunny btn-sm">{busy ? 'Saving…' : pipeline ? 'Save changes' : 'Create pipeline'}</button>
        </div>
      </header>
      {error && <p role="alert" className="text-sm font-extrabold text-bubble-400">{error}</p>}
      {(pipeline?.usedBy ?? 0) > 0 && (
        <p className="rounded-xl border border-sunny-400/40 bg-sunny-400/10 px-4 py-2.5 text-xs font-extrabold text-sunny-400">
          ⚠ This pipeline is attached to {pipeline!.usedBy} event{pipeline!.usedBy! > 1 ? 's' : ''} — changes apply to new submissions immediately.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        {/* Palette */}
        <aside className={panel}>
          <p className={`${panelTitle} p-4 pb-2`}>Add step</p>
          <ul className="space-y-1.5 px-3 pb-4">
            {(Object.keys(STEP_META) as StepType[]).map((t) => {
              const used = steps.filter((s) => s.type === t).length;
              return (
                <li key={t}>
                  <button onClick={() => setSteps((p) => [...p, newStep(t)])}
                    className="flex w-full items-center gap-2 rounded-lg border border-cream/15 bg-white/[0.03] px-3 py-2 text-left text-xs font-extrabold text-cream/80 hover:border-sunny-400/60 hover:bg-white/[0.06]">
                    <span className="text-sunny-400">+</span>
                    <span className="flex-1">{STEP_META[t].label}</span>
                    {used > 0 && <span className="font-mono text-[10px] text-cream/35">×{used}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-cream/10 p-4 text-[11px] font-semibold leading-relaxed text-cream/40">
            Steps run top→bottom. <span className="text-bubble-400">BLOCK</span> rejects the submission, <span className="text-sunny-400">WARN</span> flags it NEEDS_FIX.
          </p>
        </aside>

        {/* Canvas */}
        <div className={panel}>
          <p className={`${panelTitle} border-b border-cream/10 p-4`}>Pipeline flow</p>
          {steps.length === 0 ? (
            <p className="p-8 text-center text-sm font-semibold text-cream/40">Empty pipeline — every submission is accepted as-is. Add steps from the palette.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter}
              onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
              onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
              <SortableContext items={stepIds} strategy={verticalListSortingStrategy}>
                <ol className="space-y-2 p-4">
                  {steps.map((step, i) => (
                    <SortableStepCard key={step.stepId} step={step} index={i}
                      onPatch={(fn) => patchStep(step.stepId, fn)}
                      onRemove={() => setSteps((p) => p.filter((s) => s.stepId !== step.stepId))} />
                  ))}
                </ol>
              </SortableContext>
              <DragOverlay>
                {activeStep ? <StepCardBody step={activeStep} index={steps.findIndex((s) => s.stepId === activeStep.stepId)} dragging /> : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </div>
    </div>
  );
}

function SortableStepCard({ step, index, onPatch, onRemove }: {
  step: PipelineStep; index: number;
  onPatch: (fn: (s: PipelineStep) => PipelineStep) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.stepId });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'opacity-40' : ''}>
      <StepCardBody step={step} index={index} onPatch={onPatch} onRemove={onRemove}
        dragHandleProps={{ ...attributes, ...listeners }} />
    </li>
  );
}

function StepCardBody({ step, index, onPatch, onRemove, dragHandleProps, dragging }: {
  step: PipelineStep; index: number;
  onPatch?: (fn: (s: PipelineStep) => PipelineStep) => void;
  onRemove?: () => void;
  dragHandleProps?: Record<string, unknown>;
  dragging?: boolean;
}) {
  const meta = STEP_META[step.type];
  return (
    <div className={`flex items-start gap-3 rounded-xl border-2 bg-white/[0.04] p-3.5 ${dragging ? 'border-sunny-400 shadow-lg' : 'border-cream/15'} ${!step.enabled ? 'opacity-55' : ''}`}>
      {dragHandleProps && (
        <button {...dragHandleProps} aria-label={`Drag step ${index + 1}`} title="Drag to reorder"
          className="mt-1 cursor-grab touch-none rounded-md border border-cream/20 px-1.5 py-2 text-cream/50 hover:bg-white/10 active:cursor-grabbing">
          ⠿
        </button>
      )}
      <div className="w-6 shrink-0 pt-1 text-center font-mono text-sm font-extrabold text-cream/35">{index + 1}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-extrabold text-cream">{meta.label}</p>
          {onPatch && (
            <>
              <div className="flex overflow-hidden rounded-lg border border-cream/25" role="group" aria-label="Severity">
                {(['reject', 'warn'] as const).map((sev) => (
                  <button key={sev} onClick={() => onPatch((s) => ({ ...s, severity: sev }))}
                    aria-pressed={step.severity === sev}
                    className={`px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${step.severity === sev
                      ? sev === 'reject' ? 'bg-bubble-400 text-ink' : 'bg-sunny-400 text-ink'
                      : 'text-cream/50 hover:bg-white/5'}`}>
                    {sev === 'reject' ? 'Block' : 'Warn'}
                  </button>
                ))}
              </div>
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-extrabold text-cream/55">
                <input type="checkbox" checked={step.enabled} onChange={(e) => onPatch((s) => ({ ...s, enabled: e.target.checked }))}
                  className="h-3.5 w-3.5 accent-sunny-400" />
                On
              </label>
            </>
          )}
        </div>
        <p className="mt-0.5 text-[11px] font-semibold text-cream/40">{meta.hint}</p>
        {onPatch && <StepConfig step={step} onPatch={onPatch} />}
      </div>
      {onRemove && (
        <button onClick={onRemove} aria-label={`Remove ${meta.label}`}
          className="rounded-lg border border-bubble-400/40 px-2 py-1 text-xs font-extrabold text-bubble-400 hover:bg-bubble-400/10">✕</button>
      )}
    </div>
  );
}

function StepConfig({ step, onPatch }: { step: PipelineStep; onPatch: (fn: (s: PipelineStep) => PipelineStep) => void }) {
  const num = (key: string) => Number(step.config[key] ?? 0);
  const setNum = (key: string, v: number) => onPatch((s) => ({ ...s, config: { ...s.config, [key]: v } }));

  switch (step.type) {
    case 'file-size':
      return (
        <label className="mt-2 flex items-center gap-2 text-xs font-bold text-cream/60">
          Max size
          <input type="number" min={1} max={2048} value={num('maxMB')} onChange={(e) => setNum('maxMB', Number(e.target.value))}
            className="w-20 rounded-lg border border-cream/25 bg-ink px-2 py-1 font-mono text-xs text-cream focus:border-sunny-400 focus:outline-none" />
          MB
        </label>
      );
    case 'allowed-types': {
      const types = (step.config.types as string[]) ?? [];
      return (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Allowed types">
          {FILE_TYPES.map((t) => {
            const on = types.includes(t);
            return (
              <button key={t} onClick={() => onPatch((s) => ({
                ...s,
                config: { ...s.config, types: on ? types.filter((x) => x !== t) : [...types, t] },
              }))}
                aria-pressed={on}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-extrabold uppercase ${on ? 'border-sunny-400 bg-sunny-400/20 text-sunny-400' : 'border-cream/25 text-cream/45 hover:border-cream/50'}`}>
                {t}
              </button>
            );
          })}
        </div>
      );
    }
    case 'archive-scan':
      return (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {([
            ['maxEntries', 'Max entries'],
            ['maxRatio', 'Max ratio :1'],
            ['maxUncompressedMB', 'Max unpacked MB (0=off)'],
          ] as const).map(([key, lbl]) => (
            <label key={key} className="text-[10px] font-extrabold uppercase tracking-wide text-cream/45">
              {lbl}
              <input type="number" min={0} value={num(key)} onChange={(e) => setNum(key, Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-cream/25 bg-ink px-2 py-1 font-mono text-xs text-cream focus:border-sunny-400 focus:outline-none" />
            </label>
          ))}
        </div>
      );
    default:
      return null;
  }
}
