import { useRouter } from 'expo-router';
import { useCatalog } from '../../lib/hooks';
import { useEntitlements } from '../../lib/entitlements';
import { useSettings } from '../../lib/settings';
import { Button, Card, Loading, Pill, Row, Screen, T } from '../../components/ui';

export default function Mocks() {
  const router = useRouter();
  const { data } = useCatalog();
  const selected = useSettings((s) => s.selectedExams);
  const has = useEntitlements((s) => s.has);
  if (!data) return <Loading />;
  const exams = data.filter((e) => selected.includes(e.code));
  return (
    <Screen>
      <T v="title">Mock exams</T>
      <T v="muted">Timed like the real exam. You get your score, time per question and the topics to study next.</T>
      {exams.length === 0 ? <Button label="Choose your exams" onPress={() => router.push('/choose-exams')} /> : null}
      {exams.map((e) => (
        <Card key={e.code}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="heading">{e.name}</T>
            <Pill label={has(e.code) ? `${e.mockMinutes} min` : 'Free sample'} />
          </Row>
          <T v="muted">{e.mockSections.map((s) => s.name).join(' · ')}</T>
          <Button label={has(e.code) ? 'Start full mock' : 'Try the short sample mock'} onPress={() => router.push({ pathname: '/mock/[code]', params: { code: e.code } })} />
        </Card>
      ))}
    </Screen>
  );
}
