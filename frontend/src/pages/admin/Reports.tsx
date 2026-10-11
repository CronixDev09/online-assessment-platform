import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { formatDuration } from '../../lib/format';
import { Card, EmptyState, ErrorText, PageHeader, Spinner, StatCard } from '../../components/ui';

interface Report {
  test: { id: string; title: string; status: string };
  summary: {
    assigned: number;
    attempted: number;
    completed: number;
    averageScore: number;
    highestScore: number;
    lowestScore: number;
    averagePercentage: number;
    passRate: number;
    averageTime: number;
  };
  questions: { questionId: string; title: string; type: string; attempts: number; correct: number; accuracy: number }[];
  coding: { submissions: number; accepted: number; acceptanceRate: number; compilationErrors: number; runtimeErrors: number };
  proctoring: { totalViolations: number; violationsByType: Record<string, number>; disqualified: number };
}

export default function AdminReports() {
  const [params, setParams] = useSearchParams();
  const testId = params.get('testId') ?? '';
  const [tests, setTests] = useState<{ id: string; title: string }[]>([]);
  const [report, setReport] = useState<Report | null>(null);
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
      .get<{ report: Report }>(`/admin/reports?testId=${testId}`)
      .then((r) => setReport(r.data.report))
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  }, [testId]);

  useEffect(load, [load]);

  const exportCsv = (type: string) =>
    window.open(`/api/admin/reports/export?testId=${testId}&type=${type}`, '_blank');

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Test, question, coding and proctoring analytics."
        actions={
          testId ? (
            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={() => exportCsv('results')}>
                Results CSV
              </button>
              <button className="btn btn-secondary" onClick={() => exportCsv('questions')}>
                Questions CSV
              </button>
              <button className="btn btn-secondary" onClick={() => exportCsv('violations')}>
                Violations CSV
              </button>
            </div>
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
        <Spinner label="Building report..." />
      ) : !report ? (
        <EmptyState title="Select a test to view its report" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Assigned" value={report.summary.assigned} hint={`${report.summary.attempted} attempted`} />
            <StatCard label="Completed" value={report.summary.completed} />
            <StatCard label="Average score" value={report.summary.averageScore} hint={`${report.summary.averagePercentage}% avg`} />
            <StatCard label="Pass rate" value={`${report.summary.passRate}%`} />
            <StatCard label="Highest" value={report.summary.highestScore} />
            <StatCard label="Lowest" value={report.summary.lowestScore} />
            <StatCard label="Average time" value={formatDuration(report.summary.averageTime)} />
            <StatCard label="Violations" value={report.proctoring.totalViolations} hint={`${report.proctoring.disqualified} disqualified`} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="p-0">
              <div className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-800">Question report</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Question</th>
                      <th className="px-4 py-2 text-right">Attempts</th>
                      <th className="px-4 py-2 text-right">Correct</th>
                      <th className="px-4 py-2 text-right">Accuracy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.questions.map((q) => (
                      <tr key={q.questionId}>
                        <td className="px-4 py-2 text-slate-700">{q.title}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{q.attempts}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{q.correct}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{q.accuracy}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="space-y-4">
              <Card>
                <h3 className="font-semibold text-slate-800">Coding report</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  <li className="flex justify-between"><span>Submissions</span><span>{report.coding.submissions}</span></li>
                  <li className="flex justify-between"><span>Accepted</span><span className="text-emerald-600">{report.coding.accepted}</span></li>
                  <li className="flex justify-between"><span>Acceptance rate</span><span>{report.coding.acceptanceRate}%</span></li>
                  <li className="flex justify-between"><span>Compilation errors</span><span className="text-amber-600">{report.coding.compilationErrors}</span></li>
                  <li className="flex justify-between"><span>Runtime errors</span><span className="text-rose-600">{report.coding.runtimeErrors}</span></li>
                </ul>
              </Card>

              <Card>
                <h3 className="font-semibold text-slate-800">Proctoring report</h3>
                {Object.keys(report.proctoring.violationsByType).length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No violations.</p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm text-slate-600">
                    {Object.entries(report.proctoring.violationsByType).map(([type, count]) => (
                      <li key={type} className="flex justify-between">
                        <span>{type.replace(/_/g, ' ')}</span>
                        <span className="font-medium">{count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
