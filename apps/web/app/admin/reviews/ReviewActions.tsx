'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { btn, input } from '@/components/ui';
import { api, errorMessage } from '@/lib/client-api';

export function ReviewActions({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decide = async (decision: 'APPROVE' | 'REJECT') => {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/quotes/${quoteId}/review`, { method: 'POST', body: { decision, note } });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <input
        className={input}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (e.g. matches supplier price list)"
        aria-label="Review note"
      />
      <div className="flex gap-2">
        <button
          className={btn.small}
          disabled={busy || note.trim().length < 3}
          onClick={() => void decide('APPROVE')}
        >
          Approve prices
        </button>
        <button
          className={btn.smallSecondary}
          disabled={busy || note.trim().length < 3}
          onClick={() => void decide('REJECT')}
        >
          Send back to artisan
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
