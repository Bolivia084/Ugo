import { useState } from 'react';
import { api } from '../api';
import { Err, useAction, useLoad } from '../util';

interface Usage {
  activeLearners: number;
  byExam: { examCode: string; mode: string; attempts: number; averagePercentage: number }[];
  daily: { day: string; learners: number; attempts: number }[];
}
interface Audit {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  createdAt: string;
  metadata: unknown;
}

export function SystemPage() {
  const usage = useLoad(() => api<Usage>('/admin/reports/usage'));
  const audit = useLoad(() => api<Audit[]>('/admin/audit-log'));
  const settings = useLoad(() => api<Record<string, unknown>>('/admin/settings'));
  const act = useAction();
  const [edits, setEdits] = useState<Record<string, string>>({});

  return (
    <>
      <h2>Usage, audit and settings</h2>
      <div className="card">
        <h3>Learner activity (last 30 days)</h3>
        <Err error={usage.error} />
        <p>Active learners: <strong>{usage.data?.activeLearners ?? '…'}</strong></p>
        <table>
          <thead><tr><th>Exam</th><th>Mode</th><th>Attempts</th><th>Average score</th></tr></thead>
          <tbody>{usage.data?.byExam.map((r) => <tr key={r.examCode + r.mode}><td>{r.examCode}</td><td>{r.mode}</td><td>{r.attempts}</td><td>{r.averagePercentage}%</td></tr>)}</tbody>
        </table>
      </div>

      <div className="card">
        <h3>Settings</h3>
        <p className="muted">Raise the minimum supported version to force users on an unsafe old version to update.</p>
        {act.view}
        <table>
          <tbody>
            {settings.data &&
              Object.entries(settings.data).map(([k, v]) => (
                <tr key={k}>
                  <td><code>{k}</code></td>
                  <td><input value={edits[k] ?? JSON.stringify(v)} onChange={(e) => setEdits({ ...edits, [k]: e.target.value })} /></td>
                  <td>
                    <button className="btn secondary" disabled={edits[k] === undefined} onClick={() => act.run(() => api(`/admin/settings/${k}`, { method: 'PUT', body: { value: JSON.parse(edits[k]) } }), `${k} saved`).then(() => settings.reload())}>
                      Save
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Audit log</h3>
        <table>
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>IP</th></tr></thead>
          <tbody>
            {audit.data?.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.createdAt).toLocaleString()}</td><td><code>{a.actorId?.slice(0, 8) ?? 'system'}</code></td><td>{a.action}</td><td>{a.targetType} {a.targetId?.slice(0, 12)}</td><td>{a.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
