import type { JobCardView } from '@jiko/shared';
import { formatPhone } from '@jiko/shared/phone';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Button, s as ui } from '../components/ui';
import { authed, errorText } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDay, formatTime, STATUS_LABEL, STATUS_TONE, TIME_WINDOW } from '../lib/labels';
import type { AppMode } from '../lib/session';
import { colors } from '../lib/theme';

export default function Home() {
  const { status, me, mode, setMode, signOut } = useAuth();
  const [jobs, setJobs] = useState<JobCardView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setJobs(await authed<JobCardView[]>(mode === 'artisan' ? '/v1/artisan/jobs' : '/v1/jobs'));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useFocusEffect(
    useCallback(() => {
      if (status === 'signedIn') void load();
    }, [status, load]),
  );

  if (status !== 'signedIn' || !me) return <Redirect href="/login" />;
  const isPro = me.roles.includes('ARTISAN');

  return (
    <SafeAreaView style={st.wrap} edges={['top']}>
      <View style={st.header}>
        <Text style={st.logo}>Jiko</Text>
        <Pressable onPress={() => void signOut()}>
          <Text style={ui.muted}>Sign out</Text>
        </Pressable>
      </View>

      {isPro && (
        <View style={st.toggle} accessibilityRole="tablist">
          {(['client', 'artisan'] as AppMode[]).map((m) => (
            <Pressable
              key={m}
              onPress={() => void setMode(m)}
              style={[st.tab, mode === m && st.tabActive]}
              accessibilityState={{ selected: mode === m }}
            >
              <Text style={[st.tabText, mode === m && { color: colors.ink }]}>
                {m === 'client' ? 'Book a job' : 'My work'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <FlatList
        data={jobs}
        keyExtractor={(j) => j.assignmentId ?? j.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ gap: 4, marginBottom: 8 }}>
            <Text style={ui.h1}>
              {mode === 'artisan'
                ? 'Offers and jobs'
                : me.name
                  ? `Hi, ${me.name.split(' ')[0]}`
                  : 'Your jobs'}
            </Text>
            <Text style={ui.muted}>{formatPhone(me.phone)}</Text>
            {mode === 'artisan' && (
              <Pressable onPress={() => router.push('/payouts')} style={{ paddingVertical: 6 }}>
                <Text style={{ color: colors.info, fontWeight: '500' }}>Payouts and setup ›</Text>
              </Pressable>
            )}
            {error && <Text style={ui.error}>{error}</Text>}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={[ui.muted, { textAlign: 'center', padding: 24 }]}>
              {mode === 'artisan'
                ? 'No offers right now. We’ll text you when a job comes in.'
                : 'No jobs yet. Book a licensed, vetted pro in minutes.'}
            </Text>
          ) : undefined
        }
        renderItem={({ item: j }) => (
          <Pressable onPress={() => router.push(`/jobs/${j.id}`)} style={st.card}>
            <View style={[ui.row, { justifyContent: 'space-between' }]}>
              <Text style={st.cardTitle}>
                {j.trade} · {j.area}
              </Text>
              <Badge tone={STATUS_TONE[j.status]} label={STATUS_LABEL[j.status] ?? j.status} />
            </View>
            <Text style={ui.muted} numberOfLines={2}>
              {j.description}
            </Text>
            <Text style={[ui.muted, { fontSize: 12 }]}>
              {j.ref} · {formatDay(j.preferredDate)}, {TIME_WINDOW[j.timeWindow]}
              {j.offerExpiresAt ? ` · respond by ${formatTime(j.offerExpiresAt)}` : ''}
            </Text>
          </Pressable>
        )}
        style={{ paddingHorizontal: 24 }}
      />
      {mode === 'client' && (
        <View style={ui.footer}>
          <Button label="Book a job" onPress={() => router.push('/book')} />
        </View>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  logo: { fontSize: 20, fontWeight: '600', color: colors.ink },
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.brandSoft,
    borderRadius: 10,
    padding: 4,
    marginHorizontal: 24,
    marginBottom: 12,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: colors.surface },
  tabText: { color: colors.muted, fontWeight: '500' },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  cardTitle: { fontWeight: '600', color: colors.ink, fontSize: 15, flex: 1 },
});
