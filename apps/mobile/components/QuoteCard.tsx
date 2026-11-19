import type { QuoteView } from '@jiko/shared';
import { formatCents } from '@jiko/shared/money';
import { Text, View } from 'react-native';
import { colors } from '../lib/theme';
import { Badge, Card, s } from './ui';

export function QuoteCard({ quote }: { quote: QuoteView }) {
  return (
    <Card>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={s.muted}>Itemized quote · v{quote.version}</Text>
        {quote.reviewStatus === 'PENDING' && <Badge tone="warning" label="Jiko review" />}
        {quote.status === 'REJECTED' && <Badge tone="neutral" label="Changes requested" />}
      </View>
      {quote.items.map((i, n) => (
        <View
          key={n}
          style={[s.row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}
        >
          <Text style={[s.muted, { flex: 1, fontSize: 14 }]}>
            {i.kind === 'LABOUR' ? 'Labor' : 'Materials'} · {i.description}
            {i.quantity > 1 ? ` × ${i.quantity}` : ''}
          </Text>
          <Text style={{ fontWeight: '500', color: colors.ink }}>{formatCents(i.totalCents)}</Text>
        </View>
      ))}
      <View style={{ height: 1, backgroundColor: colors.line }} />
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={{ fontWeight: '600', color: colors.ink }}>Total</Text>
        <Text style={{ fontWeight: '600', color: colors.ink }}>
          {formatCents(quote.totalCents)}
        </Text>
      </View>
      {quote.split && (
        <View style={{ gap: 4, paddingTop: 4 }}>
          <Text style={s.muted}>
            You get {formatCents(quote.split.materialsAdvanceCents)} for materials when you start on
            site, and {formatCents(quote.split.completionPayoutCents)} when the client confirms.
            Jiko fee {formatCents(quote.split.commissionCents)}.
          </Text>
        </View>
      )}
      {quote.rejectionReason && <Text style={s.muted}>Reason: {quote.rejectionReason}</Text>}
    </Card>
  );
}
