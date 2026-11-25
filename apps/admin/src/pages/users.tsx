import { useState } from 'react';
import { api } from '../api';
import { Err, useAction, useLoad } from '../util';

interface UserRow {
  id: string;
  email: string;
  role: string;
  status: string;
  displayName: string;
  createdAt: string;
  mfaMethod: string;
}
interface UserDetail extends UserRow {
  fullName: string;
  entitlements: { id: string; examCode: string; source: string; status: string; expiresAt: string; autoRenew: boolean }[];
  childLinks: { childId: string; status: string; consentMethod: string | null }[];
  parentLinks: { parentId: string; status: string; consentMethod: string | null }[];
}

/** Support tools. There is no card data anywhere in Ugo, so none can be shown. */
export function UsersPage({ role }: { role: string }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const act = useAction();

  return (
    <>
      <h2>User support</h2>
      <div className="card">
        <div className="row">
          <label style={{ flex: 1 }}>Search by email<input value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <button className="btn" onClick={() => act.run(async () => setResults(await api<UserRow[]>(`/admin/users?email=${encodeURIComponent(q)}`)), 'Search done')}>Search</button>
        </div>
        {act.view}
        <table>
          <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Joined</th></tr></thead>
          <tbody>
            {results.map((u) => (
              <tr key={u.id} onClick={() => setSelected(u.id)} style={{ cursor: 'pointer' }}>
                <td>{u.email}</td><td>{u.role}</td><td>{u.status}</td><td>{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected ? <Detail id={selected} admin={role === 'ADMIN'} /> : null}
      {role === 'ADMIN' ? <NewStaff /> : null}
    </>
  );
}

function Detail({ id, admin }: { id: string; admin: boolean }) {
  const u = useLoad(() => api<UserDetail>(`/admin/users/${id}`), [id]);
  const act = useAction();
  if (!u.data) return <Err error={u.error} />;
  const d = u.data;
  return (
    <div className="card">
      <h3>{d.displayName} <span className="pill">{d.role}</span> <span className="pill">{d.status}</span></h3>
      <p className="muted">{d.email} · MFA: {d.mfaMethod}</p>
      <h4>Plans</h4>
      <table>
        <thead><tr><th>Exam</th><th>Source</th><th>Status</th><th>Expires</th><th>Auto renew</th><th></th></tr></thead>
        <tbody>
          {d.entitlements.map((e) => (
            <tr key={e.id}>
              <td>{e.examCode}</td><td>{e.source}</td><td>{e.status}</td><td>{new Date(e.expiresAt).toLocaleDateString()}</td><td>{e.autoRenew ? 'Yes' : 'No'}</td>
              <td>{admin && e.status !== 'REVOKED' ? <button className="btn danger" onClick={() => { const reason = prompt('Reason for ending this plan (refund reference or ticket number)'); if (reason) void act.run(() => api(`/admin/entitlements/${e.id}/revoke`, { body: { reason } }), 'Plan ended').then(() => u.reload()); }}>End plan</button> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {d.parentLinks.length ? <p>Linked parents: {d.parentLinks.map((l) => `${l.status} (${l.consentMethod ?? 'n/a'})`).join(', ')}</p> : null}
      {d.childLinks.length ? <p>Linked children: {d.childLinks.length}</p> : null}
      <div className="row">
        <button className="btn secondary" onClick={() => confirm('Reset MFA to email codes and sign this user out everywhere?') && act.run(() => api(`/admin/users/${id}/reset-mfa`, { method: 'POST' }), 'MFA reset')}>Reset MFA</button>
        {admin && d.status !== 'SUSPENDED' ? <button className="btn danger" onClick={() => confirm('Suspend this account?') && act.run(() => api(`/admin/users/${id}/suspend`, { method: 'POST' }), 'Suspended').then(() => u.reload())}>Suspend</button> : null}
        {admin && d.status === 'SUSPENDED' ? <button className="btn" onClick={() => act.run(() => api(`/admin/users/${id}/unsuspend`, { method: 'POST' }), 'Restored').then(() => u.reload())}>Unsuspend</button> : null}
      </div>
      {act.view}
    </div>
  );
}

function NewStaff() {
  const act = useAction();
  const [f, setF] = useState({ email: '', fullName: '', role: 'CONTENT_STAFF', temporaryPassword: '' });
  return (
    <div className="card">
      <h3>Add a staff account</h3>
      <p className="muted">Staff accounts always use multi factor sign in. Share the temporary password through a separate channel and ask them to reset it.</p>
      <div className="row">
        <label>Email<input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>Full name<input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></label>
        <label>Role<select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{['CONTENT_STAFF', 'SUPPORT', 'TUTOR', 'ADMIN'].map((r) => <option key={r}>{r}</option>)}</select></label>
        <label>Temporary password<input value={f.temporaryPassword} onChange={(e) => setF({ ...f, temporaryPassword: e.target.value })} /></label>
        <button className="btn" onClick={() => act.run(() => api('/admin/staff', { body: f }), 'Staff account created')}>Create</button>
      </div>
      {act.view}
    </div>
  );
}
