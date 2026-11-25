import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Button, Card, Screen, T } from '../../components/ui';
import { useTheme } from '../../theme/theme';

export default function Welcome() {
  const router = useRouter();
  const t = useTheme();
  return (
    <Screen>
      <View style={{ backgroundColor: t.colors.primary, borderRadius: 24, padding: 24, gap: 8 }}>
        <T v="hero" color="#FFFFFF">Ugo</T>
        <T color="#FFFFFF">Practise past questions, take timed mock exams and see your progress. FSLC, Common Entrance, BECE, WAEC, NECO, JAMB, SAT and IELTS.</T>
      </View>
      <Card>
        <T v="heading">I am a learner</T>
        <T v="muted">Under 18? You will need a parent or guardian to approve your account.</T>
        <Button label="Create a learner account" onPress={() => router.push({ pathname: '/sign-up', params: { role: 'LEARNER' } })} />
      </Card>
      <Card>
        <T v="heading">I am a parent or guardian</T>
        <T v="muted">Set up profiles for your children, pay for plans and follow their progress.</T>
        <Button label="Create a parent account" kind="secondary" onPress={() => router.push({ pathname: '/sign-up', params: { role: 'PARENT' } })} />
      </Card>
      <Button label="I already have an account" kind="ghost" onPress={() => router.push('/sign-in')} />
    </Screen>
  );
}
