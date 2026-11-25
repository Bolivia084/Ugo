import { Image } from 'expo-image';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { Question } from '@ugo/shared';
import { useSettings } from '../lib/settings';
import { font, radius, spacing, useTheme } from '../theme/theme';
import { T } from './ui';

type Q = Question & { options?: { key: string; text: string; imageUrl?: string }[]; imageUrl?: string };

/** With data saver on, ask the CDN for a smaller image (CloudFront image resizing, see docs/DEPLOYMENT.md). */
export function imageSrc(url: string, dataSaver: boolean): string {
  if (!dataSaver) return url;
  return `${url}${url.includes('?') ? '&' : '?'}w=480&q=60`;
}

export function QuestionView({ question, chosen, onChoose, revealed }: { question: Q; chosen: string | null; onChoose?: (v: string) => void; revealed: boolean }) {
  const t = useTheme();
  const dataSaver = useSettings((s) => s.dataSaver);
  return (
    <View style={{ gap: spacing.md }}>
      <T v="heading">{question.body}</T>
      {question.imageUrl ? <Image source={{ uri: imageSrc(question.imageUrl, dataSaver) }} style={{ width: '100%', aspectRatio: 16 / 9 }} contentFit="contain" accessibilityLabel="Question diagram" /> : null}
      {question.type === 'MULTIPLE_CHOICE' ? (
        <View accessibilityRole="radiogroup" style={{ gap: spacing.sm }}>
          {question.options?.map((o) => {
            const selected = chosen === o.key;
            const isAnswer = revealed && o.key === question.answer;
            const wrong = revealed && selected && !isAnswer;
            const border = isAnswer ? t.colors.success : wrong ? t.colors.danger : selected ? t.colors.primary : t.colors.border;
            return (
              <Pressable
                key={o.key}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: !onChoose }}
                accessibilityLabel={`Option ${o.key}: ${o.text}${isAnswer ? ', correct answer' : wrong ? ', your answer, wrong' : ''}`}
                onPress={() => onChoose?.(o.key)}
                style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', minHeight: 52, padding: spacing.md, borderRadius: radius.md, borderWidth: 2, borderColor: border, backgroundColor: selected ? t.colors.tint : t.colors.card }}
              >
                <Text style={{ fontWeight: '800', color: t.colors.primary, fontSize: font.body }}>{o.key}</Text>
                <Text style={{ flex: 1, color: t.colors.text, fontSize: font.body }}>{o.text}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <TextInput
          accessibilityLabel="Your answer"
          editable={Boolean(onChoose)}
          value={chosen ?? ''}
          onChangeText={(v) => onChoose?.(v)}
          multiline={question.type === 'ESSAY'}
          placeholder={question.type === 'ESSAY' ? 'Write your answer' : 'Type your answer'}
          placeholderTextColor={t.colors.textMuted}
          style={{ minHeight: question.type === 'ESSAY' ? 180 : 50, borderWidth: 1, borderColor: t.colors.border, borderRadius: radius.md, padding: spacing.md, color: t.colors.text, fontSize: font.body, textAlignVertical: 'top' }}
        />
      )}
    </View>
  );
}
