import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { formatDuration } from '../../lib/format';
import { Card, ErrorText, PageHeader, Spinner, StatCard, StatusBadge } from '../../components/ui';

interface Detail {
  questionId: string;
  title: string;
  type: string;
  status: string;
  score: number;
  marks: number;
  selectedOptionIds?: string[];
  correctOptionIds?: string[];
  passedCases?: number;
  totalCases?: number;
}

interface Result {
  id: string;
  sessionId: string;
  testId: string;
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
  status: string;
  submissionReason: string | null;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  codingAttempted: number;
  codingCasesPassed: number;
  codingCasesTotal: number;
  violationCount: number;
  showAnswerKey: boolean;
  details: Detail[];
}

export default function CandidateResultDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<{ result: Result }>(`/sessions/${sessionId}/result`)
      .then((r) => setResult(r.data.result))
      .catch((e) => setError(apiError(e)));
  }, [sessionId]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!result) return <Spinner label="Loading result..." />;

  return (
    <div>
      <PageHeader
        title={result.testTitle}
        subtitle={`Submitted ${result.submissionReason ? `(${result.submissionReason.replace(/_/g, ' ').toLowerCase()})` : ''}`}
        actions={
          <div className="flex gap-2">
            <Link to={`/candidate/leaderboard/${result.testId}`} className="btn btn-secondary">
              Leaderboard
            </Link>
            <Link to="/candidate/results" className="btn btn-ghost">
              All results
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Score" value={`${result.score} / ${result.maxScore}`} hint={`${result.percentage}%`} />
        <StatCard
          label="Outcome"
          value={result.passed ? 'Passed' : 'Failed'}
          hint={result.rank ? `Rank #${result.rank}` : undefined}
        />
        <StatCard label="MCQ / Coding" value={`${result.mcqScore} / ${result.codingScore}`} />
        <StatCard label="Time taken" value={formatDuration(result.timeTaken)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <h3 className="font-semibold text-slate-800">Performance</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li className="flex justify-between">
              <span>MCQ correct</span>
              <span className="font-medium text-emerald-600">{result.correctCount}</span>
            </li>
            <li className="flex justify-between">
              <span>MCQ incorrect</span>
              <span className="font-medium text-rose-600">{result.incorrectCount}</span>
            </li>
            <li className="flex justify-between">
              <span>Unanswered</span>
              <span className="font-medium text-slate-500">{result.unansweredCount}</span>
            </li>
            <li className="flex justify-between">
              <span>Coding attempted</span>
              <span className="font-medium">{result.codingAttempted}</span>
            </li>
            <li className="flex justify-between">
              <span>Test cases passed</span>
              <span className="font-medium">
                {result.codingCasesPassed}/{result.codingCasesTotal}
              </span>
            </li>
            <li className="flex justify-between">
              <span>Violations</span>
              <span className="font-medium text-amber-600">{result.violationCount}</span>
            </li>
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
                    <th className="px-4 py-2 text-right">Marks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.details.map((d, i) => (
                    <tr key={d.questionId}>
                      <td className="px-4 py-2 text-slate-700">
                        Q{i + 1}. {d.title}
                        {d.type === 'CODING' && d.totalCases != null ? (
                          <span className="ml-2 text-xs text-slate-400">
                            {d.passedCases}/{d.totalCases} cases
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 text-slate-500">{d.type}</td>
                      <td className="px-4 py-2">
                        <StatusBadge status={d.status} />
                      </td>
                      <td className="px-4 py-2 text-right text-slate-700">{d.score}</td>
                      <td className="px-4 py-2 text-right text-slate-400">{d.marks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!result.showAnswerKey ? (
              <p className="px-5 py-3 text-xs text-slate-400">
                Answer keys are hidden for this test. Your responses were evaluated on the server.
              </p>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
