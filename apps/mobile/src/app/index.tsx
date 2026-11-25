import { Redirect } from 'expo-router';
import { Loading } from '../components/ui';
import { useSession } from '../lib/session';

export default function Index() {
  const { ready, tokens, me } = useSession();
  if (!ready) return <Loading />;
  if (!tokens) return <Redirect href="/welcome" />;
  if (!me) return <Loading label="Opening your account" />;
  if (me.status === 'PENDING_CONSENT') return <Redirect href="/pending-consent" />;
  if (me.role === 'PARENT') return <Redirect href="/parent" />;
  return <Redirect href="/home" />;
}
