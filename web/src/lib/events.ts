import { useEffect, useRef } from 'react';
import { getRefreshToken, ensureAccessToken } from './api';

/**
 * SSE client with automatic reconnect + Last-Event-ID replay.
 * The server pushes committed domain events; the UI invalidates queries.
 */
export function useLiveEvents(
  onEvent: (type: string, payload: unknown) => void,
  filters: { hackathonId?: string; teamId?: string } = {},
  onStatus?: (connected: boolean) => void,
  enabled = true,
) {
  const cb = useRef(onEvent);
  cb.current = onEvent;
  const filterKey = `${filters.hackathonId ?? ''}:${filters.teamId ?? ''}`;

  useEffect(() => {
    if (!enabled) { onStatus?.(false); return; }
    let es: EventSource | null = null;
    let stopped = false;
    let lastId = '';

    const connect = async () => {
      if (stopped) return;
      const token = await ensureAccessToken();
      if (stopped) return;
      if (!token) { onStatus?.(false); return; } // session gone — stop retrying
      const params = new URLSearchParams();
      if (filters.hackathonId) params.set('hackathonId', filters.hackathonId);
      if (filters.teamId) params.set('teamId', filters.teamId);
      if (lastId) params.set('lastEventId', lastId);
      // EventSource can't set headers — access token goes via ?token= (accepted
      // only on /api/events; short-lived JWT, refreshed on every reconnect).
      params.set('token', token);
      es = new EventSource(`/api/events?${params}`);
      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          lastId = msg.id ?? lastId;
          cb.current(msg.type ?? 'message', msg.payload ?? msg);
        } catch { /* ignore malformed */ }
      };
      // named events also arrive as `event:` — listen broadly
      const types = ['team.member.joined', 'team.member.left', 'team.member.removed', 'team.created', 'team.disbanded', 'submission.status.changed'];
      for (const t of types) {
        es.addEventListener(t, (ev) => {
          try {
            const d = JSON.parse((ev as MessageEvent).data);
            lastId = d.id ?? lastId;
            cb.current(t, d.payload ?? d);
          } catch { /* ignore */ }
        });
      }
      es.onopen = () => onStatus?.(true);
      es.onerror = () => {
        onStatus?.(false);
        es?.close();
        setTimeout(connect, 3000);
      };
    };
    connect();
    return () => { stopped = true; es?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, enabled]);
}

export function useAuthToken(): string | null {
  return localStorage.getItem('tk_access');
}
void getRefreshToken;
