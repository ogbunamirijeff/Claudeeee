'use client';

import type { MessageView } from '@jiko/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '@/lib/client-api';
import { btn, input } from './ui';

const POLL_MS = 10_000;

/** Polls for new messages every 10s while visible — lighter than a socket on flaky 3G. */
export function Chat({ jobId, admin = false }: { jobId: string; admin?: boolean }) {
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const last = useRef<string | null>(null);

  const poll = useCallback(async () => {
    const q = last.current ? `?after=${encodeURIComponent(last.current)}` : '';
    const fresh = await api<MessageView[]>(`/jobs/${jobId}/messages${q}`);
    if (fresh.length) {
      last.current = fresh.at(-1)!.createdAt;
      setMessages((m) => [...m, ...fresh.filter((f) => !m.some((x) => x.id === f.id))]);
    }
  }, [jobId]);

  useEffect(() => {
    void poll().catch((e) => setError(errorMessage(e)));
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void poll().catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/jobs/${jobId}/messages`, { method: 'POST', body: { body } });
      setBody('');
      await poll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3" aria-label="Messages">
      <h2 className="font-semibold">Messages</h2>
      <ul className="space-y-2">
        {messages.length === 0 && <li className="text-sm text-muted">No messages yet.</li>}
        {messages.map((m) => (
          <li
            key={m.id}
            className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.from === 'me' ? 'ml-auto bg-brand text-brand-fg' : 'bg-surface ring-1 ring-line'}`}
          >
            {m.from !== 'me' && (
              <span className="block text-xs font-medium opacity-70">
                {m.from === 'jiko' ? 'Jiko' : (m.senderName ?? m.from)}
              </span>
            )}
            {m.body}
            {admin && m.contactInfoFlag && (
              <span className="mt-1 block text-xs font-medium text-danger">
                Flagged: contact details{m.originalBody ? ` — original: “${m.originalBody}”` : ''}
              </span>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={(e) => void send(e)} className="flex gap-2">
        <input
          className={input}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message"
          maxLength={1000}
          aria-label="Message"
        />
        <button className={`${btn.small} shrink-0`} disabled={busy || !body.trim()}>
          Send
        </button>
      </form>
      {!admin && (
        <p className="text-xs text-muted">
          Phone numbers are hidden until you pay through Jiko — it&apos;s how we protect both sides.
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}
