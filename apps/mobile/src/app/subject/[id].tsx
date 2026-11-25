import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { itemsFor, type ItemRow } from '../../lib/content';
import { Button, Card, Row, Screen, T } from '../../components/ui';

export default function SubjectScreen() {
  const { id, code, name } = useLocalSearchParams<{ id: string; code: string; name: string }>();
  const router = useRouter();
  const [items, setItems] = useState<ItemRow[]>([]);
  useEffect(() => {
    void itemsFor(id).then(setItems);
  }, [id]);

  const by = (k: ItemRow['kind']) => items.filter((i) => i.kind === k);
  const topics = [...new Map(by('QUESTION').filter((q) => q.topic_id).map((q) => [q.topic_id!, q.topic_name ?? ''])).entries()];

  return (
    <Screen>
      <Stack.Screen options={{ title: name }} />
      <Card>
        <T v="heading">Practice questions</T>
        <T v="muted">{by('QUESTION').length} questions with worked answers</T>
        <Button label="Practise all topics" onPress={() => router.push({ pathname: '/quiz/[subjectId]', params: { subjectId: id, code } })} disabled={!by('QUESTION').length} />
        <Row>
          {topics.map(([tid, tname]) => (
            <Button key={tid} label={tname} kind="ghost" onPress={() => router.push({ pathname: '/quiz/[subjectId]', params: { subjectId: id, code, topicId: tid } })} />
          ))}
        </Row>
      </Card>
      {by('NOTE').length ? <T v="heading">Study notes</T> : null}
      {by('NOTE').map((n) => (
        <Card key={n.id} onPress={() => router.push({ pathname: '/note/[id]', params: { id: n.id } })} accessibilityLabel={`Note: ${n.title}`}>
          <T>{n.title}</T>
          {n.topic_name ? <T v="small">{n.topic_name}</T> : null}
        </Card>
      ))}
      {by('FLASHCARD_DECK').length ? <T v="heading">Flashcards</T> : null}
      {by('FLASHCARD_DECK').map((d) => (
        <Card key={d.id} onPress={() => router.push({ pathname: '/deck/[id]', params: { id: d.id } })} accessibilityLabel={`Flashcards: ${d.title}`}>
          <T>{d.title}</T>
        </Card>
      ))}
      <Button label="My own flashcards" kind="ghost" onPress={() => router.push('/my-cards')} />
      {by('VIDEO').length ? <T v="heading">Video lessons</T> : null}
      {by('VIDEO').map((v) => (
        <Card key={v.id} onPress={() => router.push({ pathname: '/video/[id]', params: { id: v.id } })} accessibilityLabel={`Video: ${v.title}`}>
          <T>{v.title}</T>
        </Card>
      ))}
    </Screen>
  );
}
