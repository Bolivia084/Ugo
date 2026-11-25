import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Switch } from 'react-native';
import { api } from '../lib/api';
import { type Me, useSession } from '../lib/session';
import { useSettings } from '../lib/settings';
import { Banner, Button, Card, Loading, Row, Screen, T } from '../components/ui';

interface Entry {
  rank: number;
  displayName: string;
  averagePercentage: number;
  mocks: number;
  isMe: boolean;
}

/** Display names only. Optional; under 13s need a parent to switch it on. */
export default function Leaderboard() {
  const me = useSession((s) => s.me);
  const exams = useSettings((s) => s.selectedExams);
  const [code, setCode] = useState(exams[0] ?? 'WAEC');
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['leaderboard', code], queryFn: () => api<Entry[]>(`/leaderboard/${code}`) });

  const toggle = async (v: boolean) => {
    setError(null);
    try {
      useSession.getState().setMe(await api<Me>('/me', { method: 'PATCH', body: { leaderboardOptIn: v } }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Leaderboards' }} />
      <Card>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <T style={{ flex: 1 }}>Show me on leaderboards (display name only)</T>
          <Switch value={Boolean(me?.leaderboardOptIn)} onValueChange={toggle} accessibilityLabel="Show me on leaderboards" />
        </Row>
        <T v="small">Based on mock exams in the last 30 days. You can leave at any time.</T>
      </Card>
      {error ? <Banner tone="warn" text={error} /> : null}
      <Row>
        {exams.map((e) => (
          <Button key={e} label={e} kind={e === code ? 'primary' : 'ghost'} onPress={() => setCode(e)} />
        ))}
      </Row>
      {isLoading ? <Loading /> : null}
      {data?.length === 0 ? <T v="muted">No one is on this leaderboard yet.</T> : null}
      {data?.map((d) => (
        <Card key={d.rank} style={d.isMe ? { borderWidth: 2 } : undefined}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="heading">
              {d.rank}. {d.displayName}
              {d.isMe ? ' (you)' : ''}
            </T>
            <T>{d.averagePercentage}%</T>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
