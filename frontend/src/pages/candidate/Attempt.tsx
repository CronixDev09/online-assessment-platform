import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { formatClock } from '../../lib/format';
import { useProctoring } from '../../hooks/useProctoring';
import { useServerCountdown } from '../../hooks/useServerCountdown';
import { Spinner, StatusBadge } from '../../components/ui';
import { CodingQuestion } from './CodingQuestion';
import { McqQuestion } from './McqQuestion';
import { CODE_TEMPLATES, type SessionState } from './attemptTypes';

const PROCTOR_MESSAGES: Record<string, string> = {
  TAB_SWITCH: 'Security warning: leaving the assessment window has been recorded.',
  WINDOW_BLUR: 'Security warning: the assessment window lost focus.',
  FULLSCREEN_EXIT: 'Security warning: fullscreen was exited. Please return to fullscreen.',
  CAMERA_STOPPED: 'Your camera connection was interrupted. Please restore camera access.',
  MICROPHONE_STOPPED: 'Your microphone connection was interrupted.',
  CAMERA_DENIED: 'Camera access is unavailable. Check your browser permissions and camera connection.',
  MICROPHONE_DENIED: 'Microphone access is unavailable.',
  NETWORK_LOST: 'Connection lost. Your previously saved work is secure.',
  NETWORK_RESTORED: 'Connection restored.',
};

type SaveState = 'idle' | 'saving' | 'saved';

export default function Attempt() {
  const { sessionId = '' } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<SessionState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [codeDrafts, setCodeDrafts] = useState<Record<string, { language: string; sourceCode: string }>>({});
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [warning, setWarning] = useState<{ message: string; count?: number; max?: number | null } | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPalette, setShowPalette] = useState(false);

  const saveTimers = useRef<Record<string, number>>({});
  const finalizedRef = useRef(false);

  // ---- Load session state ----
  useEffect(() => {
    api
      .get<SessionState>(`/sessions/${sessionId}`)
      .then((r) => {
        const s = r.data;
        setState(s);
        const initialAnswers: Record<string, string[]> = {};
        for (const a of s.answers) initialAnswers[a.questionId] = a.selectedOptionIds ?? [];
        setAnswers(initialAnswers);

        const drafts: Record<string, { language: string; sourceCode: string }> = {};
        for (const q of s.questions) {
          if (q.type !== 'CODING') continue;
          const existing = s.codeDrafts[q.id];
          if (existing) {
            drafts[q.id] = { language: existing.language, sourceCode: existing.sourceCode };
          } else {
            const lang = q.coding?.allowedLanguages[0] ?? 'python';
            drafts[q.id] = { language: lang, sourceCode: CODE_TEMPLATES[lang] ?? '' };
          }
        }
        setCodeDrafts(drafts);

        if (s.status !== 'IN_PROGRESS') {
          navigate(`/candidate/tests/${s.testId}/submitted?sessionId=${s.sessionId}`, { replace: true });
        }
      })
      .catch((e) => setLoadError(apiError(e)));
  }, [sessionId, navigate]);

  const serverOffset = useMemo(
    () => (state ? new Date(state.serverNow).getTime() - Date.now() : 0),
    [state],
  );

  const finalize = useCallback(
    async (reason: 'CANDIDATE' | 'TIME_EXPIRED') => {
      if (finalizedRef.current || !state) return;
      finalizedRef.current = true;
      setSubmitting(true);
      try {
        await api.post(`/sessions/${sessionId}/submit`, { reason });
      } catch {
        /* the server may already have finalized the session */
      }
      navigate(`/candidate/tests/${state.testId}/submitted?sessionId=${sessionId}`, { replace: true });
    },
    [sessionId, state, navigate],
  );

  const onExpire = useCallback(() => {
    void finalize('TIME_EXPIRED');
  }, [finalize]);

  const remaining = useServerCountdown(state?.expiresAt ?? null, serverOffset, onExpire);

  const proctoringEnabled = Boolean(state?.test.proctoringEnabled);

  const { videoRef, camera, mic, connected, requestFullscreen } = useProctoring({
    sessionId,
    enabled: proctoringEnabled && state?.status === 'IN_PROGRESS',
    onEvent: (event) => {
      if (!state) return;
      if (event.action === 'DISQUALIFY_AND_SUBMIT') {
        setWarning({ message: 'Your session has been ended due to policy violations and was submitted.' });
        setTimeout(() => void finalize('TIME_EXPIRED'), 1500);
        return;
      }
      if (event.type === 'SESSION_CLOSED') {
        setTimeout(() => void finalize('TIME_EXPIRED'), 500);
        return;
      }
      const isLowSignal = event.type === 'NETWORK_RESTORED' || event.type === 'NETWORK_LOST';
      setWarning({
        message: PROCTOR_MESSAGES[event.type] ?? `Security event recorded: ${event.type.replace(/_/g, ' ').toLowerCase()}.`,
        count: isLowSignal ? undefined : event.warningCount,
        max: isLowSignal ? undefined : event.warningsAllowed,
      });
    },
  });

  // Warn before accidentally closing the tab during an active test.
  useEffect(() => {
    if (!state || state.status !== 'IN_PROGRESS') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [state]);

  // ---- Saving ----
  const debounce = (key: string, fn: () => void, delay: number) => {
    window.clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = window.setTimeout(fn, delay);
  };

  const setSave = (qid: string, value: SaveState) => setSaveStates((s) => ({ ...s, [qid]: value }));

  const selectAnswer = (qid: string, optionIds: string[]) => {
    setAnswers((a) => ({ ...a, [qid]: optionIds }));
    setSave(qid, 'saving');
    debounce(
      `a-${qid}`,
      async () => {
        try {
          await api.post(`/sessions/${sessionId}/answer`, { questionId: qid, selectedOptionIds: optionIds });
          setSave(qid, 'saved');
        } catch {
          setSave(qid, 'idle');
        }
      },
      400,
    );
  };

  const changeCode = (qid: string, language: string, sourceCode: string) => {
    setCodeDrafts((d) => ({ ...d, [qid]: { language, sourceCode } }));
    setSave(qid, 'saving');
    debounce(
      `c-${qid}`,
      async () => {
        try {
          await api.post(`/sessions/${sessionId}/code`, { questionId: qid, language, sourceCode });
          setSave(qid, 'saved');
        } catch {
          setSave(qid, 'idle');
        }
      },
      1200,
    );
  };

  const toggleMark = (qid: string) => {
    setMarked((m) => {
      const next = new Set(m);
      if (next.has(qid)) next.delete(qid);
      else next.add(qid);
      return next;
    });
  };

  // ---- Derived counts ----
  const questions = state?.questions ?? [];
  const isAnswered = (qid: string, type: string) => {
    if (type === 'MCQ') return (answers[qid] ?? []).length > 0;
    const draft = codeDrafts[qid];
    return Boolean(draft && draft.sourceCode.trim().length > 0);
  };
  const answeredCount = questions.filter((q) => isAnswered(q.id, q.type)).length;
  const markedCount = marked.size;
  const unansweredCount = questions.length - answeredCount;

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-md p-6 text-center">
          <p className="text-sm text-rose-600">{loadError}</p>
          <button className="btn btn-secondary mt-4" onClick={() => navigate('/candidate/dashboard')}>
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }
  if (!state) return <Spinner label="Starting secure session..." />;

  const question = questions[currentIndex];
  const lowTime = remaining <= 60;

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      {/* Warning toast */}
      {warning ? (
        <div className="fixed left-1/2 top-4 z-50 w-[92%] max-w-xl -translate-x-1/2 rounded-lg border border-amber-300 bg-amber-50 p-3 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-amber-800">{warning.message}</p>
            <button className="text-amber-500" onClick={() => setWarning(null)} aria-label="Dismiss">
              &times;
            </button>
          </div>
          {typeof warning.count === 'number' ? (
            <p className="mt-1 text-xs font-medium text-amber-700">
              Warnings: {warning.count}
              {warning.max ? ` / ${warning.max}` : ''}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button className="btn-ghost lg:hidden" onClick={() => setShowPalette((v) => !v)}>
              Questions
            </button>
            <span className="font-semibold text-slate-800">{state.test.title}</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">{state.test.proctoringEnabled ? 'Proctored' : 'Unproctored'}</span>
            <span
              className={`inline-flex items-center gap-1 text-xs ${connected ? 'text-emerald-600' : 'text-rose-600'}`}
            >
              <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              {connected ? 'Connected' : 'Offline'}
            </span>
            <span
              className={`rounded-lg px-3 py-1 font-mono text-sm font-semibold ${
                lowTime ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {formatClock(remaining)}
            </span>
            <button className="btn btn-primary" onClick={() => setShowSubmit(true)}>
              Submit test
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 gap-3 p-3 lg:p-4">
        {/* Left: palette */}
        <aside className={`${showPalette ? 'block' : 'hidden'} w-full shrink-0 lg:block lg:w-56`}>
          <div className="card space-y-3 p-3">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Questions</div>
              <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-5">
                {questions.map((q, i) => {
                  const answered = isAnswered(q.id, q.type);
                  const isMarked = marked.has(q.id);
                  const isCurrent = i === currentIndex;
                  const base = 'h-9 w-9 rounded-md text-xs font-medium';
                  const cls = isCurrent
                    ? 'bg-indigo-600 text-white'
                    : isMarked
                      ? 'bg-amber-400 text-white'
                      : answered
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-200 text-slate-600';
                  return (
                    <button
                      key={q.id}
                      className={`${base} ${cls}`}
                      onClick={() => {
                        setCurrentIndex(i);
                        setShowPalette(false);
                      }}
                      title={`Question ${i + 1}`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded bg-emerald-500" /> Answered ({answeredCount})
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded bg-slate-200" /> Unanswered ({unansweredCount})
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded bg-amber-400" /> Marked ({markedCount})
              </div>
            </div>
          </div>
        </aside>

        {/* Center: question */}
        <main className="min-w-0 flex-1">
          {question ? (
            <div className="card p-4 lg:p-6">
              {question.type === 'MCQ' ? (
                <McqQuestion
                  question={question}
                  selected={answers[question.id] ?? []}
                  onSelect={(ids) => selectAnswer(question.id, ids)}
                  saveState={saveStates[question.id] ?? 'idle'}
                  index={currentIndex}
                  total={questions.length}
                />
              ) : (
                <CodingQuestion
                  question={question}
                  sessionId={sessionId}
                  language={codeDrafts[question.id]?.language ?? 'python'}
                  sourceCode={codeDrafts[question.id]?.sourceCode ?? ''}
                  onDraftChange={(lang, code) => changeCode(question.id, lang, code)}
                  saveState={saveStates[question.id] ?? 'idle'}
                  index={currentIndex}
                  total={questions.length}
                  lastSubmission={state.latestSubmissions[question.id]}
                />
              )}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                <button
                  className="btn btn-secondary"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                >
                  Previous
                </button>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={marked.has(question.id)}
                    onChange={() => toggleMark(question.id)}
                  />
                  Mark for review
                </label>
                <button
                  className="btn btn-secondary"
                  disabled={currentIndex >= questions.length - 1}
                  onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          ) : (
            <div className="card p-6 text-slate-500">No questions configured for this test.</div>
          )}
        </main>

        {/* Right: proctoring */}
        {proctoringEnabled ? (
          <aside className="hidden w-64 shrink-0 xl:block">
            <div className="card space-y-3 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Proctoring</div>
              <video ref={videoRef} muted playsInline className="h-36 w-full rounded-lg bg-slate-900 object-cover" />
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Camera</span>
                  <span className={camera === 'READY' ? 'text-emerald-600' : 'text-rose-600'}>{camera}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Microphone</span>
                  <span className={mic === 'READY' ? 'text-emerald-600' : 'text-rose-600'}>{mic}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Connection</span>
                  <span className={connected ? 'text-emerald-600' : 'text-rose-600'}>
                    {connected ? 'Online' : 'Offline'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Violations</span>
                  <span className="text-slate-700">{state.violationCount}</span>
                </div>
              </div>
              <button className="btn btn-secondary w-full" onClick={requestFullscreen}>
                Return to fullscreen
              </button>
              {camera !== 'READY' && camera !== 'IDLE' ? (
                <button className="btn btn-secondary w-full" onClick={() => window.location.reload()}>
                  Restore camera
                </button>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>

      {/* Submit confirmation */}
      {showSubmit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6">
            <h3 className="text-lg font-semibold text-slate-800">Submit test?</h3>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Answered</span>
                <span className="font-medium">{answeredCount}/{questions.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Marked for review</span>
                <span className="font-medium">{markedCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Unanswered</span>
                <span className="font-medium">{unansweredCount}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2">
                <span className="text-slate-500">Time remaining</span>
                <span className="font-mono font-medium">{formatClock(remaining)}</span>
              </div>
            </div>
            <p className="mt-4 text-sm text-amber-600">Once submitted, you cannot return to this test.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setShowSubmit(false)} disabled={submitting}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={() => finalize('CANDIDATE')} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit test'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
