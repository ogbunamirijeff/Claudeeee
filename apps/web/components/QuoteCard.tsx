import type { QuoteView } from '@jiko/shared';
import { formatKobo } from '@jiko/shared/money';
import { Badge, Card } from './ui';

export function QuoteCard({ quote, showSplit = false }: { quote: QuoteView; showSplit?: boolean }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>Itemised quote · v{quote.version}</span>
        {quote.status === 'REJECTED' && <Badge tone="neutral">Changes requested</Badge>}
        {quote.reviewStatus === 'PENDING' && <Badge tone="warning">Jiko review</Badge>}
        {quote.reviewStatus === 'APPROVED' && <Badge tone="success">Price checked</Badge>}
      </div>
      <ul className="space-y-2 text-sm">
        {quote.items.map((i, n) => (
          <li key={n} className="flex justify-between gap-3">
            <span className="text-muted">
              {i.kind === 'LABOUR' ? 'Labour' : 'Materials'} · {i.description}
              {i.quantity > 1 ? ` × ${i.quantity}` : ''}
            </span>
            <span className="shrink-0 font-medium tabular-nums">{formatKobo(i.totalKobo)}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between border-t border-line pt-3 font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatKobo(quote.totalKobo)}</span>
      </div>
      {quote.notes && <p className="text-sm text-muted">Note from artisan: {quote.notes}</p>}
      {quote.rejectionReason && (
        <p className="text-sm text-muted">Reason: {quote.rejectionReason}</p>
      )}
      {showSplit && quote.split && (
        <dl className="space-y-1 border-t border-line pt-3 text-sm">
          {[
            ['Jiko commission', quote.split.commissionKobo],
            ['  of which from materials', quote.split.commissionFromMaterialsKobo],
            ['Materials advance at start', quote.split.materialsAdvanceKobo],
            ['Paid on completion', quote.split.completionPayoutKobo],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <dt className="whitespace-pre text-muted">{k}</dt>
              <dd className="tabular-nums">{formatKobo(v as number)}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
