import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import type { AttemptResult } from '@ugo/shared';
import { getDb } from '../../lib/db';
import { Bars, Button, Card, Loading, Row, Screen, T } from '../../components/ui';

export default function Results() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const router = useRouter();
  const [r, setR] = useState<AttemptResult | null>(null);
  useEffect(() => {
    void getDb()
      .then((db) => db.getFirstAsync<{ result: string }>('SELECT result FROM local_attempts WHERE client_id = ?', clientId))
      .then((row) => row && setR(JSON.parse(row.result)));
  }, [clientId]);
  if (!r) return <Loading />;
  const avgSec = Math.round(r.averageTimeMs / 1000);
  return (
    <Screen>
      <T v="title">Your result</T>
      <Row gap={12}>
        <Card style={{ flex: 1 }}>
          <T v="hero">{r.percentage}%</T>
          <T v="small">
            {r.score} of {r.markable} correct
          </T>
        </Card>
        <Card style={{ flex: 1 }}>
          <T v="hero">{Math.round(r.totalTimeMs / 60000)}m</T>
          <T v="small">{avgSec}s per question on average</T>
        </Card>
      </Row>
      {r.essaysPendingReview ? <T v="muted">{r.essaysPendingReview} essay answers are not auto marked. Compare them with the marking guide.</T> : null}
      <Card>
        <T v="heading">By topic</T>
        <Bars data={r.topics.map((t) => ({ label: t.topicName, value: Math.round(t.percentage) }))} />
      </Card>
      <Card>
        <T v="heading">Study next</T>
        {r.recommendedTopics.length ? r.recommendedTopics.map((t) => <T key={t.topicId}>• {t.topicName} ({Math.round(t.percentage)}%)</T>) : <T v="muted">Great work across all topics.</T>}
      </Card>
      <Card>
        <T v="heading">Time per question</T>
        {r.perQuestion.map((p, i) => (
          <T v="small" key={p.questionId}>
            Q{i + 1}: {Math.round(p.timeSpentMs / 1000)}s {p.correct === null ? '(essay)' : p.correct ? '✓' : '✗'}
          </T>
        ))}
      </Card>
      <Button label="Ask the AI tutor about my weak topics" kind="secondary" onPress={() => router.push('/tutor')} />
      <Button label="Done" onPress={() => router.dismissTo('/home')} />
    </Screen>
  );
}
