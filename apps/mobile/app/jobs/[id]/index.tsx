import type { JobView } from '@jiko/shared';
import { formatCents } from '@jiko/shared/money';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Chat } from '../../../components/Chat';
import { QuoteCard } from '../../../components/QuoteCard';
import { Badge, Banner, Button, Card, Chip, Field, Screen, s } from '../../../components/ui';
import { authed, errorText, post } from '../../../lib/api';
import { formatDay, formatTime, STATUS_LABEL, STATUS_TONE, TIME_WINDOW } from '../../../lib/labels';
import { colors } from '../../../lib/theme';

const DECLINE_REASONS = ['Fully booked that day', 'Too far from me', 'Not my specialty'];

/** One screen for every viewer; the API decides what each role sees and may do. */
export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      setJob(await authed<JobView>(`/v1/jobs/${id}`));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [id]);
  useFocusEffect(useCallback(() => void load(), [load]));

  async function act(path: string, body?: unknown, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await post(path, body ?? {});
      setDeclining(false);
      setRejecting(false);
      setReason('');
      if (after) after();
      else await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!job) {
    return (
      <Screen title="Job">
        <View style={{ padding: 24 }}>
          {error ? (
            <Text style={s.error}>{error}</Text>
          ) : (
            <ActivityIndicator color={colors.brand} />
          )}
        </View>
      </Screen>
    );
  }

  const can = (a: string) => job.actions.includes(a as never);
  const q = job.quote;
  const pro = job.viewer === 'artisan';
  const offerOpen = pro && job.offer?.status === 'OFFERED';
  const waitingReview = job.status === 'AWAITING_PAYMENT' && q?.reviewStatus === 'PENDING';
  const chatOpen =
    (pro ? job.offer?.status === 'ACCEPTED' : !!job.artisan) &&
    !['CANCELLED', 'REFUNDED'].includes(job.status);

  let footer = null;
  if (offerOpen) {
    footer = declining ? null : (
      <>
        <Button
          label="Accept job"
          busy={busy}
          onPress={() => void act(`/v1/assignments/${job.offer!.assignmentId}/accept`)}
        />
        <Button
          label="Decline"
          variant="secondary"
          disabled={busy}
          onPress={() => setDeclining(true)}
        />
      </>
    );
  } else if (pro && can('submitQuote')) {
    footer = (
      <Button
        label={q && q.status === 'SUBMITTED' ? 'Revise quote' : 'Build quote'}
        onPress={() => router.push(`/jobs/${job.id}/quote`)}
      />
    );
  } else if (!pro && can('approveQuote') && q?.status === 'SUBMITTED' && !rejecting) {
    footer = (
      <>
        <Button
          label={`Approve quote · ${formatCents(q.totalCents)}`}
          busy={busy}
          onPress={() => void act(`/v1/quotes/${q.id}/approve`)}
        />
        <Button
          label="Ask for changes"
          variant="secondary"
          disabled={busy}
          onPress={() => setRejecting(true)}
        />
      </>
    );
  }

  return (
    <Screen title={job.ref} trailing={job.trade.name} footer={footer}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, gap: 14 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[s.row, { flexWrap: 'wrap' }]}>
          <Text style={s.h1}>
            {job.trade.name} · {job.area.name}
          </Text>
          <Badge
            tone={STATUS_TONE[offerOpen ? 'OFFERED' : job.status]}
            label={STATUS_LABEL[offerOpen ? 'OFFERED' : job.status] ?? job.status}
          />
        </View>
        <Text style={s.muted}>
          {formatDay(job.preferredDate)}, {TIME_WINDOW[job.timeWindow]}
        </Text>

        {offerOpen && job.offer?.expiresAt && (
          <Banner
            tone="warning"
            text={`Respond by ${formatTime(job.offer.expiresAt)}, or the job goes to another pro.`}
          />
        )}
        {!pro && (job.status === 'PENDING_ASSIGNMENT' || job.status === 'ASSIGNED') && (
          <Banner
            tone="info"
            text="We’re finding a Craft Seal pro near you. This usually takes under 2 working hours."
          />
        )}

        {!pro && job.artisan && (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: colors.brandSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontWeight: '600' }}>{job.artisan.name?.[0] ?? '?'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', fontSize: 16, color: colors.ink }}>
                {job.artisan.name}
              </Text>
              <Text style={s.muted}>
                {job.artisan.ratingCount > 0 ? `★ ${job.artisan.ratingAvg.toFixed(1)} · ` : ''}
                {job.artisan.jobsCompleted} jobs on Jiko
              </Text>
              <Text style={s.muted}>{job.artisan.phone}</Text>
            </View>
            {job.artisan.sealed && <Badge tone="success" label="Craft Seal" />}
          </Card>
        )}

        {q && (
          <>
            {waitingReview && (
              <Banner
                tone="warning"
                text="This quote is mostly parts, so a Jiko specialist checks the prices before you pay. Usually within 2 working hours."
              />
            )}
            <QuoteCard quote={q} />
            {!pro && can('approveQuote') && q.status === 'SUBMITTED' && (
              <Banner
                tone="success"
                text="Your money is held by Jiko. The pro is paid only when you confirm the job is done. 7-day redo guarantee."
              />
            )}
            {!pro && job.status === 'AWAITING_PAYMENT' && !waitingReview && (
              <Banner
                tone="info"
                text="Quote approved. Secure payment opens in the next release."
              />
            )}
          </>
        )}

        <Card>
          <Text style={s.body}>{job.description}</Text>
          {job.addressLine ? (
            <Text style={s.muted}>
              {job.addressLine}, {job.postalCode}
              {job.accessNotes ? ` · ${job.accessNotes}` : ''}
            </Text>
          ) : (
            <Text style={s.muted}>ZIP {job.postalCode} · full address shown after you accept</Text>
          )}
          {pro && (
            <Text style={s.muted}>
              Client: {job.client.name ?? '—'} · {job.client.phone}
            </Text>
          )}
          {job.photos.length > 0 && (
            <View style={s.wrap}>
              {job.photos.map((p) => (
                <Image
                  key={p.id}
                  source={{ uri: p.url }}
                  style={{ width: 88, height: 88, borderRadius: 10 }}
                />
              ))}
            </View>
          )}
        </Card>

        {declining && (
          <View style={{ gap: 10 }}>
            <Text style={s.label}>Why are you declining?</Text>
            <View style={s.wrap}>
              {DECLINE_REASONS.map((r) => (
                <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />
              ))}
            </View>
            <Button
              label="Decline job"
              disabled={busy || !reason}
              onPress={() =>
                void act(`/v1/assignments/${job.offer!.assignmentId}/decline`, { reason }, () =>
                  router.replace('/home'),
                )
              }
            />
            <Button
              label="Keep the offer"
              variant="secondary"
              onPress={() => setDeclining(false)}
            />
          </View>
        )}
        {rejecting && q && (
          <View style={{ gap: 10 }}>
            <Field
              label="What should change?"
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Can you use a cheaper breaker?"
            />
            <Button
              label="Send to pro"
              disabled={busy || reason.trim().length < 3}
              onPress={() => void act(`/v1/quotes/${q.id}/reject`, { reason })}
            />
            <Button label="Cancel" variant="secondary" onPress={() => setRejecting(false)} />
          </View>
        )}

        {chatOpen && <Chat jobId={job.id} />}

        {!pro && can('cancel') && (
          <Text
            style={[s.muted, { textDecorationLine: 'underline' }]}
            onPress={() =>
              Alert.alert('Cancel this request?', 'The pro will be notified.', [
                { text: 'Keep it', style: 'cancel' },
                {
                  text: 'Cancel request',
                  style: 'destructive',
                  onPress: () =>
                    void act(`/v1/jobs/${job.id}/cancel`, { reason: 'Canceled by client in app' }),
                },
              ])
            }
          >
            Cancel this request
          </Text>
        )}
        {error && <Text style={s.error}>{error}</Text>}
      </ScrollView>
    </Screen>
  );
}
