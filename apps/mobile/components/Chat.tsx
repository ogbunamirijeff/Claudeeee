import type { MessageView } from '@jiko/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, TextInput, View } from 'react-native';
import { authed, errorText, post } from '../lib/api';
import { colors } from '../lib/theme';
import { s } from './ui';

const POLL_MS = 10_000;

/** Per-job chat. Polls every 10s while the app is in the foreground — light on data. */
export function Chat({ jobId }: { jobId: string }) {
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const last = useRef<string | null>(null);

  const poll = useCallback(async () => {
    const q = last.current ? `?after=${encodeURIComponent(last.current)}` : '';
    const fresh = await authed<MessageView[]>(`/v1/jobs/${jobId}/messages${q}`);
    if (fresh.length) {
      last.current = fresh.at(-1)!.createdAt;
      setMessages((m) => [...m, ...fresh.filter((f) => !m.some((x) => x.id === f.id))]);
    }
  }, [jobId]);

  useEffect(() => {
    void poll().catch((e) => setError(errorText(e)));
    const t = setInterval(() => {
      if (AppState.currentState === 'active') void poll().catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await post(`/v1/jobs/${jobId}/messages`, { body });
      setBody('');
      await poll();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>Messages</Text>
      {messages.length === 0 && <Text style={s.muted}>No messages yet.</Text>}
      {messages.map((m) => {
        const mine = m.from === 'me';
        return (
          <View
            key={m.id}
            style={{
              alignSelf: mine ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 8,
              backgroundColor: mine ? colors.brand : colors.surface,
              borderWidth: mine ? 0 : 1,
              borderColor: colors.line,
            }}
          >
            {!mine && (
              <Text style={{ fontSize: 11, color: colors.muted }}>
                {m.from === 'jiko' ? 'Jiko' : (m.senderName ?? m.from)}
              </Text>
            )}
            <Text style={{ color: mine ? colors.brandFg : colors.ink, fontSize: 14 }}>
              {m.body}
            </Text>
          </View>
        );
      })}
      <View style={s.row}>
        <TextInput
          style={[s.input, { flex: 1, minWidth: 0 }]}
          value={body}
          onChangeText={setBody}
          placeholder="Write a message"
          placeholderTextColor={colors.muted}
          maxLength={1000}
          accessibilityLabel="Message"
        />
        <Pressable
          onPress={() => void send()}
          disabled={busy || !body.trim()}
          style={{
            backgroundColor: colors.brand,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 13,
            opacity: busy || !body.trim() ? 0.5 : 1,
          }}
        >
          <Text style={{ color: colors.brandFg, fontWeight: '600' }}>Send</Text>
        </Pressable>
      </View>
      <Text style={s.muted}>
        Phone numbers are hidden until payment is made through Jiko — it protects both sides.
      </Text>
      {error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}
