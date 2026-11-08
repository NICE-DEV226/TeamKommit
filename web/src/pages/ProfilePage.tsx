import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, patch, isLoggedIn } from '../lib/api';

const SKILLS = ['frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data', 'ml', 'security', 'design', 'product', 'writing', 'research'];

interface Me {
  user: {
    _id: string; displayName: string; bio: string; timezone: string;
    skills: { skill: string; level: number; canLead: boolean }[];
    preferredRoles: string[]; lookingForTeam: boolean; discoverable: boolean;
  };
}

export default function ProfilePage() {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: () => get<Me>('/auth/me'),
    enabled: isLoggedIn(),
  });
  const u = data?.user;
  const [form, setForm] = useState({ displayName: '', bio: '', timezone: 'UTC', lookingForTeam: false, discoverable: true });
  const [skills, setSkills] = useState<Record<string, number>>({});
  const [roles, setRoles] = useState('');

  useEffect(() => {
    if (u) {
      setForm({ displayName: u.displayName, bio: u.bio, timezone: u.timezone, lookingForTeam: u.lookingForTeam, discoverable: u.discoverable });
      setSkills(Object.fromEntries(u.skills.map((s) => [s.skill, s.level])));
      setRoles(u.preferredRoles.join(', '));
    }
  }, [u]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await patch('/auth/me', {
      ...form,
      skills: Object.entries(skills).map(([skill, level]) => ({ skill, level })),
      preferredRoles: roles.split(',').map((s) => s.trim()).filter(Boolean),
    });
    setSaved(true);
    qc.invalidateQueries({ queryKey: ['me'] });
    setTimeout(() => setSaved(false), 2000);
  }

  function toggleSkill(s: string) {
    setSkills((prev) => {
      const next = { ...prev };
      if (s in next) delete next[s]; else next[s] = 0.6;
      return next;
    });
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Your profile</h1>
      <form onSubmit={save} className="space-y-5">
        <label className="block text-sm">Display name
          <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2" />
        </label>
        <label className="block text-sm">Bio
          <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={3} maxLength={500}
            className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2" />
        </label>
        <label className="block text-sm">Timezone
          <input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2" placeholder="Europe/Paris" />
        </label>
        <fieldset>
          <legend className="text-sm text-zinc-400 mb-2">Skills (click to toggle, then set level)</legend>
          <div className="flex flex-wrap gap-2">
            {SKILLS.map((s) => (
              <button key={s} type="button" onClick={() => toggleSkill(s)}
                aria-pressed={s in skills}
                className={`text-sm px-3 py-1 rounded-full border ${s in skills ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}>
                {s}
              </button>
            ))}
          </div>
          {Object.keys(skills).length > 0 && (
            <div className="mt-3 space-y-2">
              {Object.entries(skills).map(([s, lvl]) => (
                <label key={s} className="flex items-center gap-3 text-sm">
                  <span className="w-24">{s}</span>
                  <input type="range" min={0} max={1} step={0.1} value={lvl}
                    onChange={(e) => setSkills((p) => ({ ...p, [s]: Number(e.target.value) }))}
                    className="flex-1 accent-emerald-500" aria-label={`${s} level`} />
                  <span className="w-8 text-zinc-400">{lvl}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <label className="block text-sm">Preferred roles (comma separated)
          <input value={roles} onChange={(e) => setRoles(e.target.value)} placeholder="frontend, backend"
            className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2" />
        </label>
        <div className="flex gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.lookingForTeam} onChange={(e) => setForm({ ...form, lookingForTeam: e.target.checked })} className="accent-emerald-500" />
            Looking for a team
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.discoverable} onChange={(e) => setForm({ ...form, discoverable: e.target.checked })} className="accent-emerald-500" />
            Visible in people discovery
          </label>
        </div>
        <button className="bg-emerald-500 text-black font-semibold px-6 py-2 rounded-md hover:bg-emerald-400">
          {saved ? 'Saved ✓' : 'Save profile'}
        </button>
      </form>
    </div>
  );
}
