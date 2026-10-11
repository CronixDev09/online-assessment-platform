import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { formatDuration } from '../../lib/format';
import { EmptyState, ErrorText, PageHeader, Spinner, StatusBadge } from '../../components/ui';

interface ResultRow {
  id: string;
  sessionId: string;
  testId: string;
  testTitle: string;
  candidate: { id: string; name: string; email: string };
  score: number;
  maxScore: number;
  percentage: number;
  rank: number | null;
  passed: boolean;
  timeTaken: number;
  violationCount: number;
  status: string;
  submissionReason: string | null;
}

export default function AdminResults() {
  const [params, setParams] = useSearchParams();
  const testId = params.get('testId') ?? '';
  const [tests, setTests] = useState<{ id: string; title: string }[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ tests: { id: string; title: string }[] }>('/admin/tests').then((r) => setTests(r.data.tests));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<{ results: ResultRow[] }>(`/admin/results${testId ? `?testId=${testId}` : ''}`)
      .then((r) => setResults(r.data.results))
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  }, [testId]);

  useEffect(load, [load]);

  return (
    <div>
      <PageHeader
        title="Results"
        subtitle="Automatically evaluated scores."
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
        <select className="input max-w-md" value={testId} onChange={(e) => setParams(e.target.value ? { testId: e.target.value } : {})}>
          <option value="">All tests</option>
          {tests.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <Spinner />
      ) : results.length === 0 ? (
        <EmptyState title="No results found" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3">Test</th>
                <th className="px-4 py-3 text-right">Score</th>
                <th className="px-4 py-3 text-right">%</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3 text-right">Time</th>
                <th className="px-4 py-3 text-right">Violations</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-slate-500">{r.rank ?? '-'}</td>
                  <td className="px-4 py-3 font-medium text-slate-700">{r.candidate.name}</td>
                  <td className="px-4 py-3 text-slate-600">{r.testTitle}</td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {r.score}/{r.maxScore}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{r.percentage}%</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.passed ? 'PASS' : 'FAIL'} />
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">{formatDuration(r.timeTaken)}</td>
                  <td className="px-4 py-3 text-right text-amber-600">{r.violationCount}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/admin/results/${r.id}`} className="text-indigo-600 hover:underline">
                      Details
                    </Link>
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
