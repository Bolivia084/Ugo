import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, onSignOut, setTokens } from './api';
import { CatalogPage } from './pages/catalog';
import { CommercePage } from './pages/commerce';
import { ContentPage } from './pages/content';
import { SystemPage } from './pages/system';
import { UsersPage } from './pages/users';
import './styles.css';

type Role = 'ADMIN' | 'CONTENT_STAFF' | 'SUPPORT' | 'TUTOR';
const PAGES: { id: string; label: string; roles: Role[] }[] = [
  { id: 'content', label: 'Content', roles: ['ADMIN', 'CONTENT_STAFF'] },
  { id: 'catalog', label: 'Exams and subjects', roles: ['ADMIN', 'CONTENT_STAFF'] },
  { id: 'commerce', label: 'Plans, prices and revenue', roles: ['ADMIN'] },
  { id: 'users', label: 'User support', roles: ['ADMIN', 'SUPPORT'] },
  { id: 'system', label: 'Usage, audit and settings', roles: ['ADMIN'] },
];

function App() {
  const [me, setMe] = useState<{ displayName: string; role: Role } | null>(null);
  const [page, setPage] = useState('content');
  onSignOut(() => setMe(null));
  if (!me) return <Login onDone={setMe} />;
  const pages = PAGES.filter((p) => p.roles.includes(me.role));
  const current = pages.find((p) => p.id === page) ? page : pages[0]?.id;
  return (
    <div className="layout">
      <nav aria-label="Sections">
        <h1>Ugo Admin</h1>
        {pages.map((p) => (
          <button key={p.id} className={p.id === current ? 'active' : ''} onClick={() => setPage(p.id)}>
            {p.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <small>
          {me.displayName} · {me.role}
        </small>
        <button
          onClick={async () => {
            await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
            setTokens(null, null);
            setMe(null);
          }}
        >
          Sign out
        </button>
      </nav>
      <main>
        {current === 'content' && <ContentPage role={me.role} />}
        {current === 'catalog' && <CatalogPage role={me.role} />}
        {current === 'commerce' && <CommercePage />}
        {current === 'users' && <UsersPage role={me.role} />}
        {current === 'system' && <SystemPage />}
      </main>
    </div>
  );
}

function Login({ onDone }: { onDone: (me: { displayName: string; role: Role }) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const finish = async (t: { accessToken: string; refreshToken: string }) => {
    setTokens(t.accessToken, t.refreshToken);
    const me = await api<{ displayName: string; role: Role | 'LEARNER' | 'PARENT' }>('/me');
    if (me.role === 'LEARNER' || me.role === 'PARENT') {
      setTokens(null, null);
      throw new Error('This account has no staff access.');
    }
    onDone(me as { displayName: string; role: Role });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (!challenge) {
        const r = await api<{ mfaRequired: boolean; challengeId?: string; accessToken?: string; refreshToken?: string }>('/auth/login', { auth: false, body: { email, password } });
        if (r.mfaRequired) setChallenge(r.challengeId!);
        else await finish(r as { accessToken: string; refreshToken: string });
      } else {
        await finish(await api('/auth/mfa/verify', { auth: false, body: { challengeId: challenge, code } }));
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <form className="card" style={{ width: 360 }} onSubmit={submit}>
        <h2 style={{ margin: 0 }}>Ugo Admin</h2>
        <p className="muted">Staff only. Multi factor sign in is required.</p>
        {!challenge ? (
          <>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </label>
          </>
        ) : (
          <label>
            6 digit code
            <input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" required />
          </label>
        )}
        {error ? <p className="error">{error}</p> : null}
        <button className="btn" type="submit">
          {challenge ? 'Verify' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
