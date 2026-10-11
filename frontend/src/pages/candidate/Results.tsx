import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { EmptyState, ErrorText, PageHeader, Spinner, StatusBadge } from '../../components/ui';

interface Submission {
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
  passed: boolean | null;
}

export default function CandidateResults() {
  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<{ submissions: Submission[] }>('/candidate/submissions')
      .then((r) => setRows(r.data.submissions))
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner label="Loading results..." />;

  return (
    <div>
      <PageHeader title="Results" subtitle="Scores from your completed attempts." />
      <ErrorText>{error}</ErrorText>
      {rows.length === 0 ? (
        <EmptyState title="No results yet" message="Complete an assessment to see your score here." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Test</th>
                <th className="px-4 py-3">Attempt</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Percentage</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.sessionId}>
                  <td className="px-4 py-3 font-medium text-slate-700">{s.testTitle}</td>
                  <td className="px-4 py-3 text-slate-500">#{s.attempt}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {s.score != null ? `${s.score} / ${s.maxScore}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{s.percentage != null ? `${s.percentage}%` : '-'}</td>
                  <td className="px-4 py-3">
                    {s.passed == null ? (
                      <span className="text-slate-400">-</span>
                    ) : (
                      <StatusBadge status={s.passed ? 'PASS' : 'FAIL'} />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(s.submittedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {s.score != null ? (
                      <Link to={`/candidate/results/${s.sessionId}`} className="text-indigo-600 hover:underline">
                        View
                      </Link>
                    ) : null}
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
