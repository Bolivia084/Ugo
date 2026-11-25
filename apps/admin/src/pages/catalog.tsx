import { useState } from 'react';
import { api, naira, type Exam } from '../api';
import { Err, useAction, useLoad } from '../util';

interface Category {
  code: Exam;
  name: string;
  isActive: boolean;
  priceKobo: number;
  pendingPriceKobo: number | null;
  pendingPriceFrom: string | null;
  mockMinutes: number;
  mockSections: { name: string; durationMinutes: number; questionCount: number }[];
  tutorDailyLimit: number;
  appleProductId: string | null;
  googleProductId: string | null;
  paystackPlanCode: string | null;
  flutterwavePlanId: string | null;
  subjects: { id: string; name: string; isActive: boolean; _count: { topics: number; content: number } }[];
}

/** Exams and subjects are data: staff add or hide subjects here without an app release. */
export function CatalogPage({ role }: { role: string }) {
  const cats = useLoad(() => api<Category[]>('/admin/categories'));
  const act = useAction();
  const [open, setOpen] = useState<Exam | null>(null);
  const admin = role === 'ADMIN';

  return (
    <>
      <h2>Exams and subjects</h2>
      <Err error={cats.error} />
      {act.view}
      {cats.data?.map((c) => (
        <div className="card" key={c.code}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>{c.name} {c.isActive ? null : <span className="pill">Hidden</span>}</h3>
            <button className="btn secondary" onClick={() => setOpen(open === c.code ? null : c.code)}>{open === c.code ? 'Close' : 'Manage'}</button>
          </div>
          <p className="muted">
            Web price {naira(c.priceKobo)} per year{c.pendingPriceKobo ? `, changing to ${naira(c.pendingPriceKobo)} from ${new Date(c.pendingPriceFrom!).toLocaleDateString()}` : ''} · mock {c.mockMinutes} min · tutor {c.tutorDailyLimit} messages a day · {c.subjects.filter((s) => s.isActive).length} subjects
          </p>
          {open === c.code ? (
            <>
              <table>
                <thead><tr><th>Subject</th><th>Topics</th><th>Items</th><th></th></tr></thead>
                <tbody>
                  {c.subjects.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td><td>{s._count.topics}</td><td>{s._count.content}</td>
                      <td className="row">
                        <button className="btn secondary" onClick={() => act.run(() => api(`/admin/subjects/${s.id}`, { method: 'PATCH', body: { isActive: !s.isActive } }), s.isActive ? 'Hidden' : 'Shown').then(() => cats.reload())}>{s.isActive ? 'Hide' : 'Show'}</button>
                        <button className="btn secondary" onClick={() => { const name = prompt('New topic name'); if (name) void act.run(() => api(`/admin/subjects/${s.id}/topics`, { body: { name } }), 'Topic added').then(() => cats.reload()); }}>Add topic</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div><button className="btn" onClick={() => { const name = prompt('New subject name'); if (name) void act.run(() => api(`/admin/categories/${c.code}/subjects`, { body: { name } }), 'Subject added').then(() => cats.reload()); }}>Add subject</button></div>
              {admin ? <Settings c={c} onSaved={() => cats.reload()} /> : null}
            </>
          ) : null}
        </div>
      ))}
    </>
  );
}

function Settings({ c, onSaved }: { c: Category; onSaved: () => void }) {
  const act = useAction();
  const [f, setF] = useState({
    mockMinutes: String(c.mockMinutes),
    tutorDailyLimit: String(c.tutorDailyLimit),
    appleProductId: c.appleProductId ?? '',
    googleProductId: c.googleProductId ?? '',
    paystackPlanCode: c.paystackPlanCode ?? '',
    flutterwavePlanId: c.flutterwavePlanId ?? '',
    sections: JSON.stringify(c.mockSections, null, 2),
    price: '',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const nn = (v: string) => (v.trim() ? v.trim() : null);
  return (
    <div className="card">
      <h4 style={{ margin: 0 }}>Plan and mock settings</h4>
      <div className="row">
        <label>Mock minutes<input value={f.mockMinutes} onChange={set('mockMinutes')} /></label>
        <label>Tutor messages a day<input value={f.tutorDailyLimit} onChange={set('tutorDailyLimit')} /></label>
        <label>App Store product id<input value={f.appleProductId} onChange={set('appleProductId')} /></label>
        <label>Google Play product id<input value={f.googleProductId} onChange={set('googleProductId')} /></label>
        <label>Paystack plan code<input value={f.paystackPlanCode} onChange={set('paystackPlanCode')} /></label>
        <label>Flutterwave plan id<input value={f.flutterwavePlanId} onChange={set('flutterwavePlanId')} /></label>
      </div>
      <label>Mock sections (official timings per paper)<textarea value={f.sections} onChange={set('sections')} style={{ minHeight: 140, fontFamily: 'monospace' }} /></label>
      <div>
        <button
          className="btn"
          onClick={() =>
            act.run(
              () =>
                api(`/admin/categories/${c.code}`, {
                  method: 'PATCH',
                  body: { mockMinutes: Number(f.mockMinutes), tutorDailyLimit: Number(f.tutorDailyLimit), appleProductId: nn(f.appleProductId), googleProductId: nn(f.googleProductId), paystackPlanCode: nn(f.paystackPlanCode), flutterwavePlanId: nn(f.flutterwavePlanId), mockSections: JSON.parse(f.sections) },
                }),
              'Settings saved',
            ).then(onSaved)
          }
        >
          Save settings
        </button>
      </div>
      <div className="row">
        <label>New annual price in naira<input value={f.price} onChange={set('price')} inputMode="numeric" /></label>
        <button className="btn secondary" disabled={!f.price} onClick={() => confirm('Schedule this price change? It applies to new web purchases and renewals after the notice period. Change store prices in App Store Connect and Play Console too.') && act.run(() => api(`/admin/categories/${c.code}/price`, { body: { priceKobo: Math.round(Number(f.price) * 100) } }), 'Price change scheduled').then(onSaved)}>
          Schedule price change
        </button>
      </div>
      {act.view}
    </div>
  );
}
