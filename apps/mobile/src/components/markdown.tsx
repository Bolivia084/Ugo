import { Text, View } from 'react-native';
import { font, spacing, useTheme } from '../theme/theme';

/**
 * Renders the small markdown subset used in Ugo notes: headings (##), bullet and numbered
 * lists, **bold**, *italic* and paragraphs. Kept tiny on purpose for low end phones.
 */
export function Markdown({ text }: { text: string }) {
  const t = useTheme();
  const blocks = text.split(/\n{2,}/);
  return (
    <View style={{ gap: spacing.sm }}>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        if (/^#{1,3} /.test(lines[0])) {
          const level = lines[0].match(/^#+/)![0].length;
          return (
            <View key={i} style={{ gap: spacing.xs }}>
              <Text accessibilityRole="header" style={{ color: t.colors.text, fontWeight: '800', fontSize: level === 1 ? font.title : font.large, marginTop: spacing.sm }}>
                {lines[0].replace(/^#+ /, '')}
              </Text>
              {lines.slice(1).length ? <Inline text={lines.slice(1).join('\n')} /> : null}
            </View>
          );
        }
        if (lines.every((l) => /^(\s*[-*] |\s*\d+\. )/.test(l))) {
          return (
            <View key={i} style={{ gap: 6 }}>
              {lines.map((l, j) => {
                const numbered = l.match(/^\s*(\d+)\. /);
                return (
                  <View key={j} style={{ flexDirection: 'row', gap: 8 }}>
                    <Text style={{ color: t.colors.text, fontSize: font.body }}>{numbered ? `${numbered[1]}.` : '•'}</Text>
                    <View style={{ flex: 1 }}>
                      <Inline text={l.replace(/^\s*([-*]|\d+\.) /, '')} />
                    </View>
                  </View>
                );
              })}
            </View>
          );
        }
        return <Inline key={i} text={block} />;
      })}
    </View>
  );
}

function Inline({ text }: { text: string }) {
  const t = useTheme();
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return (
    <Text style={{ color: t.colors.text, fontSize: font.body, lineHeight: 25 }}>
      {parts.map((p, i) =>
        p.startsWith('**') ? (
          <Text key={i} style={{ fontWeight: '800' }}>
            {p.slice(2, -2)}
          </Text>
        ) : p.startsWith('*') ? (
          <Text key={i} style={{ fontStyle: 'italic' }}>
            {p.slice(1, -1)}
          </Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}
