import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { formatDateTime, relativeTime } from '../../lib/format';
import { Card, ErrorText, PageHeader, Spinner, StatCard, StatusBadge } from '../../components/ui';

interface TestDetailResponse {
  test: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    category: string | null;
    durationMinutes: number;
    totalMarks: number;
    passingMarks: number;
    proctoringEnabled: boolean;
    leaderboardEnabled: boolean;
    negativeMarkingEnabled: boolean;
    startAt: string | null;
    endAt: string | null;
    testQuestions: { id: string; question: { id: string; type: string; title: string; marks: number; difficulty: string } }[];
    assignments: { id: string; candidate: { id: string; name: string; email: string; status: string } }[];
    _count: { sessions: number };
  };
}

interface ActivityLog {
  id: string;
  candidateId: string | null;
  eventType: string;
  severity: string | null;
  timestamp: string;
  metadata: unknown;
}

export default function AdminTestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<TestDetailResponse | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    api
      .get<TestDetailResponse>(`/admin/tests/${id}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
    api
      .get<{ logs: ActivityLog[] }>(`/admin/tests/${id}/activity`)
      .then((r) => setLogs(r.data.logs))
      .catch(() => undefined);
  };

  useEffect(load, [id]);

  const publish = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/tests/${id}/publish`, {});
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Spinner label="Loading test..." />;

  const { test } = data;
  const mcq = test.testQuestions.filter((tq) => tq.question.type === 'MCQ').length;
  const coding = test.testQuestions.length - mcq;

  return (
    <div>
      <PageHeader
        title={test.title}
        subtitle={test.category ?? undefined}
        actions={
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => navigate(`/admin/tests/${test.id}/edit`)}>
              Edit
            </button>
            {test.status !== 'ACTIVE' ? (
              <button className="btn btn-primary" onClick={publish} disabled={busy}>
                Publish
              </button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Status" value={<StatusBadge status={test.status} />} />
        <StatCard label="Questions" value={`${test.testQuestions.length} (${mcq} MCQ, ${coding} code)`} />
        <StatCard label="Total marks" value={test.totalMarks} hint={`Pass: ${test.passingMarks}`} />
        <StatCard label="Assigned" value={test.assignments.length} hint={`${test._count.sessions} attempts`} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link to={`/admin/monitoring`} className="btn btn-secondary">
          Live monitoring
        </Link>
        <Link to={`/admin/results?testId=${test.id}`} className="btn btn-secondary">
          Results
        </Link>
        <Link to={`/admin/reports?testId=${test.id}`} className="btn btn-secondary">
          Reports
        </Link>
        <Link to={`/admin/leaderboard?testId=${test.id}`} className="btn btn-secondary">
          Leaderboard
        </Link>
        <Link to={`/admin/violations?testId=${test.id}`} className="btn btn-secondary">
          Violations
        </Link>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-0">
          <div className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-800">Questions</div>
          <ul className="divide-y divide-slate-100">
            {test.testQuestions.length === 0 ? (
              <li className="px-5 py-4 text-sm text-slate-400">No questions added.</li>
            ) : (
              test.testQuestions.map((tq, i) => (
                <li key={tq.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="text-slate-700">
                    <span className="mr-2 text-slate-400">{i + 1}.</span>
                    {tq.question.title}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`badge ${tq.question.type === 'CODING' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>
                      {tq.question.type}
                    </span>
                    <span className="text-slate-400">{tq.question.marks}m</span>
                  </span>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card className="p-0">
          <div className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-800">
            Assigned candidates ({test.assignments.length})
          </div>
          <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
            {test.assignments.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <Link to={`/admin/users/${a.candidate.id}`} className="text-slate-700 hover:text-indigo-600">
                  {a.candidate.name}
                </Link>
                <StatusBadge status={a.candidate.status} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-4 p-0">
        <div className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-800">Recent activity</div>
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto text-sm">
          {logs.length === 0 ? (
            <li className="px-5 py-4 text-slate-400">No activity recorded.</li>
          ) : (
            logs.slice(0, 50).map((l) => (
              <li key={l.id} className="flex items-center justify-between px-5 py-2">
                <span className="text-slate-700">{l.eventType.replace(/_/g, ' ')}</span>
                <span className="flex items-center gap-2 text-xs text-slate-400">
                  {l.severity ? <StatusBadge status={l.severity} /> : null}
                  {relativeTime(l.timestamp)}
                </span>
              </li>
            ))
          )}
        </ul>
      </Card>

      <p className="mt-4 text-xs text-slate-400">
        Window: {formatDateTime(test.startAt)} &rarr; {formatDateTime(test.endAt)}
      </p>
    </div>
  );
}
