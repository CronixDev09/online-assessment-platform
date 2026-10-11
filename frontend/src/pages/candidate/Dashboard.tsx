import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { formatDateTime, formatDuration } from '../../lib/format';
import { EmptyState, ErrorText, PageHeader, Spinner, StatusBadge } from '../../components/ui';

interface TestCard {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  durationMinutes: number;
  totalMarks: number;
  passingMarks: number;
  startAt: string | null;
  endAt: string | null;
  proctoringEnabled: boolean;
  status: 'UPCOMING' | 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';
  questionCounts: { mcq: number; coding: number; total: number };
  attemptsUsed: number;
  maxAttempts: number;
  result: { sessionId: string; score: number; maxScore: number; percentage: number; passed: boolean } | null;
}

export default function CandidateDashboard() {
  const navigate = useNavigate();
  const [tests, setTests] = useState<TestCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .get<{ tests: TestCard[] }>('/candidate/tests')
      .then((r) => setTests(r.data.tests))
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const startOrResume = async (test: TestCard) => {
    setError('');
    setStarting(test.id);
    try {
      const { data } = await api.post<{ sessionId: string }>(`/tests/${test.id}/start`);
      navigate(`/attempt/${data.sessionId}`);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setStarting(null);
    }
  };

  if (loading) return <Spinner label="Loading your assigned tests..." />;

  return (
    <div>
      <PageHeader
        title="Assigned Tests"
        subtitle="Start, resume or review your assessments."
        actions={
          <button className="btn btn-secondary" onClick={load}>
            Refresh
          </button>
        }
      />
      <ErrorText>{error}</ErrorText>

      {tests.length === 0 ? (
        <EmptyState title="No tests assigned yet" message="When an admin assigns you a test it will appear here." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tests.map((test) => (
            <div key={test.id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-slate-800">{test.title}</h3>
                <StatusBadge status={test.status} />
              </div>
              {test.category ? <p className="mt-0.5 text-xs uppercase tracking-wide text-slate-400">{test.category}</p> : null}
              {test.description ? <p className="mt-2 line-clamp-2 text-sm text-slate-500">{test.description}</p> : null}

              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-slate-400">Questions</dt>
                  <dd className="font-medium text-slate-700">
                    {test.questionCounts.total} ({test.questionCounts.mcq} MCQ, {test.questionCounts.coding} code)
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Duration</dt>
                  <dd className="font-medium text-slate-700">{test.durationMinutes} min</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Total marks</dt>
                  <dd className="font-medium text-slate-700">{test.totalMarks}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Attempts</dt>
                  <dd className="font-medium text-slate-700">
                    {test.attemptsUsed}/{test.maxAttempts}
                  </dd>
                </div>
                {test.startAt ? (
                  <div className="col-span-2">
                    <dt className="text-slate-400">Window</dt>
                    <dd className="font-medium text-slate-700">
                      {formatDateTime(test.startAt)} &rarr; {formatDateTime(test.endAt)}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {test.proctoringEnabled ? (
                <p className="mt-3 text-xs text-amber-600">Proctored: camera, microphone and fullscreen required.</p>
              ) : null}

              {test.result ? (
                <div className="mt-3 rounded-lg bg-slate-50 p-2 text-sm">
                  Score {test.result.score}/{test.result.maxScore} ({test.result.percentage}%) &middot;{' '}
                  <span className={test.result.passed ? 'text-emerald-600' : 'text-rose-600'}>
                    {test.result.passed ? 'Passed' : 'Failed'}
                  </span>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2 pt-1">
                {test.status === 'AVAILABLE' ? (
                  <Link to={`/candidate/tests/${test.id}/instructions`} className="btn btn-primary flex-1">
                    View & start
                  </Link>
                ) : null}
                {test.status === 'IN_PROGRESS' ? (
                  <button
                    className="btn btn-primary flex-1"
                    disabled={starting === test.id}
                    onClick={() => startOrResume(test)}
                  >
                    {starting === test.id ? 'Resuming...' : 'Resume test'}
                  </button>
                ) : null}
                {test.status === 'COMPLETED' && test.result ? (
                  <Link to={`/candidate/results/${test.result.sessionId}`} className="btn btn-secondary flex-1">
                    View result
                  </Link>
                ) : null}
                {test.status === 'COMPLETED' ? (
                  <Link to={`/candidate/leaderboard/${test.id}`} className="btn btn-ghost">
                    Leaderboard
                  </Link>
                ) : null}
                {test.status === 'UPCOMING' ? (
                  <span className="text-sm text-slate-400">Available from {formatDateTime(test.startAt)}</span>
                ) : null}
                {test.status === 'EXPIRED' ? (
                  <span className="text-sm text-slate-400">Window closed {formatDateTime(test.endAt)}</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
