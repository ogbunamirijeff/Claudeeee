import { formatNgPhone } from '@jiko/shared/phone';
import { Redirect } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';
import type { AppMode } from '../lib/session';
import { colors } from '../lib/theme';

export default function Home() {
  const { status, me, mode, setMode, signOut } = useAuth();
  if (status !== 'signedIn' || !me) return <Redirect href="/login" />;
  const isArtisan = me.roles.includes('ARTISAN');

  return (
    <SafeAreaView style={s.wrap}>
      <View style={s.header}>
        <Text style={s.logo}>Jiko</Text>
        <Pressable onPress={signOut}>
          <Text style={s.muted}>Sign out</Text>
        </Pressable>
      </View>

      {isArtisan && (
        <View style={s.toggle} accessibilityRole="tablist">
          {(['client', 'artisan'] as AppMode[]).map((m) => (
            <Pressable key={m} onPress={() => setMode(m)} style={[s.tab, mode === m && s.tabActive]} accessibilityState={{ selected: mode === m }}>
              <Text style={[s.tabText, mode === m && s.tabTextActive]}>{m === 'client' ? 'Book a job' : 'My work'}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={s.h1}>{me.name ? `Hello, ${me.name.split(' ')[0]}` : 'Welcome to Jiko'}</Text>
      <Text style={s.muted}>{formatNgPhone(me.phone)}</Text>

      <View style={s.card}>
        <Text style={s.cardTitle}>{mode === 'artisan' ? 'Artisan mode' : 'Client mode'}</Text>
        <Text style={s.muted}>
          {mode === 'artisan'
            ? 'Job offers, quotes and payouts arrive in the next release.'
            : 'Booking a plumber, electrician or AC technician arrives in the next release.'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 24, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  logo: { fontSize: 20, fontWeight: '600', color: colors.ink },
  h1: { fontSize: 24, fontWeight: '600', color: colors.ink, marginTop: 8 },
  muted: { color: colors.muted, fontSize: 14 },
  toggle: { flexDirection: 'row', backgroundColor: colors.brandSoft, borderRadius: 10, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: colors.surface },
  tabText: { color: colors.muted, fontWeight: '500' },
  tabTextActive: { color: colors.ink },
  card: { marginTop: 12, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 12, padding: 16, gap: 6 },
  cardTitle: { fontWeight: '600', color: colors.ink, fontSize: 16 },
});
