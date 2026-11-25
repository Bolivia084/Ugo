import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { item } from '../../lib/content';
import { Flashcards } from '../../components/flashcards';
import { Loading } from '../../components/ui';

export default function Deck() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [deck, setDeck] = useState<{ title: string; cards: { front: string; back: string }[] } | null>(null);
  useEffect(() => {
    void item(id).then((r) => r && setDeck({ title: r.title, cards: (JSON.parse(r.payload) as { cards: { front: string; back: string }[] }).cards }));
  }, [id]);
  if (!deck) return <Loading />;
  return (
    <>
      <Stack.Screen options={{ title: deck.title }} />
      <Flashcards cards={deck.cards} />
    </>
  );
}
