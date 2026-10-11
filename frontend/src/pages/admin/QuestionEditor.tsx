import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { Card, ErrorText, PageHeader, Spinner } from '../../components/ui';

interface OptionForm {
  id?: string;
  optionText: string;
  isCorrect: boolean;
}
interface CaseForm {
  id?: string;
  inputData: string;
  expectedOutput: string;
  weight: number;
  isHidden: boolean;
  timeoutMs: number;
}

const ALL_LANGS = [
  { id: 'python', label: 'Python 3' },
  { id: 'java', label: 'Java' },
  { id: 'cpp', label: 'C++17' },
];

export default function QuestionEditor() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [type, setType] = useState<'MCQ' | 'CODING'>('MCQ');
  const [meta, setMeta] = useState({
    title: '',
    description: '',
    difficulty: 'MEDIUM',
    category: '',
    tags: '',
    marks: 1,
    negativeMarks: 0,
    explanation: '',
    status: 'ACTIVE',
  });
  const [options, setOptions] = useState<OptionForm[]>([
    { optionText: '', isCorrect: false },
    { optionText: '', isCorrect: false },
  ]);
  const [coding, setCoding] = useState({
    inputFormat: '',
    outputFormat: '',
    constraints: '',
    sampleInput: '',
    sampleOutput: '',
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    maxCodeLength: 20000,
  });
  const [languages, setLanguages] = useState<string[]>(['python', 'java']);
  const [testCases, setTestCases] = useState<CaseForm[]>([
    { inputData: '', expectedOutput: '', weight: 1, isHidden: false, timeoutMs: 2000 },
  ]);

  const [loading, setLoading] = useState(isEdit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Inline test-case tester (works for already-persisted cases)
  const [tester, setTester] = useState<{ caseId: string; language: string; code: string; result: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .get<{ question: any }>(`/admin/questions/${id}`)
      .then(({ data }) => {
        const q = data.question;
        setType(q.type);
        setMeta({
          title: q.title ?? '',
          description: q.description ?? '',
          difficulty: q.difficulty ?? 'MEDIUM',
          category: q.category ?? '',
          tags: q.tags ?? '',
          marks: q.marks ?? 1,
          negativeMarks: q.negativeMarks ?? 0,
          explanation: q.explanation ?? '',
          status: q.status ?? 'ACTIVE',
        });
        if (q.type === 'MCQ') {
          setOptions(q.options.map((o: any) => ({ id: o.id, optionText: o.optionText, isCorrect: o.isCorrect })));
        } else if (q.coding) {
          setCoding({
            inputFormat: q.coding.inputFormat ?? '',
            outputFormat: q.coding.outputFormat ?? '',
            constraints: q.coding.constraints ?? '',
            sampleInput: q.coding.sampleInput ?? '',
            sampleOutput: q.coding.sampleOutput ?? '',
            timeLimitMs: q.coding.timeLimitMs ?? 2000,
            memoryLimitMb: q.coding.memoryLimitMb ?? 256,
            maxCodeLength: q.coding.maxCodeLength ?? 20000,
          });
          setLanguages((q.coding.allowedLanguages ?? 'python').split(',').map((s: string) => s.trim()));
          setTestCases(
            (q.coding.testCases ?? []).map((tc: any) => ({
              id: tc.id,
              inputData: tc.inputData ?? '',
              expectedOutput: tc.expectedOutput ?? '',
              weight: tc.weight ?? 1,
              isHidden: tc.isHidden ?? true,
              timeoutMs: tc.timeoutMs ?? 2000,
            })),
          );
        }
      })
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (type === 'MCQ') {
      if (options.length < 2) return setError('An MCQ needs at least two options.');
      if (!options.some((o) => o.isCorrect)) return setError('Mark at least one option as correct.');
      if (options.some((o) => !o.optionText.trim())) return setError('Every option needs text.');
    }
    if (type === 'CODING' && languages.length === 0) return setError('Select at least one allowed language.');

    const payload: Record<string, unknown> = {
      type,
      ...meta,
      marks: Number(meta.marks),
      negativeMarks: Number(meta.negativeMarks),
      options:
        type === 'MCQ'
          ? options.map((o, i) => ({ optionText: o.optionText, isCorrect: o.isCorrect, displayOrder: i }))
          : undefined,
      coding:
        type === 'CODING'
          ? { ...coding, allowedLanguages: languages.join(','), timeLimitMs: Number(coding.timeLimitMs), memoryLimitMb: Number(coding.memoryLimitMb), maxCodeLength: Number(coding.maxCodeLength) }
          : undefined,
      testCases:
        type === 'CODING'
          ? testCases.map((tc) => ({
              inputData: tc.inputData,
              expectedOutput: tc.expectedOutput,
              weight: Number(tc.weight),
              isHidden: tc.isHidden,
              timeoutMs: Number(tc.timeoutMs),
            }))
          : undefined,
    };

    setBusy(true);
    try {
      if (isEdit) await api.put(`/admin/questions/${id}`, payload);
      else await api.post('/admin/questions', payload);
      navigate('/admin/questions');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const runTester = async () => {
    if (!tester) return;
    try {
      const { data } = await api.post<{ result: { status: string; cases: { stdout: string }[] } }>(
        `/admin/test-cases/${tester.caseId}/test`,
        { language: tester.language, sourceCode: tester.code },
      );
      setTester({ ...tester, result: `${data.result.status} | output: ${data.result.cases[0]?.stdout ?? ''}` });
    } catch (e) {
      setTester({ ...tester, result: apiError(e) });
    }
  };

  if (loading) return <Spinner label="Loading question..." />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={isEdit ? 'Edit question' : 'New question'} subtitle="MCQ or coding problem." />
      <ErrorText>{error}</ErrorText>

      <form onSubmit={save} className="space-y-4">
        <Card>
          <div className="mb-4 flex gap-2">
            {(['MCQ', 'CODING'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`btn ${type === t ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setType(t)}
              >
                {t === 'MCQ' ? 'MCQ' : 'Coding'}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Title</label>
              <input className="input" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} required />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description / problem statement</label>
              <textarea className="input" rows={4} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
            </div>
            <div>
              <label className="label">Difficulty</label>
              <select className="input" value={meta.difficulty} onChange={(e) => setMeta({ ...meta, difficulty: e.target.value })}>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </div>
            <div>
              <label className="label">Category</label>
              <input className="input" value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })} />
            </div>
            <div>
              <label className="label">Marks</label>
              <input type="number" step="0.01" className="input" value={meta.marks} onChange={(e) => setMeta({ ...meta, marks: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Negative marks</label>
              <input type="number" step="0.01" className="input" value={meta.negativeMarks} onChange={(e) => setMeta({ ...meta, negativeMarks: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Tags (comma separated)</label>
              <input className="input" value={meta.tags} onChange={(e) => setMeta({ ...meta, tags: e.target.value })} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={meta.status} onChange={(e) => setMeta({ ...meta, status: e.target.value })}>
                <option value="ACTIVE">Active</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Explanation (shown to admins; optionally to candidates)</label>
              <textarea className="input" rows={2} value={meta.explanation} onChange={(e) => setMeta({ ...meta, explanation: e.target.value })} />
            </div>
          </div>
        </Card>

        {type === 'MCQ' ? (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Options</h3>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setOptions([...options, { optionText: '', isCorrect: false }])}
              >
                Add option
              </button>
            </div>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-6 text-center text-sm text-slate-400">{String.fromCharCode(65 + i)}</span>
                  <input
                    className="input"
                    placeholder={`Option ${i + 1}`}
                    value={opt.optionText}
                    onChange={(e) => {
                      const next = [...options];
                      next[i] = { ...next[i], optionText: e.target.value };
                      setOptions(next);
                    }}
                    required
                  />
                  <label className="flex items-center gap-1 whitespace-nowrap text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={opt.isCorrect}
                      onChange={(e) => {
                        const next = [...options];
                        next[i] = { ...next[i], isCorrect: e.target.checked };
                        setOptions(next);
                      }}
                    />
                    Correct
                  </label>
                  <button
                    type="button"
                    className="text-rose-500"
                    onClick={() => setOptions(options.filter((_, idx) => idx !== i))}
                    disabled={options.length <= 2}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <>
            <Card>
              <h3 className="mb-3 font-semibold text-slate-800">Coding details</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Input format</label>
                  <textarea className="input" rows={2} value={coding.inputFormat} onChange={(e) => setCoding({ ...coding, inputFormat: e.target.value })} />
                </div>
                <div>
                  <label className="label">Output format</label>
                  <textarea className="input" rows={2} value={coding.outputFormat} onChange={(e) => setCoding({ ...coding, outputFormat: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Constraints</label>
                  <textarea className="input" rows={2} value={coding.constraints} onChange={(e) => setCoding({ ...coding, constraints: e.target.value })} />
                </div>
                <div>
                  <label className="label">Sample input</label>
                  <textarea className="input" rows={2} value={coding.sampleInput} onChange={(e) => setCoding({ ...coding, sampleInput: e.target.value })} />
                </div>
                <div>
                  <label className="label">Sample output</label>
                  <textarea className="input" rows={2} value={coding.sampleOutput} onChange={(e) => setCoding({ ...coding, sampleOutput: e.target.value })} />
                </div>
                <div>
                  <label className="label">Time limit (ms)</label>
                  <input type="number" className="input" value={coding.timeLimitMs} onChange={(e) => setCoding({ ...coding, timeLimitMs: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label">Memory limit (MB)</label>
                  <input type="number" className="input" value={coding.memoryLimitMb} onChange={(e) => setCoding({ ...coding, memoryLimitMb: Number(e.target.value) })} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Allowed languages</label>
                  <div className="flex gap-4">
                    {ALL_LANGS.map((l) => (
                      <label key={l.id} className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={languages.includes(l.id)}
                          onChange={(e) =>
                            setLanguages((prev) => (e.target.checked ? [...prev, l.id] : prev.filter((x) => x !== l.id)))
                          }
                        />
                        {l.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">Test cases</h3>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setTestCases([...testCases, { inputData: '', expectedOutput: '', weight: 1, isHidden: true, timeoutMs: 2000 }])}
                >
                  Add test case
                </button>
              </div>
              <div className="space-y-3">
                {testCases.map((tc, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-600">Case {i + 1}</span>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1 text-sm text-slate-600">
                          <input
                            type="checkbox"
                            checked={tc.isHidden}
                            onChange={(e) => {
                              const next = [...testCases];
                              next[i] = { ...next[i], isHidden: e.target.checked };
                              setTestCases(next);
                            }}
                          />
                          Hidden
                        </label>
                        <button
                          type="button"
                          className="text-rose-500"
                          onClick={() => setTestCases(testCases.filter((_, idx) => idx !== i))}
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className="label">Input</label>
                        <textarea
                          className="input"
                          rows={2}
                          value={tc.inputData}
                          onChange={(e) => {
                            const next = [...testCases];
                            next[i] = { ...next[i], inputData: e.target.value };
                            setTestCases(next);
                          }}
                        />
                      </div>
                      <div>
                        <label className="label">Expected output</label>
                        <textarea
                          className="input"
                          rows={2}
                          value={tc.expectedOutput}
                          onChange={(e) => {
                            const next = [...testCases];
                            next[i] = { ...next[i], expectedOutput: e.target.value };
                            setTestCases(next);
                          }}
                          required
                        />
                      </div>
                      <div>
                        <label className="label">Weight</label>
                        <input
                          type="number"
                          step="0.1"
                          className="input"
                          value={tc.weight}
                          onChange={(e) => {
                            const next = [...testCases];
                            next[i] = { ...next[i], weight: Number(e.target.value) };
                            setTestCases(next);
                          }}
                        />
                      </div>
                      <div>
                        <label className="label">Timeout (ms)</label>
                        <input
                          type="number"
                          className="input"
                          value={tc.timeoutMs}
                          onChange={(e) => {
                            const next = [...testCases];
                            next[i] = { ...next[i], timeoutMs: Number(e.target.value) };
                            setTestCases(next);
                          }}
                        />
                      </div>
                    </div>
                    {isEdit && tc.id ? (
                      <button
                        type="button"
                        className="btn btn-ghost mt-2 text-xs"
                        onClick={() => setTester({ caseId: tc.id!, language: languages[0] ?? 'python', code: '', result: '' })}
                      >
                        Test this case
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/admin/questions')}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving...' : isEdit ? 'Save question' : 'Create question'}
          </button>
        </div>
      </form>

      {tester ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5">
            <h3 className="font-semibold text-slate-800">Test case runner</h3>
            <p className="mt-1 text-xs text-slate-500">Run a reference solution against this saved case.</p>
            <div className="mt-3 space-y-2">
              <select className="input" value={tester.language} onChange={(e) => setTester({ ...tester, language: e.target.value })}>
                {ALL_LANGS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
              <textarea
                className="input font-mono text-xs"
                rows={8}
                placeholder="Reference solution..."
                value={tester.code}
                onChange={(e) => setTester({ ...tester, code: e.target.value })}
              />
              {tester.result ? <p className="text-sm text-slate-600">{tester.result}</p> : null}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setTester(null)}>
                Close
              </button>
              <button className="btn btn-primary" onClick={runTester}>
                Run
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
