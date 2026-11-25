import { useFocusEffect, useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import type { ExamCode } from '@ugo/shared';
import { subjectsWithContent } from '../../lib/content';
import { kvSet } from '../../lib/db';
import { useEntitlements } from '../../lib/entitlements';
import { useCatalog } from '../../lib/hooks';
import { localPack, syncPack, type LocalPack } from '../../lib/packs';
import { Banner, Button, Card, Loading, Pill, Row, Screen, T } from '../../components/ui';

export default function ExamScreen() {
  const { code } = useLocalSearchParams<{ code: ExamCode }>();
  const router = useRouter();
  const { data: catalog } = useCatalog();
  const has = useEntitlements((s) => s.has(code));
  const [pack, setPack] = useState<LocalPack | null>(null);
  const [subjects, setSubjects] = useState<Awaited<ReturnType<typeof subjectsWithContent>>>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setPack(await localPack(code));
    setSubjects(await subjectsWithContent(code));
  }, [code]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const exam = catalog?.find((c) => c.code === code);
  if (!exam) return <Loading />;

  const update = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const whatsNew = await syncPack(code, { background: false, wifiOnly: false });
      if (whatsNew) await kvSet('whatsNew', whatsNew);
      setMsg({ tone: 'success', text: whatsNew ? `Updated. ${whatsNew}` : 'You have the latest content.' });
      await load();
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: exam.name }} />
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="title">{exam.name}</T>
        <Pill label={has ? 'Plan active' : 'Free level'} />
      </Row>
      {exam.disclaimer ? <T v="small">{exam.disclaimer}</T> : null}
      {exam.electiveCount ? <Banner text={`JAMB candidates take Use of English plus any ${exam.electiveCount} other subjects.`} /> : null}
      {msg ? <Banner tone={msg.tone} text={msg.text} /> : null}
      {!has ? (
        <Card>
          <T v="heading">You are seeing free samples</T>
          <T v="muted">A plan unlocks every subject, past question, mock exam, note, video and flashcard in {exam.name} for 12 months, plus the AI tutor.</T>
          <Button label="See plans" onPress={() => router.push('/plans')} />
        </Card>
      ) : null}
      <Card>
        <T v="muted">{pack ? `Content version ${pack.version}${pack.is_sample ? ' (samples)' : ''}, downloaded ${new Date(pack.downloaded_at).toLocaleDateString()}` : 'Not downloaded yet.'}</T>
        <Button label={pack ? 'Check for updates' : 'Download content'} kind="secondary" onPress={update} loading={busy} />
      </Card>
      <T v="heading">Subjects</T>
      {subjects.length === 0 ? <T v="muted">No subjects downloaded yet.</T> : null}
      {subjects.map((s) => (
        <Card key={s.subject_id} onPress={() => router.push({ pathname: '/subject/[id]', params: { id: s.subject_id, code, name: s.subject_name } })} accessibilityLabel={`${s.subject_name}, ${s.questions} questions`}>
          <T v="heading">{s.subject_name}</T>
          <T v="small">
            {s.questions} questions · {s.notes} notes · {s.decks} flashcard sets{s.videos ? ` · ${s.videos} videos` : ''}
          </T>
        </Card>
      ))}
      {exam.subjects.length > subjects.length ? <T v="small">{exam.subjects.length - subjects.length} more subjects have content coming soon.</T> : null}
    </Screen>
  );
}
