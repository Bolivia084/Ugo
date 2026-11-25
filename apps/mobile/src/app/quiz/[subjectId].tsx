import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { scoreAttempt, isCorrect, type AnswerRecord, type ExamCode } from '@ugo/shared';
import { itemsFor, toQuestion } from '../../lib/content';
import { newId } from '../../lib/db';
import { saveAttempt } from '../../lib/sync';
import { QuestionView } from '../../components/question';
import { Banner, Button, Loading, Row, Screen, T } from '../../components/ui';

/** Practice mode: one question at a time with instant feedback and the worked explanation. */
export default function Quiz() {
  const { subjectId, code, topicId } = useLocalSearchParams<{ subjectId: string; code: ExamCode; topicId?: string }>();
  const router = useRouter();
  const [questions, setQuestions] = useState<ReturnType<typeof toQuestion>[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const started = useRef(new Date().toISOString());
  const shownAt = useRef(Date.now());

  useEffect(() => {
    void itemsFor(subjectId, 'QUESTION', topicId).then((rows) => setQuestions(rows.map(toQuestion).sort(() => Math.random() - 0.5).slice(0, 20)));
  }, [subjectId, topicId]);

  if (!questions) return <Loading />;
  if (!questions.length) return <Screen><Banner text="No questions downloaded for this subject yet." /></Screen>;
  const q = questions[index];

  const check = () => {
    setAnswers((a) => [...a, { questionId: q.id, chosen, timeSpentMs: Date.now() - shownAt.current }]);
    setRevealed(true);
  };

  const next = async () => {
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      setChosen(null);
      setRevealed(false);
      shownAt.current = Date.now();
      return;
    }
    const clientId = newId();
    const result = scoreAttempt(questions, answers);
    await saveAttempt({ clientId, examCode: code, subjectId, mode: 'PRACTICE', startedAt: started.current, finishedAt: new Date().toISOString(), answers }, result);
    router.replace({ pathname: '/results/[clientId]', params: { clientId } });
  };

  const correct = revealed ? isCorrect(q, chosen) : null;
  return (
    <Screen>
      <T v="small">
        Question {index + 1} of {questions.length}
      </T>
      <QuestionView question={q} chosen={chosen} onChoose={revealed ? undefined : setChosen} revealed={revealed} />
      {revealed ? (
        <>
          <Banner tone={correct === null ? 'info' : correct ? 'success' : 'error'} text={correct === null ? 'Compare your answer with the marking guide.' : correct ? 'Correct!' : `Not quite. The answer is ${q.answer?.split('|')[0]}.`} />
          <T v="heading">Explanation</T>
          <T>{q.explanation}</T>
          {q.markingGuide ? <T v="muted">{q.markingGuide}</T> : null}
          <Button label={index + 1 < questions.length ? 'Next question' : 'See my results'} onPress={next} />
        </>
      ) : (
        <Row>
          <Button label="Check answer" onPress={check} disabled={q.type !== 'ESSAY' && !chosen} style={{ flex: 1 }} />
        </Row>
      )}
    </Screen>
  );
}
