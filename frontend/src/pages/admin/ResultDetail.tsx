import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { formatDateTime, formatDuration } from '../../lib/format';
import { Card, ErrorText, PageHeader, Spinner, StatCard, StatusBadge } from '../../components/ui';

interface Detail {
  questionId: string;
  title: string;
  type: string;
  status: string;
  score: number;
  marks: number;
  passedCases?: number;
  totalCases?: number;
}

interface Violation {
  id: string;
  type: string;
  severity: string;
  description: string | null;
  timestamp: string;
  metadata: unknown;
}

interface Result {
  id: string;
  testTitle: string;
  candidate: { name: string; email: string };
  score: number;
  maxScore: number;
  mcqScore: number;
  codingScore: number;
  percentage: number;
  rank: number | null;
  passed: boolean;
  timeTaken: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  codingAttempted: number;
  codingCasesPassed: number;
  codingCasesTotal: number;
  violationCount: number;
  details: Detail[];
  violations: Violation[];
}

export default function AdminResultDetail() {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<{ result: Result }>(`/admin/results/${id}`)
      .then((r) => setResult(r.data.result))
      .catch((e) => setError(apiError(e)));
  }, [id]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!result) return <Spinner label="Loading result..." />;

  return (
    <div>
      <PageHeader
        title={`${result.candidate.name} — ${result.testTitle}`}
        subtitle={result.candidate.email}
        actions={
          <Link to="/admin/results" className="btn btn-ghost">
            Back
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Score" value={`${result.score} / ${result.maxScore}`} hint={`${result.percentage}%`} />
        <StatCard label="MCQ / Coding" value={`${result.mcqScore} / ${result.codingScore}`} />
        <StatCard label="Outcome" value={result.passed ? 'Passed' : 'Failed'} hint={result.rank ? `Rank #${result.rank}` : undefined} />
        <StatCard label="Time taken" value={formatDuration(result.timeTaken)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <h3 className="font-semibold text-slate-800">Breakdown</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li className="flex justify-between"><span>Correct</span><span className="text-emerald-600">{result.correctCount}</span></li>
            <li className="flex justify-between"><span>Incorrect</span><span className="text-rose-600">{result.incorrectCount}</span></li>
            <li className="flex justify-between"><span>Unanswered</span><span>{result.unansweredCount}</span></li>
            <li className="flex justify-between"><span>Coding attempted</span><span>{result.codingAttempted}</span></li>
            <li className="flex justify-between"><span>Cases passed</span><span>{result.codingCasesPassed}/{result.codingCasesTotal}</span></li>
            <li className="flex justify-between"><span>Violations</span><span className="text-amber-600">{result.violationCount}</span></li>
          </ul>
        </Card>

        <div className="lg:col-span-2">
          <Card className="p-0">
            <div className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-800">Question analysis</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Question</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.details.map((d, i) => (
                    <tr key={d.questionId}>
                      <td className="px-4 py-2 text-slate-700">Q{i + 1}. {d.title}</td>
                      <td className="px-4 py-2 text-slate-500">{d.type}</td>
                      <td className="px-4 py-2"><StatusBadge status={d.status} /></td>
                      <td className="px-4 py-2 text-right text-slate-700">{d.score}/{d.marks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-4 p-0">
        <div className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-800">
          Violations ({result.violations.length})
        </div>
        <ul className="divide-y divide-slate-100 text-sm">
          {result.violations.length === 0 ? (
            <li className="px-5 py-4 text-slate-400">No violations recorded.</li>
          ) : (
            result.violations.map((v) => (
              <li key={v.id} className="flex items-center justify-between px-5 py-2.5">
                <div>
                  <span className="font-medium text-slate-700">{v.type.replace(/_/g, ' ')}</span>
                  {v.description ? <span className="ml-2 text-slate-400">{v.description}</span> : null}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={v.severity} />
                  <span className="text-xs text-slate-400">{formatDateTime(v.timestamp)}</span>
                </div>
              </li>
            ))
          )}
        </ul>
      </Card>
    </div>
  );
}
