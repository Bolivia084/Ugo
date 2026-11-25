import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ExamCode } from '@ugo/shared';
import { useCatalog } from '../lib/hooks';
import { syncPack } from '../lib/packs';
import { useSession } from '../lib/session';
import { useSettings } from '../lib/settings';
import { Banner, Button, Card, Loading, Pill, Row, Screen, T } from '../components/ui';

/** Learners pick their exams. Content suited to their age is listed first. */
export default function ChooseExams() {
  const router = useRouter();
  const { data } = useCatalog();
  const me = useSession((s) => s.me);
  const settings = useSettings();
  const [picked, setPicked] = useState<string[]>(settings.selectedExams);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!data) return <Loading />;

  const sorted = [...data].sort((a, b) => Number(a.minAge > (me?.age ?? 99)) - Number(b.minAge > (me?.age ?? 99)));
  const toggle = (code: string) => setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]));

  const save = async () => {
    setBusy(true);
    setError(null);
    settings.set({ selectedExams: picked });
    try {
      // First download happens now, on any connection, because the learner asked for it.
      for (const code of picked) await syncPack(code as ExamCode, { background: false, wifiOnly: false });
      router.back();
    } catch (e) {
      setError(`${(e as Error).message} Your choice is saved; content will download when you are online.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <T v="title">Which exams are you preparing for?</T>
      <T v="muted">Pick one or more. You can change this at any time.</T>
      {error ? <Banner tone="warn" text={error} /> : null}
      {sorted.map((e) => {
        const on = picked.includes(e.code);
        return (
          <Card key={e.code} onPress={() => toggle(e.code)} accessibilityLabel={`${e.name}. ${on ? 'Selected' : 'Not selected'}`} style={on ? { borderWidth: 2 } : undefined}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="heading">{e.name}</T>
              {on ? <Pill label="Selected" /> : null}
            </Row>
            <T v="muted">{e.description}</T>
          </Card>
        );
      })}
      <Button label="Save and download" onPress={save} loading={busy} disabled={!picked.length} />
    </Screen>
  );
}
