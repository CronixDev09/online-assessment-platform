import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { formatDuration } from '../../lib/format';
import { EmptyState, ErrorText, PageHeader, Spinner, StatusBadge } from '../../components/ui';

interface Row {
  rank: number;
  candidate: { id: string; name: string; email: string };
  score: number;
  maxScore: number;
  percentage: number;
  codingScore: number;
  timeTaken: number;
  status: string;
  passed: boolean;
}

export default function AdminLeaderboard() {
  const [params, setParams] = useSearchParams();
  const testId = params.get('testId') ?? '';
  const [tests, setTests] = useState<{ id: string; title: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ tests: { id: string; title: string }[] }>('/admin/tests').then((r) => {
      setTests(r.data.tests);
      if (!testId && r.data.tests.length > 0) setParams({ testId: r.data.tests[0].id });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(() => {
    if (!testId) return;
    setLoading(true);
    api
      .get<{ leaderboard: Row[] }>(`/admin/leaderboard?testId=${testId}`)
      .then((r) => setRows(r.data.leaderboard))
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  }, [testId]);

  useEffect(load, [load]);

  return (
    <div>
      <PageHeader
        title="Leaderboard"
        subtitle="Rankings use score, then coding score, then completion time."
        actions={
          testId ? (
            <button
              className="btn btn-secondary"
              onClick={() => window.open(`/api/admin/reports/export?testId=${testId}&type=results`, '_blank')}
            >
              Export CSV
            </button>
          ) : undefined
        }
      />
      <ErrorText>{error}</ErrorText>

      <div className="mb-4">
        <select className="input max-w-md" value={testId} onChange={(e) => setParams({ testId: e.target.value })}>
          <option value="">Select a test...</option>
          {tests.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title="No results for this test yet" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3 text-right">Score</th>
                <th className="px-4 py-3 text-right">Coding</th>
                <th className="px-4 py-3 text-right">%</th>
                <th className="px-4 py-3 text-right">Time</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={`${r.rank}-${r.candidate.id}`}>
                  <td className="px-4 py-3 font-medium text-slate-700">#{r.rank}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {r.candidate.name}
                    <div className="text-xs text-slate-400">{r.candidate.email}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{r.score}/{r.maxScore}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{r.codingScore}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{r.percentage}%</td>
                  <td className="px-4 py-3 text-right text-slate-500">{formatDuration(r.timeTaken)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
