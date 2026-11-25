import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { font, radius, spacing, useTheme } from '../theme/theme';
import { Button, Row, Screen, T } from './ui';

/** Tap the card to flip it. Cards marked "again" come back at the end of the round. */
export function Flashcards({ cards }: { cards: { front: string; back: string }[] }) {
  const t = useTheme();
  const [queue, setQueue] = useState(cards.map((_, i) => i));
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  if (!queue.length) {
    return (
      <Screen>
        <T v="title">Round complete</T>
        <T v="muted">You knew {known} of {cards.length} cards.</T>
        <Button label="Study again" onPress={() => { setQueue(cards.map((_, i) => i)); setKnown(0); }} />
      </Screen>
    );
  }
  const card = cards[queue[0]];
  const answer = (gotIt: boolean) => {
    setFlipped(false);
    if (gotIt) setKnown((k) => k + 1);
    setQueue((q) => (gotIt ? q.slice(1) : [...q.slice(1), q[0]]));
  };
  return (
    <Screen>
      <T v="small">{queue.length} cards left</T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={flipped ? `Answer: ${card.back}. Tap to see the question.` : `${card.front}. Tap to see the answer.`}
        onPress={() => setFlipped((f) => !f)}
        style={{ minHeight: 260, borderRadius: radius.lg, padding: spacing.lg, justifyContent: 'center', backgroundColor: flipped ? t.colors.tint : t.colors.primary }}
      >
        <Text style={{ textAlign: 'center', fontSize: font.title, fontWeight: '700', color: flipped ? t.colors.text : t.colors.primaryText }}>{flipped ? card.back : card.front}</Text>
      </Pressable>
      {flipped ? (
        <Row>
          <Button label="Again" kind="ghost" onPress={() => answer(false)} style={{ flex: 1 }} />
          <Button label="Got it" onPress={() => answer(true)} style={{ flex: 1 }} />
        </Row>
      ) : (
        <Button label="Show answer" kind="secondary" onPress={() => setFlipped(true)} />
      )}
    </Screen>
  );
}
