import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { formatDuration } from '../../lib/format';
import { ErrorText, PageHeader, Spinner } from '../../components/ui';

interface Row {
  rank: number;
  candidateName: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  timeTaken: number;
  passed: boolean;
  isMe: boolean;
}

export default function CandidateLeaderboard() {
  const { testId } = useParams<{ testId: string }>();
  const [data, setData] = useState<{ title: string; leaderboard: Row[]; me: Row | null; total: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<{ test: { title: string }; leaderboard: Row[]; me: Row | null; total: number }>(`/leaderboard/${testId}`)
      .then((r) => setData({ title: r.data.test.title, leaderboard: r.data.leaderboard, me: r.data.me, total: r.data.total }))
      .catch((e) => setError(apiError(e)));
  }, [testId]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Spinner label="Loading leaderboard..." />;

  return (
    <div>
      <PageHeader
        title="Leaderboard"
        subtitle={data.title}
        actions={
          <Link to={`/candidate/leaderboard/${testId}`} className="btn btn-ghost">
            Refresh
          </Link>
        }
      />
      {data.me ? (
        <div className="mb-4 card border-indigo-200 bg-indigo-50/50 p-4 text-sm">
          You are ranked <strong>#{data.me.rank}</strong> of {data.total} with{' '}
          <strong>
            {data.me.score}/{data.me.maxScore}
          </strong>{' '}
          ({data.me.percentage}%).
        </div>
      ) : null}
      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Rank</th>
              <th className="px-4 py-3">Candidate</th>
              <th className="px-4 py-3 text-right">Score</th>
              <th className="px-4 py-3 text-right">Percentage</th>
              <th className="px-4 py-3 text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.leaderboard.map((r) => (
              <tr key={`${r.rank}-${r.candidateName}`} className={r.isMe ? 'bg-indigo-50/60' : ''}>
                <td className="px-4 py-3 font-medium text-slate-700">#{r.rank}</td>
                <td className="px-4 py-3 text-slate-700">
                  {r.candidateName} {r.isMe ? <span className="text-xs text-indigo-600">(you)</span> : null}
                </td>
                <td className="px-4 py-3 text-right text-slate-700">
                  {r.score != null ? `${r.score}/${r.maxScore}` : '-'}
                </td>
                <td className="px-4 py-3 text-right text-slate-700">{r.percentage != null ? `${r.percentage}%` : '-'}</td>
                <td className="px-4 py-3 text-right text-slate-500">{formatDuration(r.timeTaken)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
