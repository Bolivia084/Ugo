import { useState } from 'react';
import { api, EXAMS, type Exam } from '../api';
import { Err, useAction, useLoad } from '../util';

interface Item {
  id: string;
  kind: string;
  title: string;
  status: string;
  isSample: boolean;
  source: string;
  year: number | null;
  createdById: string;
  scheduledFor: string | null;
  publishedInPack: number | null;
  subject: { name: string };
  topic: { name: string } | null;
  examCategory: { code: Exam };
}
interface Category {
  code: Exam;
  subjects: { id: string; name: string; _count: { topics: number } }[];
}
interface Pack {
  id: string;
  version: number;
  isSampleOnly: boolean;
  status: string;
  itemCount: number;
  sizeBytes: number;
  whatsNew: string;
  publishedAt: string;
}

const STATUSES = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'];

export function ContentPage({ role }: { role: string }) {
  const [exam, setExam] = useState<Exam>('WAEC');
  const [status, setStatus] = useState('IN_REVIEW');
  const items = useLoad(() => api<{ items: Item[] }>(`/admin/content/items?examCode=${exam}&status=${status}&limit=100`), [exam, status]);
  const packs = useLoad(() => api<Pack[]>(`/admin/content/packs/${exam}`), [exam]);
  const cats = useLoad(() => api<Category[]>('/admin/categories'));
  const act = useAction();
  const [whatsNew, setWhatsNew] = useState('');

  const action = (id: string, path: string, body?: unknown, ok = 'Done') => act.run(() => api(`/admin/content/items/${id}/${path}`, { body: body ?? {} }), ok).then(() => items.reload());

  return (
    <>
      <h2>Content</h2>
      <p className="muted">Every item goes draft, then review by a second subject expert, then approval, then release in a versioned pack. A bad pack can be rolled back.</p>
      <div className="card">
        <div className="row">
          <label>
            Exam
            <select value={exam} onChange={(e) => setExam(e.target.value as Exam)}>
              {EXAMS.map((e) => <option key={e}>{e}</option>)}
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        </div>
        {act.view}
        <Err error={items.error} />
        <table>
          <thead>
            <tr><th>Title</th><th>Kind</th><th>Subject / topic</th><th>Source</th><th>Sample</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {items.data?.items.map((i) => (
              <tr key={i.id}>
                <td>{i.title}{i.year ? ` (${i.year})` : ''}</td>
                <td><span className="pill">{i.kind}</span></td>
                <td>{i.subject.name}{i.topic ? ` / ${i.topic.name}` : ''}</td>
                <td>{i.source}</td>
                <td>{i.isSample ? 'Yes' : ''}</td>
                <td className="row">
                  {i.status === 'DRAFT' && <button className="btn secondary" onClick={() => action(i.id, 'submit', undefined, 'Sent for review')}>Submit for review</button>}
                  {i.status === 'IN_REVIEW' && (
                    <>
                      <button className="btn" onClick={() => action(i.id, 'review', { approved: true }, 'Approved')}>Approve</button>
                      <button className="btn secondary" onClick={() => { const comment = prompt('What needs changing?') ?? undefined; void action(i.id, 'review', { approved: false, comment }, 'Sent back to draft'); }}>Send back</button>
                    </>
                  )}
                  {(i.status === 'APPROVED' || i.status === 'SCHEDULED') && (
                    <button className="btn secondary" onClick={() => { const when = prompt('Release date and time (YYYY-MM-DDTHH:MM, Lagos time)'); if (when) void action(i.id, 'schedule', { publishAt: new Date(`${when}:00+01:00`).toISOString() }, 'Scheduled'); }}>Schedule</button>
                  )}
                  {i.status === 'PUBLISHED' && <button className="btn secondary" onClick={() => action(i.id, 'duplicate', undefined, 'Copied to a new draft')}>Edit as new draft</button>}
                  {i.status !== 'ARCHIVED' && <button className="btn secondary" onClick={() => action(i.id, 'archive', undefined, 'Archived (removed from the next pack)')}>Archive</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.data?.items.length === 0 ? <p className="muted">Nothing here.</p> : null}
      </div>

      <NewQuestion exam={exam} cats={cats.data ?? []} onCreated={() => { setStatus('DRAFT'); void items.reload(); }} />

      <div className="card">
        <h3>Packs for {exam}</h3>
        <div className="row">
          <label style={{ flex: 1 }}>
            What's new (shown on phones after the download succeeds)
            <input value={whatsNew} onChange={(e) => setWhatsNew(e.target.value)} maxLength={500} />
          </label>
          <button className="btn" disabled={!whatsNew || act.busy} onClick={() => act.run(() => api(`/admin/content/packs/${exam}/publish`, { body: { whatsNew } }), 'Published a new pack').then(() => { void packs.reload(); void items.reload(); })}>
            Publish approved content
          </button>
          {role === 'ADMIN' ? (
            <button className="btn danger" onClick={() => confirm('Roll back the latest pack? Phones will return to the previous version.') && act.run(() => api(`/admin/content/packs/${exam}/rollback`, { method: 'POST' }), 'Rolled back').then(() => packs.reload())}>
              Roll back latest
            </button>
          ) : null}
        </div>
        <table>
          <thead><tr><th>Version</th><th>Type</th><th>Status</th><th>Items</th><th>Size</th><th>Published</th><th>What's new</th></tr></thead>
          <tbody>
            {packs.data?.map((p) => (
              <tr key={p.id}>
                <td>v{p.version}</td><td>{p.isSampleOnly ? 'Free sample' : 'Full'}</td><td>{p.status}</td><td>{p.itemCount}</td><td>{Math.round(p.sizeBytes / 1024)} KB</td><td>{new Date(p.publishedAt).toLocaleString()}</td><td>{p.whatsNew}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function NewQuestion({ exam, cats, onCreated }: { exam: Exam; cats: Category[]; onCreated: () => void }) {
  const cat = cats.find((c) => c.code === exam);
  const [subjectId, setSubjectId] = useState('');
  const [f, setF] = useState({ kind: 'QUESTION', body: '', a: '', b: '', c: '', d: '', answer: 'A', explanation: '', isSample: false, source: 'ORIGINAL', rightsNote: '', year: '', markdown: '', title: '' });
  const act = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const create = () => {
    const payload =
      f.kind === 'QUESTION'
        ? { type: 'MULTIPLE_CHOICE', body: f.body, options: [['A', f.a], ['B', f.b], ['C', f.c], ['D', f.d]].filter(([, t]) => t).map(([key, text]) => ({ key, text })), answer: f.answer, explanation: f.explanation }
        : { markdown: f.markdown, keyPoints: [], workedExamples: [], diagrams: [] };
    return act.run(
      () =>
        api('/admin/content/items', {
          body: { kind: f.kind, examCode: exam, subjectId, title: f.title || f.body.slice(0, 80), payload, isSample: f.isSample, source: f.source, rightsNote: f.rightsNote || undefined, year: f.year ? Number(f.year) : undefined },
        }),
      'Draft created',
    ).then((ok) => ok && onCreated());
  };

  return (
    <div className="card">
      <h3>New item for {exam}</h3>
      <div className="row">
        <label>
          Type
          <select value={f.kind} onChange={set('kind')}>
            <option value="QUESTION">Multiple choice question</option>
            <option value="NOTE">Study note</option>
          </select>
        </label>
        <label>
          Subject
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Choose</option>
            {cat?.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>
          Source
          <select value={f.source} onChange={set('source')}>
            <option value="ORIGINAL">Original (written by Ugo)</option>
            <option value="LICENSED">Licensed (past paper or third party)</option>
          </select>
        </label>
        <label>
          <span>Free sample?</span>
          <input type="checkbox" checked={f.isSample} onChange={(e) => setF({ ...f, isSample: e.target.checked })} style={{ minWidth: 0 }} />
        </label>
      </div>
      {f.source === 'LICENSED' ? (
        <div className="row">
          <label style={{ flex: 1 }}>Rights note (licence or permission reference)<input value={f.rightsNote} onChange={set('rightsNote')} /></label>
          <label>Exam year (past questions only)<input value={f.year} onChange={set('year')} inputMode="numeric" /></label>
        </div>
      ) : null}
      {f.kind === 'QUESTION' ? (
        <>
          <label>Question<textarea value={f.body} onChange={set('body')} /></label>
          <div className="row">
            {(['a', 'b', 'c', 'd'] as const).map((k) => <label key={k}>Option {k.toUpperCase()}<input value={f[k]} onChange={set(k)} /></label>)}
            <label>Correct<select value={f.answer} onChange={set('answer')}>{['A', 'B', 'C', 'D'].map((k) => <option key={k}>{k}</option>)}</select></label>
          </div>
          <label>Worked explanation (required)<textarea value={f.explanation} onChange={set('explanation')} /></label>
        </>
      ) : (
        <>
          <label>Title<input value={f.title} onChange={set('title')} /></label>
          <label>Note (markdown: ## headings, - lists, **bold**)<textarea value={f.markdown} onChange={set('markdown')} style={{ minHeight: 200 }} /></label>
        </>
      )}
      {act.view}
      <div><button className="btn" disabled={!subjectId || act.busy} onClick={create}>Save as draft</button></div>
    </div>
  );
}
