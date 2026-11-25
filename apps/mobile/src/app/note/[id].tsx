import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { item, type ItemRow } from '../../lib/content';
import { useSettings } from '../../lib/settings';
import { imageSrc } from '../../components/question';
import { Markdown } from '../../components/markdown';
import { Card, Loading, Screen, T } from '../../components/ui';

interface NotePayload {
  markdown: string;
  keyPoints: string[];
  workedExamples: { problem: string; solution: string }[];
  diagrams: { url: string; caption: string }[];
}

export default function Note() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const dataSaver = useSettings((s) => s.dataSaver);
  const [row, setRow] = useState<ItemRow | null>(null);
  useEffect(() => {
    void item(id).then(setRow);
  }, [id]);
  if (!row) return <Loading />;
  const p = JSON.parse(row.payload) as NotePayload;
  return (
    <Screen>
      <Stack.Screen options={{ title: row.topic_name ?? 'Notes' }} />
      <T v="title">{row.title}</T>
      <Markdown text={p.markdown} />
      {p.keyPoints.length ? (
        <Card>
          <T v="heading">Key points</T>
          {p.keyPoints.map((k) => <T key={k}>• {k}</T>)}
        </Card>
      ) : null}
      {p.workedExamples.map((w, i) => (
        <Card key={i}>
          <T v="heading">Worked example {i + 1}</T>
          <T>{w.problem}</T>
          <Markdown text={w.solution} />
        </Card>
      ))}
      {p.diagrams.map((d) => (
        <Card key={d.url}>
          <Image source={{ uri: imageSrc(d.url, dataSaver) }} style={{ width: '100%', aspectRatio: 4 / 3 }} contentFit="contain" accessibilityLabel={d.caption || 'Diagram'} />
          {d.caption ? <T v="small">{d.caption}</T> : null}
        </Card>
      ))}
    </Screen>
  );
}
