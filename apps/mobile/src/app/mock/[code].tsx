import { useLocalSearchParams, useNavigation, useRouter, usePreventRemove } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { FREE_SAMPLE_MOCK_MINUTES, FREE_SAMPLE_MOCK_QUESTIONS, scoreAttempt, type AnswerRecord, type ExamCode } from '@ugo/shared';
import { mockQuestions, toQuestion } from '../../lib/content';
import { newId } from '../../lib/db';
import { useEntitlements } from '../../lib/entitlements';
import { useCatalog } from '../../lib/hooks';
import { saveAttempt } from '../../lib/sync';
import { QuestionView } from '../../components/question';
import { Banner, Button, Card, Loading, Row, Screen, T } from '../../components/ui';

type Q = ReturnType<typeof toQuestion>;

/**
 * Timed mock exam. The clock follows the exam's official timing (set by staff in the admin
 * dashboard). Free users get one short sample mock. Time per question is recorded.
 */
export default function Mock() {
  const { code } = useLocalSearchParams<{ code: ExamCode }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { data: catalog } = useCatalog();
  const paid = useEntitlements((s) => s.has(code));
  const [questions, setQuestions] = useState<Q[] | null>(null);
  const [started, setStarted] = useState<Date | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [timeSpent, setTimeSpent] = useState<Record<string, number>>({});
  const [remaining, setRemaining] = useState(0);
  const [finished, setFinished] = useState(false);
  const shownAt = useRef(Date.now());
  const exam = catalog?.find((c) => c.code === code);
  const minutes = paid ? exam?.mockMinutes ?? 60 : FREE_SAMPLE_MOCK_MINUTES;
  const count = paid ? exam?.mockSections.reduce((s, x) => s + x.questionCount, 0) ?? 50 : FREE_SAMPLE_MOCK_QUESTIONS;

  usePreventRemove(Boolean(started) && !finished, ({ data }) => {
    Alert.alert('Leave the mock exam?', 'Your answers so far will be lost.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  const record = useCallback(() => {
    if (!questions) return;
    const id = questions[index].id;
    setTimeSpent((t) => ({ ...t, [id]: (t[id] ?? 0) + (Date.now() - shownAt.current) }));
    shownAt.current = Date.now();
  }, [questions, index]);

  const submit = useCallback(async () => {
    if (!questions || !started || finished) return;
    record();
    setFinished(true);
    const list: AnswerRecord[] = questions.map((q) => ({ questionId: q.id, chosen: answers[q.id] ?? null, timeSpentMs: timeSpent[q.id] ?? 0 }));
    const clientId = newId();
    await saveAttempt({ clientId, examCode: code, mode: paid ? 'MOCK' : 'SAMPLE_MOCK', startedAt: started.toISOString(), finishedAt: new Date().toISOString(), answers: list }, scoreAttempt(questions, list));
    router.replace({ pathname: '/results/[clientId]', params: { clientId } });
  }, [questions, started, finished, answers, timeSpent, code, paid, router, record]);

  // The clock runs on wall time, so leaving the app does not pause it (as in the real exam).
  useEffect(() => {
    if (!started || finished) return;
    const end = started.getTime() + minutes * 60_000;
    const tick = () => {
      const left = Math.max(0, Math.round((end - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) void submit();
    };
    tick();
    const timer = setInterval(tick, 1000);
    const sub = AppState.addEventListener('change', tick);
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [started, finished, minutes, submit]);

  if (!exam) return <Loading />;

  if (!started) {
    return (
      <Screen>
        <T v="title">{paid ? `${exam.name} mock exam` : `${exam.name} sample mock`}</T>
        <Card>
          <T>{minutes} minutes · up to {count} questions</T>
          {paid ? exam.mockSections.map((s) => <T v="small" key={s.name}>• {s.name}: {s.questionCount} questions{s.durationMinutes ? `, ${s.durationMinutes} min` : ''}</T>) : <T v="muted">The full mock is part of the {exam.name} plan.</T>}
        </Card>
        <Banner text="The timer keeps running if you leave the app, just like the real exam. When time is up your answers are submitted." />
        <Button
          label="Start"
          onPress={async () => {
            const rows = await mockQuestions(code, count);
            setQuestions(rows.map(toQuestion));
            shownAt.current = Date.now();
            setStarted(new Date());
          }}
        />
      </Screen>
    );
  }

  if (!questions) return <Loading />;
  if (!questions.length) return <Screen><Banner text="Download this exam's content first." /></Screen>;
  const q = questions[index];
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  const go = (i: number) => {
    record();
    setIndex(i);
  };

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="small">Question {index + 1} of {questions.length}</T>
        <T v="heading" color={remaining < 300 ? '#C62828' : undefined}>
          <T v="heading" style={{ fontVariant: ['tabular-nums'] }}>{`${mm}:${ss}`}</T>
        </T>
      </Row>
      <QuestionView question={q} chosen={answers[q.id] ?? null} onChoose={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} revealed={false} />
      <Row>
        <Button label="Previous" kind="ghost" disabled={index === 0} onPress={() => go(index - 1)} style={{ flex: 1 }} />
        {index + 1 < questions.length ? <Button label="Next" onPress={() => go(index + 1)} style={{ flex: 1 }} /> : <Button label="Submit" onPress={() => Alert.alert('Submit your answers?', `${Object.values(answers).filter(Boolean).length} of ${questions.length} answered.`, [{ text: 'Keep going', style: 'cancel' }, { text: 'Submit', onPress: () => void submit() }])} style={{ flex: 1 }} />}
      </Row>
    </Screen>
  );
}
