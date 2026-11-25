import { useRouter } from 'expo-router';
import { useProgress } from '../../lib/hooks';
import { Banner, Bars, Button, Card, Columns, Loading, Row, Screen, T } from '../../components/ui';

export default function Progress() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useProgress();
  if (isLoading) return <Loading />;
  if (!data) return <Screen><Banner tone="error" text={(error as Error)?.message ?? 'Could not load progress'} /><Button label="Try again" onPress={() => refetch()} /></Screen>;
  const last = data.daily.slice(-10).map((d) => ({ label: d.date.slice(5), value: Math.round(d.averagePercentage) }));
  return (
    <Screen>
      <T v="title">My progress</T>
      <Row gap={12}>
        <Stat label="Day streak" value={String(data.streakDays)} />
        <Stat label="Attempts" value={String(data.totalAttempts)} />
        <Stat label="Minutes this week" value={String(data.minutesLast7Days)} />
      </Row>
      <Card>
        <T v="heading">Score trend</T>
        {last.length ? <Columns data={last} /> : <T v="muted">Finish a practice session to see your trend.</T>}
      </Card>
      <Card>
        <T v="heading">Subjects</T>
        {data.subjects.length ? <Bars data={data.subjects.map((s) => ({ label: `${s.name} (${s.examCode})`, value: Math.round(s.averagePercentage) }))} /> : <T v="muted">No results yet.</T>}
      </Card>
      <Card>
        <T v="heading">Weak topics</T>
        {data.weakTopics.length ? <Bars data={data.weakTopics.map((w) => ({ label: w.topicName, value: Math.round(w.percentage) }))} /> : <T v="muted">Keep practising. Topics where you score under 60% will show here.</T>}
      </Card>
      <Button label="Leaderboards" kind="secondary" onPress={() => router.push('/leaderboard')} />
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1, minWidth: 100 }}>
      <T v="title">{value}</T>
      <T v="small">{label}</T>
    </Card>
  );
}
