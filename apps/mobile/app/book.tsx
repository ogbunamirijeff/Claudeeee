import { marketDateString, SERVICE_ZIP_PATTERN, type JobView } from '@jiko/shared';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Banner, Button, Card, Chip, Field, Screen, s } from '../components/ui';
import { errorText, post, publicGet } from '../lib/api';
import electricalImg from '../assets/trades/electrical.webp';
import hvacImg from '../assets/trades/hvac.webp';
import plumbingImg from '../assets/trades/plumbing.webp';
import { formatDay, TIME_WINDOW } from '../lib/labels';
import { colors } from '../lib/theme';
import { pickPhoto, uploadPhoto } from '../lib/upload';

type Option = { id: string; slug: string; name: string };
const IMAGES: Record<string, number> = {
  plumbing: plumbingImg,
  electrical: electricalImg,
  hvac: hvacImg,
};
const HINTS: Record<string, string> = {
  plumbing: 'Leaks, clogs, water heaters, toilets',
  electrical: 'Outlets, breakers, fans, generator hookups',
  hvac: 'AC not cooling, furnace, tune-ups, thermostats',
};

export default function Book() {
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => marketDateString(new Date(Date.now() + i * 86_400_000))),
    [],
  );
  const [trades, setTrades] = useState<Option[]>([]);
  const [areas, setAreas] = useState<Option[]>([]);
  const [step, setStep] = useState(0);
  const [tradeId, setTradeId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<{ id: string; uri: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [addressLine, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [accessNotes, setAccessNotes] = useState('');
  const [day, setDay] = useState(days[1]!);
  const [timeWindow, setWindow] = useState<'MORNING' | 'AFTERNOON' | 'EVENING'>('MORNING');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([
      publicGet<Option[]>('/v1/catalog/trades'),
      publicGet<Option[]>('/v1/catalog/areas'),
    ])
      .then(([t, a]) => {
        setTrades(t);
        setAreas(a);
      })
      .catch((e) => setError(errorText(e)));
  }, []);

  const trade = trades.find((t) => t.id === tradeId);
  const area = areas.find((a) => a.id === areaId);
  const zipOk = SERVICE_ZIP_PATTERN.test(postalCode);
  const canNext = [
    !!tradeId,
    description.trim().length >= 10 && !uploading,
    !!areaId && addressLine.trim().length >= 5 && zipOk,
    true,
  ][step];

  async function addPhoto(source: 'library' | 'camera') {
    setError(null);
    try {
      const picked = await pickPhoto(source);
      if (!picked) return;
      setUploading(true);
      const up = await uploadPhoto(picked, 'JOB_REQUEST_PHOTO');
      setPhotos((p) => [...p, { id: up.fileId, uri: up.uri }]);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const job = await post<JobView>('/v1/jobs', {
        tradeId,
        areaId,
        description,
        addressLine,
        postalCode,
        accessNotes: accessNotes || undefined,
        preferredDate: day,
        timeWindow,
        photoFileIds: photos.map((p) => p.id),
      });
      router.replace(`/jobs/${job.id}`);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  const footer =
    step < 3 ? (
      <Button label="Continue" disabled={!canNext} onPress={() => setStep(step + 1)} />
    ) : (
      <Button label="Submit request" busy={busy} onPress={() => void submit()} />
    );

  return (
    <Screen
      title={step === 0 ? 'Book a job' : (trade?.name ?? 'Book a job')}
      trailing={`Step ${step + 1} of 4`}
      footer={footer}
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        {step > 0 && (
          <Pressable onPress={() => setStep(step - 1)} hitSlop={8}>
            <Text style={s.muted}>‹ Previous step</Text>
          </Pressable>
        )}
        {step === 0 && (
          <>
            <Text style={s.h1}>What do you need help with?</Text>
            <Text style={s.muted}>
              Every pro on Jiko is licensed, insured and has passed our 6-step Craft Seal check.
            </Text>
            {trades.map((t) => (
              <Pressable
                key={t.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: tradeId === t.id }}
                onPress={() => setTradeId(t.id)}
                style={{
                  flexDirection: 'row',
                  gap: 12,
                  alignItems: 'center',
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 12,
                  borderWidth: tradeId === t.id ? 2 : 1,
                  borderColor: tradeId === t.id ? colors.brand : colors.line,
                }}
              >
                {IMAGES[t.slug] ? (
                  <Image
                    source={IMAGES[t.slug]}
                    style={{ width: 64, height: 64, borderRadius: 8 }}
                  />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', fontSize: 16, color: colors.ink }}>
                    {t.name}
                  </Text>
                  <Text style={s.muted}>{HINTS[t.slug]}</Text>
                </View>
              </Pressable>
            ))}
          </>
        )}
        {step === 1 && (
          <>
            <Text style={s.h1}>Tell us what’s wrong</Text>
            <Field
              label="Describe the problem"
              multiline
              maxLength={1000}
              value={description}
              onChangeText={setDescription}
              placeholder="e.g. Kitchen sink is leaking under the cabinet"
            />
            <Text style={s.label}>Photos (optional, up to 5)</Text>
            <View style={s.wrap}>
              {photos.map((p) => (
                <Image
                  key={p.id}
                  source={{ uri: p.uri }}
                  style={{ width: 88, height: 88, borderRadius: 10 }}
                />
              ))}
            </View>
            {photos.length < 5 && (
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Button
                    variant="secondary"
                    label={uploading ? 'Uploading…' : 'Take photo'}
                    disabled={uploading}
                    onPress={() => void addPhoto('camera')}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    variant="secondary"
                    label="From library"
                    disabled={uploading}
                    onPress={() => void addPhoto('library')}
                  />
                </View>
              </View>
            )}
            <Text style={s.muted}>Photos are shrunk on your phone before upload to save data.</Text>
          </>
        )}
        {step === 2 && (
          <>
            <Text style={s.h1}>Where and when?</Text>
            <Text style={s.label}>Area</Text>
            <View style={s.wrap}>
              {areas.map((a) => (
                <Chip
                  key={a.id}
                  label={a.name}
                  selected={areaId === a.id}
                  onPress={() => setAreaId(a.id)}
                />
              ))}
            </View>
            <Field
              label="Address"
              value={addressLine}
              onChangeText={setAddress}
              placeholder="1234 Yale St, Apt 2"
              autoComplete="street-address"
            />
            <Field
              label="ZIP code"
              value={postalCode}
              onChangeText={(v) => setPostalCode(v.replace(/\D/g, '').slice(0, 5))}
              keyboardType="number-pad"
              placeholder="77008"
              autoComplete="postal-code"
            />
            {postalCode.length === 5 && !zipOk && (
              <Text style={s.error}>Jiko serves the Houston area for now.</Text>
            )}
            <Field
              label="Access notes (optional)"
              value={accessNotes}
              onChangeText={setAccessNotes}
              maxLength={200}
              placeholder="Gate code, parking, pets"
            />
            <Text style={s.label}>Day</Text>
            <View style={s.wrap}>
              {days.map((d, i) => (
                <Chip
                  key={d}
                  label={i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : formatDay(d)}
                  selected={day === d}
                  onPress={() => setDay(d)}
                />
              ))}
            </View>
            <Text style={s.label}>Time window</Text>
            <View style={s.wrap}>
              {(Object.keys(TIME_WINDOW) as (typeof timeWindow)[]).map((w) => (
                <Chip
                  key={w}
                  label={TIME_WINDOW[w]!}
                  selected={timeWindow === w}
                  onPress={() => setWindow(w)}
                />
              ))}
            </View>
            <Text style={s.muted}>
              Your full address and access notes are shared with the pro only after they accept the
              job.
            </Text>
          </>
        )}
        {step === 3 && (
          <>
            <Text style={s.h1}>Check your request</Text>
            <Card>
              {[
                ['Trade', trade?.name],
                ['Problem', description],
                ['Photos', photos.length ? `${photos.length} attached` : 'None'],
                ['Where', `${addressLine}, ${area?.name ?? ''} ${postalCode}`],
                ['When', `${formatDay(day)}, ${TIME_WINDOW[timeWindow]}`],
              ].map(([k, v]) => (
                <View key={k} style={{ flexDirection: 'row', gap: 12 }}>
                  <Text style={[s.muted, { width: 72, fontSize: 14 }]}>{k}</Text>
                  <Text style={{ flex: 1, fontWeight: '500', color: colors.ink }}>{v}</Text>
                </View>
              ))}
            </Card>
            <Text style={{ fontWeight: '600', fontSize: 16, color: colors.ink }}>
              What happens next
            </Text>
            {[
              'Jiko assigns a Craft Seal pro near you',
              'They visit or inspect, then send an itemized quote',
              'You approve and pay — Jiko holds the money',
              'The pro is paid only when you confirm the job is done',
            ].map((t, i) => (
              <Text key={t} style={s.body}>
                {i + 1}. {t}
              </Text>
            ))}
          </>
        )}
        {error && <Banner tone="warning" text={error} />}
      </ScrollView>
    </Screen>
  );
}
