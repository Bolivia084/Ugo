import { useRouter } from 'expo-router';
import { useCatalog } from '../../lib/hooks';
import { useSettings } from '../../lib/settings';
import { Button, Card, Loading, Screen, T } from '../../components/ui';

export default function Practice() {
  const router = useRouter();
  const { data } = useCatalog();
  const selected = useSettings((s) => s.selectedExams);
  if (!data) return <Loading />;
  const exams = data.filter((e) => selected.includes(e.code));
  return (
    <Screen>
      <T v="title">Practice</T>
      <T v="muted">Pick an exam, then a subject. Answers come with a worked explanation.</T>
      {exams.length === 0 ? <Button label="Choose your exams" onPress={() => router.push('/choose-exams')} /> : null}
      {exams.map((e) => (
        <Card key={e.code} onPress={() => router.push({ pathname: '/exam/[code]', params: { code: e.code } })} accessibilityLabel={`Practise ${e.name}`}>
          <T v="heading">{e.name}</T>
          <T v="muted">{e.subjects.length} subjects</T>
        </Card>
      ))}
    </Screen>
  );
}
