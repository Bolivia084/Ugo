import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useCatalog, useProgress } from '../../lib/hooks';
import { useEntitlements } from '../../lib/entitlements';
import { kvGet, kvSet } from '../../lib/db';
import { useSession } from '../../lib/session';
import { useSettings } from '../../lib/settings';
import { pendingCount } from '../../lib/sync';
import { Banner, Button, Card, Loading, Pill, Row, Screen, T } from '../../components/ui';

export default function Home() {
  const router = useRouter();
  const me = useSession((s) => s.me);
  const parentTokens = useSession((s) => s.parentTokens);
  const { data: catalog, isLoading } = useCatalog();
  const { data: progress } = useProgress();
  const selected = useSettings((s) => s.selectedExams);
  const has = useEntitlements((s) => s.has);
  const [pending, setPending] = useState(0);
  const [whatsNew, setWhatsNew] = useState<string | null>(null);

  useEffect(() => {
    void pendingCount().then(setPending);
    void kvGet<string>('whatsNew').then(setWhatsNew);
  }, []);

  if (isLoading || !catalog) return <Loading />;
  const mine = catalog.filter((c) => selected.includes(c.code));

  return (
    <Screen>
      <T v="title">Hello, {me?.displayName ?? 'there'}</T>
      {parentTokens ? (
        <Button label="Return to parent account" kind="secondary" onPress={async () => { await useSession.getState().returnToParent(); router.replace('/'); }} />
      ) : null}
      {whatsNew ? (
        <Card>
          <T v="heading">What's new</T>
          <T>{whatsNew}</T>
          <Button label="Got it" kind="ghost" onPress={async () => { await kvSet('whatsNew', null); setWhatsNew(null); }} />
        </Card>
      ) : null}
      {pending > 0 ? <Banner tone="warn" text={`${pending} result${pending > 1 ? 's' : ''} saved on this phone will sync when you are online.`} /> : null}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="heading">Daily streak</T>
          <Pill label={`${progress?.streakDays ?? 0} day${progress?.streakDays === 1 ? '' : 's'}`} color="#F2B705" />
        </Row>
        <T v="muted">Practise every day to keep your streak going.</T>
      </Card>
      <T v="heading">My exams</T>
      {mine.length === 0 ? <T v="muted">Pick the exams you are preparing for.</T> : null}
      {mine.map((c) => (
        <Card key={c.code} onPress={() => router.push({ pathname: '/exam/[code]', params: { code: c.code } })} accessibilityLabel={`${c.name}. ${has(c.code) ? 'Plan active' : 'Free level'}`}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="heading">{c.name}</T>
            <Pill label={has(c.code) ? 'Plan active' : 'Free'} />
          </Row>
          <T v="muted">{c.description}</T>
        </Card>
      ))}
      <Button label="Choose exams" kind="secondary" onPress={() => router.push('/choose-exams')} />
      {progress?.weakTopics.length ? (
        <Card>
          <T v="heading">Study next</T>
          {progress.weakTopics.slice(0, 3).map((w) => (
            <T key={w.topicId}>• {w.topicName} ({w.percentage}%)</T>
          ))}
        </Card>
      ) : null}
      <Button label="Ask the AI tutor" kind="ghost" onPress={() => router.push('/tutor')} />
    </Screen>
  );
}

