import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError } from '../lib/api';
import { font, radius, spacing, useTheme } from '../theme/theme';
import { Banner, Button, T } from '../components/ui';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * The AI tutor. Messages go to the Ugo server, which calls the AI provider; no key is in the app.
 * Conversations are not stored on the server; parents see only how many messages were sent.
 */
export default function Tutor() {
  const t = useTheme();
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [error, setError] = useState<{ text: string; code?: string } | null>(null);
  const list = useRef<FlatList<Turn>>(null);

  useEffect(() => {
    void api<{ used: number; limit: number }>('/tutor/usage').then(setUsage).catch(() => undefined);
  }, []);

  const send = async () => {
    const content = text.trim();
    if (!content) return;
    const next = [...turns, { role: 'user' as const, content }];
    setTurns(next);
    setText('');
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ reply: string; used: number; limit: number }>('/tutor/messages', { body: { messages: next.slice(-20) }, timeoutMs: 90_000 });
      setTurns([...next, { role: 'assistant', content: res.reply }]);
      setUsage({ used: res.used, limit: res.limit });
    } catch (e) {
      setTurns(turns);
      setText(content);
      setError({ text: (e as Error).message, code: e instanceof ApiError ? e.code : undefined });
    } finally {
      setBusy(false);
      setTimeout(() => list.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  if (usage?.limit === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background, padding: spacing.md, gap: spacing.md }}>
        <Stack.Screen options={{ title: 'AI tutor' }} />
        <T v="title">Your AI study helper</T>
        <T v="muted">The AI tutor explains answers step by step and suggests what to study next. It comes with any Ugo plan.</T>
        <Button label="See plans" onPress={() => router.push('/plans')} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Stack.Screen options={{ title: usage ? `AI tutor (${usage.limit - usage.used} left today)` : 'AI tutor' }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <FlatList
          ref={list}
          data={turns}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
          ListHeaderComponent={<T v="muted">Ask about any question or topic. Please do not share personal details such as your phone number or school.</T>}
          renderItem={({ item }) => (
            <View accessibilityLabel={`${item.role === 'user' ? 'You' : 'Tutor'}: ${item.content}`} style={{ alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', backgroundColor: item.role === 'user' ? t.colors.primary : t.colors.surface, padding: spacing.md, borderRadius: radius.md }}>
              <Text style={{ color: item.role === 'user' ? t.colors.primaryText : t.colors.text, fontSize: font.body, lineHeight: 23 }}>{item.content}</Text>
            </View>
          )}
        />
        {error ? <View style={{ paddingHorizontal: spacing.md }}><Banner tone="error" text={error.text} /></View> : null}
        <View style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: t.colors.border }}>
          <TextInput
            accessibilityLabel="Message to the tutor"
            value={text}
            onChangeText={setText}
            placeholder="Ask a question"
            placeholderTextColor={t.colors.textMuted}
            multiline
            maxLength={4000}
            style={{ flex: 1, minHeight: 48, maxHeight: 140, borderWidth: 1, borderColor: t.colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, color: t.colors.text, fontSize: font.body }}
          />
          <Button label="Send" onPress={send} loading={busy} disabled={!text.trim()} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
