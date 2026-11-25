import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { getDb, newId } from '../lib/db';
import { syncNow } from '../lib/sync';
import { Flashcards } from '../components/flashcards';
import { Button, Card, Field, Row, Screen, T } from '../components/ui';

interface Card_ {
  client_id: string;
  deck_name: string;
  front: string;
  back: string;
}

/** Flashcards the learner writes. Saved on the phone and synced to the account. */
export default function MyCards() {
  const [cards, setCards] = useState<Card_[]>([]);
  const [deck, setDeck] = useState('My cards');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [studying, setStudying] = useState<string | null>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    setCards(await db.getAllAsync<Card_>('SELECT client_id, deck_name, front, back FROM custom_cards WHERE deleted = 0 ORDER BY deck_name, updated_at'));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    const db = await getDb();
    await db.runAsync('INSERT INTO custom_cards (client_id, deck_name, front, back, updated_at) VALUES (?, ?, ?, ?, ?)', newId(), deck.trim() || 'My cards', front.trim(), back.trim(), new Date().toISOString());
    setFront('');
    setBack('');
    await load();
    void syncNow();
  };

  const remove = async (id: string) => {
    const db = await getDb();
    await db.runAsync('UPDATE custom_cards SET deleted = 1, synced = 0, updated_at = ? WHERE client_id = ?', new Date().toISOString(), id);
    await load();
    void syncNow();
  };

  if (studying) return <Flashcards cards={cards.filter((c) => c.deck_name === studying)} />;
  const decks = [...new Set(cards.map((c) => c.deck_name))];

  return (
    <Screen>
      <Stack.Screen options={{ title: 'My flashcards' }} />
      <Card>
        <T v="heading">New card</T>
        <Field label="Set name" value={deck} onChangeText={setDeck} maxLength={80} />
        <Field label="Front (question or word)" value={front} onChangeText={setFront} maxLength={500} />
        <Field label="Back (answer or meaning)" value={back} onChangeText={setBack} maxLength={2000} multiline />
        <Button label="Add card" onPress={add} disabled={!front.trim() || !back.trim()} />
      </Card>
      {decks.map((d) => (
        <Card key={d}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="heading">{d}</T>
            <Button label="Study" kind="secondary" onPress={() => setStudying(d)} />
          </Row>
          {cards.filter((c) => c.deck_name === d).map((c) => (
            <Row key={c.client_id} style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <T style={{ flex: 1 }}>{c.front}</T>
              <Button label="Delete" kind="ghost" onPress={() => remove(c.client_id)} />
            </Row>
          ))}
        </Card>
      ))}
    </Screen>
  );
}
