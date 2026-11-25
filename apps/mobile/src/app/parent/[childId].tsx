import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Switch } from 'react-native';
import { api } from '../../lib/api';
import type { ProgressSummary } from '../../lib/hooks';
import { type Tokens, useSession } from '../../lib/session';
import { Banner, Bars, Button, Card, Loading, Row, Screen, T } from '../../components/ui';
import type { Child } from './index';

interface ChildProgress {
  summary: ProgressSummary;
  plans: { examCode: string; status: string; expiresAt: string; source: string }[];
  tutorUsage: { date: string; messages: number; declined: number }[];
}

export default function ChildScreen() {
  const { childId, name } = useLocalSearchParams<{ childId: string; name: string }>();
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: ['child', childId], queryFn: () => api<ChildProgress>(`/parents/children/${childId}/progress`) });
  const children = useQuery({ queryKey: ['children'], queryFn: () => api<Child[]>('/parents/children') });
  const child = children.data?.find((c) => c.id === childId);
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !data) return <Loading />;
  const s = data.summary;
  const tutorWeek = data.tutorUsage.slice(-7).reduce((n, d) => n + d.messages, 0);

  return (
    <Screen>
      <Stack.Screen options={{ title: name }} />
      {error ? <Banner tone="error" text={error} /> : null}
      <Row gap={12}>
        <Card style={{ flex: 1 }}>
          <T v="title">{s.streakDays}</T>
          <T v="small">day streak</T>
        </Card>
        <Card style={{ flex: 1 }}>
          <T v="title">{s.minutesLast7Days}</T>
          <T v="small">minutes this week</T>
        </Card>
        <Card style={{ flex: 1 }}>
          <T v="title">{s.totalAttempts}</T>
          <T v="small">sessions (90 days)</T>
        </Card>
      </Row>
      <Card>
        <T v="heading">Scores by subject</T>
        {s.subjects.length ? <Bars data={s.subjects.map((x) => ({ label: `${x.name} (${x.examCode})`, value: Math.round(x.averagePercentage) }))} /> : <T v="muted">No practice yet.</T>}
      </Card>
      {s.weakTopics.length ? (
        <Card>
          <T v="heading">Topics to work on</T>
          {s.weakTopics.map((w) => <T key={w.topicId}>• {w.topicName} ({w.percentage}%)</T>)}
        </Card>
      ) : null}
      <Card>
        <T v="heading">Plans</T>
        {data.plans.length ? data.plans.map((p) => <T key={`${p.examCode}${p.source}`}>{p.examCode}: {p.status.toLowerCase().replace('_', ' ')} until {new Date(p.expiresAt).toLocaleDateString()}</T>) : <T v="muted">On the free level. Open the child's profile on this phone to buy a plan, or pay on the Ugo website.</T>}
      </Card>
      <Card>
        <T v="heading">AI tutor use</T>
        <T>{tutorWeek} messages in the last 7 days</T>
        {data.tutorUsage.some((d) => d.declined) ? <T v="small">The tutor declined {data.tutorUsage.reduce((n, d) => n + d.declined, 0)} off topic or unsafe requests this month.</T> : null}
      </Card>
      {child ? (
        <Card>
          <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <T style={{ flex: 1 }}>Allow leaderboards (display name only)</T>
            <Switch
              value={child.allowLeaderboard}
              accessibilityLabel="Allow leaderboards"
              onValueChange={async (v) => {
                await api(`/parents/children/${childId}`, { method: 'PATCH', body: { allowLeaderboard: v } }).catch((e) => setError((e as Error).message));
                await children.refetch();
              }}
            />
          </Row>
        </Card>
      ) : null}
      <Button
        label={`Hand this phone to ${name}`}
        onPress={async () => {
          const tokens = await api<Tokens>(`/parents/children/${childId}/session`, { method: 'POST' });
          await useSession.getState().enterChildProfile(tokens);
          router.replace('/');
        }}
      />
      <Button
        label="Withdraw consent and delete this profile"
        kind="danger"
        onPress={() =>
          Alert.alert('Delete this profile?', "This deletes the child's progress and data. It cannot be undone.", [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                await api(`/parents/children/${childId}`, { method: 'DELETE' });
                router.back();
              },
            },
          ])
        }
      />
    </Screen>
  );
}
