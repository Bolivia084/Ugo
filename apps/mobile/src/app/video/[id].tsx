import { File, Paths } from 'expo-file-system';
import * as Network from 'expo-network';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { item } from '../../lib/content';
import { getDb } from '../../lib/db';
import { isCompromisedDevice } from '../../lib/security';
import { useSettings } from '../../lib/settings';
import { Banner, Button, Loading, Screen, T } from '../../components/ui';

interface Access {
  streamUrl: string;
  cookies: Record<string, string> | null;
  downloadUrl: string | null;
}

/**
 * Streams a lesson over HLS with signed, expiring access. Downloads are kept in the app's
 * private storage only; data saver blocks downloads on mobile data.
 */
export default function Video() {
  usePreventScreenCapture();
  const { id } = useLocalSearchParams<{ id: string }>();
  const dataSaver = useSettings((s) => s.dataSaver);
  const [title, setTitle] = useState('');
  const [access, setAccess] = useState<Access | null>(null);
  const [localPath, setLocalPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const row = await item(id);
      setTitle(row?.title ?? 'Lesson');
      const db = await getDb();
      const dl = await db.getFirstAsync<{ path: string }>('SELECT path FROM downloads WHERE item_id = ?', id);
      if (dl && new File(dl.path).exists) {
        setLocalPath(dl.path);
        return;
      }
      try {
        setAccess(await api<Access>(`/content/videos/${id}/access`));
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [id]);

  const source = localPath
    ? { uri: localPath }
    : access
      ? { uri: access.streamUrl, headers: access.cookies ? { Cookie: Object.entries(access.cookies).map(([k, v]) => `${k}=${v}`).join('; ') } : undefined }
      : null;
  const player = useVideoPlayer(source, (p) => {
    p.play();
  });

  const download = async () => {
    setError(null);
    if (isCompromisedDevice()) return setError('Downloads are turned off on rooted or jailbroken phones. You can still stream lessons.');
    const net = await Network.getNetworkStateAsync();
    if (dataSaver && net.type !== Network.NetworkStateType.WIFI) return setError('Data saver is on: connect to Wi-Fi to download, or turn data saver off in Me > Settings.');
    if (!access?.downloadUrl) return setError('This lesson cannot be downloaded.');
    setBusy(true);
    try {
      const target = new File(Paths.document, `lessons/${id}.mp4`);
      target.parentDirectory.create({ intermediates: true, idempotent: true });
      const file = await File.downloadFileAsync(access.downloadUrl, target, { idempotent: true });
      const db = await getDb();
      await db.runAsync('INSERT OR REPLACE INTO downloads (item_id, path, bytes, downloaded_at) VALUES (?, ?, ?, ?)', id, file.uri, file.size ?? 0, new Date().toISOString());
      setLocalPath(file.uri);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      {error ? <Banner tone="error" text={error} /> : null}
      {source ? <VideoView player={player} style={{ width: '100%', aspectRatio: 16 / 9 }} allowsPictureInPicture={false} nativeControls /> : !error ? <Loading /> : null}
      <T v="heading">{title}</T>
      {localPath ? <T v="small">Downloaded. Plays without internet, only inside Ugo.</T> : access?.downloadUrl ? <Button label="Download for offline" kind="secondary" onPress={download} loading={busy} /> : null}
    </Screen>
  );
}
