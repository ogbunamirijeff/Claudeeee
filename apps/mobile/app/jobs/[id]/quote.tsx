import { DEFAULT_QUOTE_POLICY, splitQuote, type SubmitQuoteInput } from '@jiko/shared';
import { dollarsToCents, formatCents } from '@jiko/shared/money';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Banner, Button, Card, Chip, Field, Screen, s } from '../../../components/ui';
import { errorText, post } from '../../../lib/api';
import { colors } from '../../../lib/theme';

type Row = {
  kind: 'LABOUR' | 'MATERIAL';
  description: string;
  quantity: string;
  unitPrice: string;
};

const toCents = (v: string) => {
  try {
    return v.trim() ? dollarsToCents(v) : 0;
  } catch {
    return NaN;
  }
};

/** Pro builds an itemized quote; the payout preview uses the same split code as the server. */
export default function QuoteBuilder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [rows, setRows] = useState<Row[]>([
    { kind: 'LABOUR', description: '', quantity: '1', unitPrice: '' },
  ]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = rows.map((r) => ({
    ...r,
    qty: Number.parseInt(r.quantity, 10),
    cents: toCents(r.unitPrice),
  }));
  const valid =
    parsed.length > 0 &&
    parsed.every((r) => r.description.trim().length >= 2 && r.qty >= 1 && Number.isFinite(r.cents));
  const labour = parsed
    .filter((r) => r.kind === 'LABOUR')
    .reduce((a, r) => a + (valid ? r.qty * r.cents : 0), 0);
  const materials = parsed
    .filter((r) => r.kind === 'MATERIAL')
    .reduce((a, r) => a + (valid ? r.qty * r.cents : 0), 0);
  const split = useMemo(
    () =>
      valid && labour + materials > 0 ? splitQuote(labour, materials, DEFAULT_QUOTE_POLICY) : null,
    [valid, labour, materials],
  );

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body: SubmitQuoteInput = {
        items: parsed.map((r) => ({
          kind: r.kind,
          description: r.description.trim(),
          quantity: r.qty,
          unitPriceCents: r.cents,
        })),
        notes: notes.trim() || undefined,
      };
      await post(`/v1/jobs/${id}/quotes`, body);
      router.back();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Build quote"
      trailing="Draft"
      footer={
        <Button
          label="Send quote to client"
          busy={busy}
          disabled={!split}
          onPress={() => void submit()}
        />
      }
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.h1}>Itemize your quote</Text>
        {rows.map((r, i) => (
          <Card key={i}>
            <View style={s.row}>
              <Chip
                label="Labor"
                selected={r.kind === 'LABOUR'}
                onPress={() => update(i, { kind: 'LABOUR' })}
              />
              <Chip
                label="Material"
                selected={r.kind === 'MATERIAL'}
                onPress={() => update(i, { kind: 'MATERIAL' })}
              />
              <View style={{ flex: 1 }} />
              {rows.length > 1 && (
                <Pressable
                  onPress={() => setRows((rs) => rs.filter((_, n) => n !== i))}
                  hitSlop={8}
                >
                  <Text style={s.muted}>Remove</Text>
                </Pressable>
              )}
            </View>
            <TextInput
              style={s.input}
              value={r.description}
              onChangeText={(v) => update(i, { description: v })}
              placeholder={
                r.kind === 'LABOUR' ? 'e.g. Replace water heater' : 'e.g. 40-gal water heater'
              }
              placeholderTextColor={colors.muted}
              maxLength={120}
            />
            <View style={s.row}>
              <TextInput
                style={[s.input, { width: 72 }]}
                value={r.quantity}
                onChangeText={(v) => update(i, { quantity: v.replace(/\D/g, '') })}
                keyboardType="number-pad"
                accessibilityLabel="Quantity"
              />
              <Text style={s.muted}>×</Text>
              <TextInput
                style={[s.input, { flex: 1, minWidth: 0 }]}
                value={r.unitPrice}
                onChangeText={(v) => update(i, { unitPrice: v })}
                keyboardType="decimal-pad"
                placeholder="$ price each"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Unit price in dollars"
              />
            </View>
          </Card>
        ))}
        <Button
          variant="secondary"
          label="+ Add labor or material"
          onPress={() =>
            setRows((rs) => [
              ...rs,
              { kind: 'MATERIAL', description: '', quantity: '1', unitPrice: '' },
            ])
          }
        />
        <Field
          label="Note for the client (optional)"
          value={notes}
          onChangeText={setNotes}
          maxLength={500}
          placeholder="e.g. Includes haul-away of the old unit"
        />

        {split && (
          <Card>
            <Text style={{ fontWeight: '600', color: colors.ink }}>How you get paid</Text>
            {[
              ['Client pays', formatCents(split.totalCents)],
              ['Jiko fee (15%, from labor first)', `− ${formatCents(split.commissionCents)}`],
              [
                'Materials advance — when you start on site',
                formatCents(split.materialsAdvanceCents),
              ],
              ['On completion', formatCents(split.completionPayoutCents)],
            ].map(([k, v]) => (
              <View key={k} style={[s.row, { justifyContent: 'space-between' }]}>
                <Text style={[s.muted, { flex: 1, fontSize: 14 }]}>{k}</Text>
                <Text style={{ fontWeight: '500', color: colors.ink }}>{v}</Text>
              </View>
            ))}
          </Card>
        )}
        {split?.requiresAdminReview && (
          <Banner
            tone="warning"
            text="This quote is mostly materials, so Jiko will check the prices before the client can pay."
          />
        )}
        <Text style={s.muted}>
          The materials advance is capped at $500. Upload your materials receipt before marking the
          job done.
        </Text>
        {error && <Text style={s.error}>{error}</Text>}
      </ScrollView>
    </Screen>
  );
}
