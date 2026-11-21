import { formatCents } from '@jiko/shared/money';
import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Badge, Banner, Button, Card, Screen, s } from '../components/ui';
import { authed, errorText, post } from '../lib/api';
import { formatDay } from '../lib/labels';
import { colors } from '../lib/theme';

interface PayoutStatus {
  accountConnected: boolean;
  payoutsEnabled: boolean;
  payouts: {
    id: string;
    jobRef: string;
    amountCents: number;
    trigger: string;
    status: string;
    initiatedAt: string;
    note: string | null;
  }[];
}

const TRIGGER: Record<string, string> = {
  MATERIALS_ADVANCE: 'Materials advance',
  CLIENT_CONFIRMED: 'Job payout',
  AUTO_RELEASE: 'Job payout (auto-released)',
  DISPUTE_RESOLUTION: 'Dispute payout',
};

/** Pro payouts: Stripe Connect setup and transfer history. */
export default function Payouts() {
  const [data, setData] = useState<PayoutStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await authed<PayoutStatus>('/v1/artisan/payouts'));
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));

  async function setup() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await post<{ url: string }>('/v1/artisan/payouts/onboarding');
      await WebBrowser.openBrowserAsync(url);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const footer =
    data && !data.payoutsEnabled ? (
      <Button
        label={data.accountConnected ? 'Finish payout setup' : 'Set up payouts'}
        busy={busy}
        onPress={() => void setup()}
      />
    ) : null;
  return (
    <Screen title="Payouts" footer={footer}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, gap: 12 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} />}
      >
        {data && !data.payoutsEnabled && (
          <Banner
            tone="warning"
            text="Set up payouts to get paid. Stripe verifies your identity and bank account; Jiko never sees your bank details."
          />
        )}
        {data?.payoutsEnabled && (
          <Banner
            tone="success"
            text="Payouts are on. Money usually reaches your bank 2 business days after each transfer."
          />
        )}
        {data?.payouts.length === 0 && <Text style={s.muted}>No payouts yet.</Text>}
        {data?.payouts.map((p) => (
          <Card key={p.id}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={{ fontWeight: '600', color: colors.ink }}>
                {formatCents(p.amountCents)}
              </Text>
              <Badge
                tone={
                  p.status === 'SUCCEEDED'
                    ? 'success'
                    : p.status === 'FAILED'
                      ? 'danger'
                      : 'warning'
                }
                label={
                  p.status === 'SUCCEEDED'
                    ? 'Sent'
                    : p.status === 'PENDING'
                      ? 'Waiting for setup'
                      : p.status.toLowerCase()
                }
              />
            </View>
            <Text style={s.muted}>
              {TRIGGER[p.trigger] ?? p.trigger} · {p.jobRef} ·{' '}
              {formatDay(p.initiatedAt.slice(0, 10))}
            </Text>
          </Card>
        ))}
        {error && <Text style={s.error}>{error}</Text>}
      </ScrollView>
    </Screen>
  );
}
