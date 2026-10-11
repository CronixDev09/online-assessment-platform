import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { Card, ErrorText, PageHeader, Spinner, StatusBadge } from '../../components/ui';

interface UserDetailResponse {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    phone: string | null;
    organization: string | null;
    candidateCode: string | null;
    createdAt: string;
  };
  assignments: { id: string; testId: string; testTitle: string; testStatus: string; status: string; assignedAt: string }[];
  sessions: {
    sessionId: string;
    testId: string;
    testTitle: string;
    attempt: number;
    status: string;
    submissionReason: string | null;
    startedAt: string;
    submittedAt: string | null;
    score: number | null;
    maxScore: number | null;
    percentage: number | null;
    resultId: string | null;
  }[];
}

export default function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<UserDetailResponse | null>(null);
  const [error, setError] = useState('');
  const [resetTestId, setResetTestId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get<UserDetailResponse>(`/admin/users/${id}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, [id]);

  useEffect(load, [load]);

  const resetAttempt = async () => {
    if (!resetTestId) return;
    if (!window.confirm('Reset this candidate attempt? All sessions, answers, submissions and results for this test will be deleted.')) return;
    setBusy(true);
    try {
      await api.post(`/admin/users/${id}/reset-attempt`, { testId: resetTestId });
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Spinner label="Loading user..." />;

  const { user, assignments, sessions } = data;

  return (
    <div>
      <PageHeader
        title={user.name}
        subtitle={user.email}
        actions={
          <Link to="/admin/users" className="btn btn-ghost">
            Back to users
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h3 className="font-semibold text-slate-800">Account</h3>
          <dl className="mt-3 space-y-2 text-sm">
            {[
              ['Role', user.role],
              ['Status', user.status],
              ['Candidate code', user.candidateCode ?? '-'],
              ['Phone', user.phone ?? '-'],
              ['Organization', user.organization ?? '-'],
              ['Created', formatDateTime(user.createdAt)],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between">
                <dt className="text-slate-500">{k}</dt>
                <dd className="font-medium text-slate-700">{v as string}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <h3 className="font-semibold text-slate-800">Assigned tests</h3>
          {assignments.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No tests assigned.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {assignments.map((a) => (
                <Link
                  key={a.id}
                  to={`/admin/tests/${a.testId}`}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  {a.testTitle} <StatusBadge status={a.status} />
                </Link>
              ))}
            </div>
          )}

          <div className="mt-5 border-t border-slate-100 pt-4">
            <h4 className="text-sm font-medium text-slate-700">Reset an attempt</h4>
            <div className="mt-2 flex flex-wrap gap-2">
              <select className="input max-w-xs" value={resetTestId} onChange={(e) => setResetTestId(e.target.value)}>
                <option value="">Select a test...</option>
                {assignments.map((a) => (
                  <option key={a.testId} value={a.testId}>
                    {a.testTitle}
                  </option>
                ))}
              </select>
              <button className="btn btn-danger" disabled={!resetTestId || busy} onClick={resetAttempt}>
                {busy ? 'Resetting...' : 'Reset attempt'}
              </button>
            </div>
          </div>
        </Card>
      </div>

      <h3 className="mb-3 mt-6 font-semibold text-slate-800">Attempt history</h3>
      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Test</th>
              <th className="px-4 py-3">Attempt</th>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Score</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                  No attempts yet.
                </td>
              </tr>
            ) : (
              sessions.map((s) => (
                <tr key={s.sessionId}>
                  <td className="px-4 py-3 text-slate-700">{s.testTitle}</td>
                  <td className="px-4 py-3 text-slate-500">#{s.attempt}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(s.startedAt)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(s.submittedAt)}</td>
                  <td className="px-4 py-3 text-slate-500">{s.submissionReason?.replace(/_/g, ' ') ?? '-'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {s.score != null ? `${s.score}/${s.maxScore} (${s.percentage}%)` : '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.resultId ? (
                      <Link to={`/admin/results/${s.resultId}`} className="text-indigo-600 hover:underline">
                        Result
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
