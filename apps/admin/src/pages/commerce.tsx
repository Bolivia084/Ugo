import { useState } from 'react';
import { api, EXAMS, naira } from '../api';
import { Err, useAction, useLoad } from '../util';

interface Report {
  active: { examCode: string; source: string; count: number }[];
  newPlans: { examCode: string; source: string; count: number; webRevenueKobo: number }[];
  byStatus: { status: string; count: number }[];
  note: string;
}
interface Promo {
  id: string;
  code: string;
  examCode: string | null;
  percentOff: number;
  grantsPlan: boolean;
  maxRedemptions: number;
  redeemed: number;
  expiresAt: string;
}
interface PaymentEvent {
  id: string;
  source: string;
  type: string;
  receivedAt: string;
  processedAt: string | null;
  error: string | null;
}

export function CommercePage() {
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const report = useLoad(() => api<Report>(`/admin/reports/subscriptions?from=${from}&to=${to}`), [from, to]);
  const promos = useLoad(() => api<Promo[]>('/admin/promo-codes'));
  const events = useLoad(() => api<PaymentEvent[]>('/admin/payment-events?failed=true'));
  const act = useAction();
  const [p, setP] = useState({ code: '', examCode: '', percentOff: '0', grantsPlan: false, maxRedemptions: '100', expiresAt: '' });

  return (
    <>
      <h2>Plans, prices and revenue</h2>
      <div className="card">
        <div className="row">
          <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <Err error={report.error} />
        <h3>Active plans</h3>
        <table>
          <thead><tr><th>Exam</th><th>Source</th><th>Active</th></tr></thead>
          <tbody>{report.data?.active.map((r) => <tr key={r.examCode + r.source}><td>{r.examCode}</td><td>{r.source}</td><td>{r.count}</td></tr>)}</tbody>
        </table>
        <h3>New plans in this period</h3>
        <table>
          <thead><tr><th>Exam</th><th>Source</th><th>Count</th><th>Web revenue</th></tr></thead>
          <tbody>{report.data?.newPlans.map((r) => <tr key={r.examCode + r.source}><td>{r.examCode}</td><td>{r.source}</td><td>{r.count}</td><td>{r.source === 'PAYSTACK' || r.source === 'FLUTTERWAVE' ? naira(r.webRevenueKobo) : 'see store report'}</td></tr>)}</tbody>
        </table>
        <p className="muted">{report.data?.note}</p>
      </div>

      <div className="card">
        <h3>Promo codes</h3>
        <div className="row">
          <label>Code<input value={p.code} onChange={(e) => setP({ ...p, code: e.target.value.toUpperCase() })} /></label>
          <label>Exam (blank for any)<select value={p.examCode} onChange={(e) => setP({ ...p, examCode: e.target.value })}><option value="">Any</option>{EXAMS.map((e) => <option key={e}>{e}</option>)}</select></label>
          <label>Percent off (web)<input value={p.percentOff} onChange={(e) => setP({ ...p, percentOff: e.target.value })} /></label>
          <label><span>Grants a full year</span><input type="checkbox" style={{ minWidth: 0 }} checked={p.grantsPlan} onChange={(e) => setP({ ...p, grantsPlan: e.target.checked })} /></label>
          <label>Max uses<input value={p.maxRedemptions} onChange={(e) => setP({ ...p, maxRedemptions: e.target.value })} /></label>
          <label>Expires<input type="date" value={p.expiresAt} onChange={(e) => setP({ ...p, expiresAt: e.target.value })} /></label>
          <button
            className="btn"
            disabled={!p.code || !p.expiresAt}
            onClick={() =>
              act.run(() => api('/admin/promo-codes', { body: { code: p.code, examCode: p.examCode || undefined, percentOff: Number(p.percentOff), grantsPlan: p.grantsPlan, maxRedemptions: Number(p.maxRedemptions), expiresAt: new Date(`${p.expiresAt}T23:59:59+01:00`).toISOString() } }), 'Code created').then(() => promos.reload())
            }
          >
            Create
          </button>
        </div>
        {act.view}
        <table>
          <thead><tr><th>Code</th><th>Exam</th><th>Gives</th><th>Used</th><th>Expires</th><th></th></tr></thead>
          <tbody>
            {promos.data?.map((c) => (
              <tr key={c.id}>
                <td><code>{c.code}</code></td><td>{c.examCode ?? 'Any'}</td><td>{c.grantsPlan ? 'Full year' : `${c.percentOff}% off`}</td><td>{c.redeemed} / {c.maxRedemptions}</td><td>{new Date(c.expiresAt).toLocaleDateString()}</td>
                <td>{new Date(c.expiresAt) > new Date() ? <button className="btn secondary" onClick={() => act.run(() => api(`/admin/promo-codes/${c.id}`, { method: 'DELETE' }), 'Code ended').then(() => promos.reload())}>End now</button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Payment events needing attention</h3>
        <p className="muted">Store notifications and webhooks that failed or are still unprocessed. See docs/PAYMENTS_RUNBOOK.md.</p>
        <table>
          <thead><tr><th>Received</th><th>Source</th><th>Type</th><th>Problem</th></tr></thead>
          <tbody>{events.data?.map((e) => <tr key={e.id}><td>{new Date(e.receivedAt).toLocaleString()}</td><td>{e.source}</td><td>{e.type}</td><td>{e.error ?? (e.processedAt ? '' : 'Not processed')}</td></tr>)}</tbody>
        </table>
        {events.data?.length === 0 ? <p className="ok">Nothing waiting.</p> : null}
      </div>
    </>
  );
}
