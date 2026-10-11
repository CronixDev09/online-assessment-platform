import { useState } from 'react';
import { CodeEditor } from '../../components/CodeEditor';
import { api, apiError } from '../../lib/api';
import { StatusBadge } from '../../components/ui';
import { CODE_TEMPLATES, LANGUAGE_LABELS, type SessionQuestion } from './attemptTypes';

interface NormalizedCase {
  label: string | null;
  isHidden: boolean;
  status: string;
  executionTime: number | null;
  stdout: string | null;
  stderr: string | null;
  expected: string | null;
}

interface Normalized {
  status: string;
  score?: number;
  maxScore?: number;
  passedCases: number;
  totalCases: number;
  executionTime: number;
  compileOutput?: string | null;
  message?: string;
  engine?: string;
  cases: NormalizedCase[];
}

function normalize(payload: Record<string, unknown>, fromSubmit: boolean): Normalized {
  const cases = (fromSubmit ? (payload.caseResults as NormalizedCase[] | undefined) : (payload.cases as NormalizedCase[] | undefined)) ?? [];
  return {
    status: String(payload.status ?? 'INTERNAL_ERROR'),
    score: payload.score as number | undefined,
    maxScore: payload.maxScore as number | undefined,
    passedCases: Number(payload.passedCases ?? 0),
    totalCases: Number(payload.totalCases ?? cases.length),
    executionTime: Number(payload.executionTime ?? 0),
    compileOutput: (payload.compileOutput as string | null | undefined) ?? null,
    message: payload.message as string | undefined,
    engine: payload.engine as string | undefined,
    cases: cases.map((c) => ({
      label: c.label,
      isHidden: c.isHidden,
      status: c.status,
      executionTime: c.executionTime,
      stdout: c.stdout,
      stderr: c.stderr,
      expected: c.expected,
    })),
  };
}

export function CodingQuestion({
  question,
  sessionId,
  language,
  sourceCode,
  onDraftChange,
  saveState,
  index,
  total,
  lastSubmission,
}: {
  question: SessionQuestion;
  sessionId: string;
  language: string;
  sourceCode: string;
  onDraftChange: (language: string, sourceCode: string) => void;
  saveState: 'idle' | 'saving' | 'saved';
  index: number;
  total: number;
  lastSubmission?: { status: string; score: number; passedCases: number; totalCases: number };
}) {
  const coding = question.coding;
  const languages = coding?.allowedLanguages ?? ['python'];
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Normalized | null>(null);
  const [mode, setMode] = useState<'run' | 'submit' | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'problem' | 'output'>('problem');

  const changeLanguage = (next: string) => {
    const isTemplate = Object.values(CODE_TEMPLATES).some((t) => t.trim() === sourceCode.trim());
    const nextCode = !sourceCode.trim() || isTemplate ? (CODE_TEMPLATES[next] ?? '') : sourceCode;
    onDraftChange(next, nextCode);
  };

  const run = async () => {
    setError('');
    setRunning(true);
    setMode('run');
    setActiveTab('output');
    try {
      const { data } = await api.post<{ result: Record<string, unknown> }>('/code/run', {
        sessionId,
        questionId: question.id,
        language,
        sourceCode,
      });
      setOutcome(normalize(data.result, false));
    } catch (e) {
      setError(apiError(e));
    } finally {
      setRunning(false);
    }
  };

  const submit = async () => {
    setError('');
    setSubmitting(true);
    setMode('submit');
    setActiveTab('output');
    try {
      const { data } = await api.post<{ submission: Record<string, unknown> }>('/code/submit', {
        sessionId,
        questionId: question.id,
        language,
        sourceCode,
      });
      setOutcome(normalize(data.submission, true));
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const resetCode = () => {
    if (window.confirm('Reset the editor to the default template? Your current code will be replaced.')) {
      onDraftChange(language, CODE_TEMPLATES[language] ?? '');
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Question {index + 1} of {total} &middot; Coding
        </span>
        <span className="text-xs text-slate-400">
          {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Draft saved' : ''}
        </span>
      </div>

      <h2 className="text-lg font-semibold text-slate-900">{question.title}</h2>

      <div className="mt-2 flex gap-1 border-b border-slate-200">
        <button
          className={`px-3 py-2 text-sm font-medium ${activeTab === 'problem' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500'}`}
          onClick={() => setActiveTab('problem')}
        >
          Problem
        </button>
        <button
          className={`px-3 py-2 text-sm font-medium ${activeTab === 'output' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500'}`}
          onClick={() => setActiveTab('output')}
        >
          Output {outcome ? <span className="ml-1 text-xs text-slate-400">({outcome.status.replace(/_/g, ' ')})</span> : null}
        </button>
      </div>

      {activeTab === 'problem' ? (
        <div className="mt-3 space-y-3 text-sm text-slate-600">
          {question.description ? <p className="whitespace-pre-wrap">{question.description}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {coding?.inputFormat ? (
              <div>
                <div className="font-medium text-slate-700">Input format</div>
                <p className="whitespace-pre-wrap">{coding.inputFormat}</p>
              </div>
            ) : null}
            {coding?.outputFormat ? (
              <div>
                <div className="font-medium text-slate-700">Output format</div>
                <p className="whitespace-pre-wrap">{coding.outputFormat}</p>
              </div>
            ) : null}
          </div>
          {coding?.constraints ? (
            <div>
              <div className="font-medium text-slate-700">Constraints</div>
              <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{coding.constraints}</pre>
            </div>
          ) : null}
          {coding?.sampleCases && coding.sampleCases.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {coding.sampleCases.map((c, i) => (
                <div key={c.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-1 text-xs font-medium text-slate-500">Sample {i + 1}</div>
                  <div className="text-xs text-slate-400">Input</div>
                  <pre className="whitespace-pre-wrap text-xs text-slate-700">{c.inputData || '(empty)'}</pre>
                  <div className="mt-1 text-xs text-slate-400">Output</div>
                  <pre className="whitespace-pre-wrap text-xs text-slate-700">{c.expectedOutput}</pre>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3">
          {error ? <p className="mb-2 text-sm text-rose-600">{error}</p> : null}
          {outcome ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <StatusBadge status={outcome.status} />
                <span className="text-slate-600">
                  {outcome.passedCases}/{outcome.totalCases} cases passed
                </span>
                <span className="text-slate-400">{outcome.executionTime} ms</span>
                {typeof outcome.score === 'number' ? (
                  <span className="text-slate-600">
                    Score: <strong>{outcome.score}</strong>
                    {typeof outcome.maxScore === 'number' ? ` / ${outcome.maxScore}` : ''}
                  </span>
                ) : null}
                {outcome.engine ? <span className="text-xs text-slate-400">judge: {outcome.engine}</span> : null}
                {mode === 'submit' ? <span className="text-xs text-emerald-600">Submitted for grading</span> : null}
              </div>
              {outcome.compileOutput ? (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-3 text-xs text-rose-300">
                  {outcome.compileOutput}
                </pre>
              ) : null}
              {outcome.message ? <p className="text-sm text-amber-600">{outcome.message}</p> : null}
              <div className="space-y-1">
                {outcome.cases.map((c, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-600">{c.label ?? `Case ${i + 1}`}</span>
                      <span className="flex items-center gap-2">
                        {c.executionTime != null ? <span className="text-slate-400">{c.executionTime} ms</span> : null}
                        <StatusBadge status={c.status} />
                      </span>
                    </div>
                    {!c.isHidden && c.status !== 'ACCEPTED' ? (
                      <div className="mt-1 grid gap-1 sm:grid-cols-2">
                        <div>
                          <div className="text-slate-400">Expected</div>
                          <pre className="whitespace-pre-wrap text-slate-700">{c.expected ?? ''}</pre>
                        </div>
                        <div>
                          <div className="text-slate-400">Got</div>
                          <pre className="whitespace-pre-wrap text-slate-700">{c.stdout || c.stderr || '(no output)'}</pre>
                        </div>
                      </div>
                    ) : null}
                    {c.isHidden ? <p className="mt-1 text-slate-400">Hidden test case</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Run your code against the sample cases, or submit to grade against all test cases including hidden
              ones.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={language} onChange={(e) => changeLanguage(e.target.value)}>
          {languages.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_LABELS[l] ?? l}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary" onClick={resetCode}>
          Reset code
        </button>
        <div className="flex-1" />
        <button className="btn btn-secondary" onClick={run} disabled={running || submitting}>
          {running && mode === 'run' ? 'Running...' : 'Run'}
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={running || submitting}>
          {submitting ? 'Submitting...' : 'Submit code'}
        </button>
      </div>

      {lastSubmission ? (
        <p className="mt-2 text-xs text-slate-400">
          Last graded submission: {lastSubmission.status.replace(/_/g, ' ')} &middot;{' '}
          {lastSubmission.passedCases}/{lastSubmission.totalCases} cases &middot; score {lastSubmission.score}
        </p>
      ) : null}

      <div className="mt-3">
        <CodeEditor language={language} value={sourceCode} onChange={(v) => onDraftChange(language, v)} height="380px" />
      </div>
    </div>
  );
}
