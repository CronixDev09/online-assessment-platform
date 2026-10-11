import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { Card, ErrorText, PageHeader, Spinner, StatusBadge } from '../../components/ui';

interface QuestionLite {
  id: string;
  type: string;
  title: string;
  difficulty: string;
  marks: number;
  status: string;
}
interface CandidateLite {
  id: string;
  name: string;
  email: string;
  status: string;
}

const defaultForm = {
  title: '',
  description: '',
  category: '',
  instructions: '',
  durationMinutes: 60,
  startAt: '',
  endAt: '',
  passingMarks: 0,
  negativeMarkingEnabled: false,
  randomizeQuestions: false,
  randomizeOptions: false,
  proctoringEnabled: true,
  leaderboardEnabled: true,
  autoSubmit: true,
  resultVisibility: true,
  showAnswerKey: false,
  maxAttempts: 1,
  allowedLanguages: 'python,java,cpp',
  status: 'DRAFT',
};

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TestEditor() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState({ ...defaultForm });
  const [allQuestions, setAllQuestions] = useState<QuestionLite[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<CandidateLite[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [initialCandidates, setInitialCandidates] = useState<string[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get<{ questions: QuestionLite[] }>('/admin/questions').then((r) => setAllQuestions(r.data.questions));
    api.get<{ users: CandidateLite[] }>('/admin/users?role=CANDIDATE').then((r) => setCandidates(r.data.users));
  }, []);

  useEffect(() => {
    if (!id) return;
    api
      .get<{ test: any }>(`/admin/tests/${id}`)
      .then(({ data }) => {
        const t = data.test;
        setForm({
          title: t.title ?? '',
          description: t.description ?? '',
          category: t.category ?? '',
          instructions: t.instructions ?? '',
          durationMinutes: t.durationMinutes ?? 60,
          startAt: toLocalInput(t.startAt),
          endAt: toLocalInput(t.endAt),
          passingMarks: t.passingMarks ?? 0,
          negativeMarkingEnabled: t.negativeMarkingEnabled,
          randomizeQuestions: t.randomizeQuestions,
          randomizeOptions: t.randomizeOptions,
          proctoringEnabled: t.proctoringEnabled,
          leaderboardEnabled: t.leaderboardEnabled,
          autoSubmit: t.autoSubmit,
          resultVisibility: t.resultVisibility,
          showAnswerKey: t.showAnswerKey,
          maxAttempts: t.maxAttempts ?? 1,
          allowedLanguages: t.allowedLanguages ?? 'python,java,cpp',
          status: t.status ?? 'DRAFT',
        });
        setSelectedQuestions(t.testQuestions.map((tq: any) => tq.questionId));
        const assigned = t.assignments.map((a: any) => a.candidateId);
        setSelectedCandidates(assigned);
        setInitialCandidates(assigned);
      })
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const buildPayload = () => ({
    ...form,
    durationMinutes: Number(form.durationMinutes),
    passingMarks: Number(form.passingMarks),
    maxAttempts: Number(form.maxAttempts),
    startAt: form.startAt ? new Date(form.startAt).toISOString() : null,
    endAt: form.endAt ? new Date(form.endAt).toISOString() : null,
  });

  const saveBasic = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      if (isEdit) {
        await api.put(`/admin/tests/${id}`, buildPayload());
        setMessage('Settings saved.');
      } else {
        const { data } = await api.post<{ test: { id: string } }>('/admin/tests', buildPayload());
        navigate(`/admin/tests/${data.test.id}/edit`);
      }
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const saveQuestions = async () => {
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      await api.put(`/admin/tests/${id}/questions`, {
        items: selectedQuestions.map((questionId, i) => ({ questionId, displayOrder: i })),
      });
      setMessage('Questions saved.');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const saveAssignments = async () => {
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      const toAdd = selectedCandidates.filter((c) => !initialCandidates.includes(c));
      const toRemove = initialCandidates.filter((c) => !selectedCandidates.includes(c));
      if (toAdd.length) await api.post(`/admin/tests/${id}/assign`, { candidateIds: toAdd });
      for (const c of toRemove) await api.delete(`/admin/tests/${id}/assign/${c}`);
      setInitialCandidates(selectedCandidates);
      setMessage('Assignments saved.');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/admin/tests/${id}/publish`, {});
      setMessage('Test published.');
      navigate(`/admin/tests/${id}`);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleQuestion = (qid: string) =>
    setSelectedQuestions((prev) => (prev.includes(qid) ? prev.filter((x) => x !== qid) : [...prev, qid]));

  const moveQuestion = (qid: string, dir: -1 | 1) =>
    setSelectedQuestions((prev) => {
      const idx = prev.indexOf(qid);
      const next = [...prev];
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });

  if (loading) return <Spinner label="Loading test..." />;

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Edit test' : 'Create test'}
        subtitle={isEdit ? 'Configure settings, questions, proctoring and assignments.' : 'Step 1: basic information and settings.'}
        actions={
          <button className="btn btn-ghost" onClick={() => navigate('/admin/tests')}>
            Back to tests
          </button>
        }
      />
      <ErrorText>{error}</ErrorText>
      {message ? <p className="mb-3 text-sm text-emerald-600">{message}</p> : null}

      <form onSubmit={saveBasic} className="space-y-4">
        <Card>
          <h3 className="mb-3 font-semibold text-slate-800">Basic information</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Test title</label>
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description</label>
              <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <label className="label">Category</label>
              <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div>
              <label className="label">Duration (minutes)</label>
              <input type="number" className="input" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Start date/time</label>
              <input type="datetime-local" className="input" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />
            </div>
            <div>
              <label className="label">End date/time</label>
              <input type="datetime-local" className="input" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} />
            </div>
            <div>
              <label className="label">Passing marks</label>
              <input type="number" step="0.01" className="input" value={form.passingMarks} onChange={(e) => setForm({ ...form, passingMarks: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Maximum attempts</label>
              <input type="number" className="input" value={form.maxAttempts} onChange={(e) => setForm({ ...form, maxAttempts: Number(e.target.value) })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Instructions</label>
              <textarea className="input" rows={3} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {['DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Allowed coding languages</label>
              <input className="input" value={form.allowedLanguages} onChange={(e) => setForm({ ...form, allowedLanguages: e.target.value })} placeholder="python,java,cpp" />
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              ['negativeMarkingEnabled', 'Enable negative marking'],
              ['randomizeQuestions', 'Randomize question order'],
              ['randomizeOptions', 'Randomize option order'],
              ['proctoringEnabled', 'Enable proctoring'],
              ['leaderboardEnabled', 'Enable leaderboard'],
              ['autoSubmit', 'Auto-submit when time expires'],
              ['resultVisibility', 'Publish results to candidates'],
              ['showAnswerKey', 'Reveal answer key in results'],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={Boolean((form as Record<string, unknown>)[key])}
                  onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <button className="btn btn-primary" disabled={busy}>
              {isEdit ? 'Save settings' : 'Create and continue'}
            </button>
          </div>
        </Card>
      </form>

      {isEdit ? (
        <>
          <Card className="mt-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Questions ({selectedQuestions.length} selected)</h3>
              <button className="btn btn-secondary" onClick={saveQuestions} disabled={busy}>
                Save questions
              </button>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-medium uppercase text-slate-400">Question bank</div>
                <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {allQuestions.map((q) => (
                    <label key={q.id} className="flex items-center gap-2 rounded p-1.5 text-sm hover:bg-slate-50">
                      <input type="checkbox" checked={selectedQuestions.includes(q.id)} onChange={() => toggleQuestion(q.id)} />
                      <span className={`badge ${q.type === 'CODING' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>
                        {q.type}
                      </span>
                      <span className="flex-1 truncate text-slate-700">{q.title}</span>
                      <span className="text-xs text-slate-400">{q.marks}m</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-medium uppercase text-slate-400">Selected (in order)</div>
                <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {selectedQuestions.length === 0 ? (
                    <p className="p-2 text-sm text-slate-400">Select questions from the bank.</p>
                  ) : (
                    selectedQuestions.map((qid, i) => {
                      const q = allQuestions.find((x) => x.id === qid);
                      return (
                        <div key={qid} className="flex items-center gap-2 rounded p-1.5 text-sm">
                          <span className="w-5 text-slate-400">{i + 1}</span>
                          <span className="flex-1 truncate text-slate-700">{q?.title ?? qid}</span>
                          <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => moveQuestion(qid, -1)}>
                            ↑
                          </button>
                          <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => moveQuestion(qid, 1)}>
                            ↓
                          </button>
                          <button type="button" className="text-rose-500" onClick={() => toggleQuestion(qid)}>
                            &times;
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card className="mt-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Assigned candidates ({selectedCandidates.length})</h3>
              <button className="btn btn-secondary" onClick={saveAssignments} disabled={busy}>
                Save assignments
              </button>
            </div>
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {candidates.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded p-1.5 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selectedCandidates.includes(c.id)}
                    onChange={(e) =>
                      setSelectedCandidates((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)))
                    }
                  />
                  <span className="flex-1 truncate text-slate-700">{c.name}</span>
                  <span className="truncate text-xs text-slate-400">{c.email}</span>
                </label>
              ))}
            </div>
          </Card>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              Current status: <StatusBadge status={form.status} />
            </div>
            <button className="btn btn-primary" onClick={publish} disabled={busy || selectedQuestions.length === 0}>
              Publish test
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
