import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, apiError } from '../../lib/api';
import { Card, ErrorText, PageHeader, Spinner, StatCard, StatusBadge } from '../../components/ui';

interface Dashboard {
  kpis: {
    totalCandidates: number;
    activeTests: number;
    upcomingTests: number;
    completedTests: number;
    activeCandidates: number;
    totalSubmissions: number;
    totalViolations: number;
    averageScore: number;
    resultCount: number;
    codingAcceptanceRate: number;
  };
  charts: {
    participation: { testId: string; title: string; status: string; assigned: number; attempted: number; completed: number }[];
    passFail: { passed: number; failed: number };
    violationsOverTime: { date: string; count: number }[];
  };
}

const PIE_COLORS = ['#10b981', '#f43f5e'];

export default function AdminDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<Dashboard>('/admin/dashboard')
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Spinner label="Loading dashboard..." />;

  const { kpis, charts } = data;
  const passFailData = [
    { name: 'Passed', value: charts.passFail.passed },
    { name: 'Failed', value: charts.passFail.failed },
  ];

  return (
    <div>
      <PageHeader
        title="Admin dashboard"
        subtitle="Platform health, assessments and proctoring at a glance."
        actions={
          <Link to="/admin/tests/create" className="btn btn-primary">
            Create test
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Candidates" value={kpis.totalCandidates} />
        <StatCard label="Active tests" value={kpis.activeTests} hint={`${kpis.upcomingTests} upcoming`} />
        <StatCard label="Live candidates" value={kpis.activeCandidates} hint={`${kpis.totalSubmissions} submissions`} />
        <StatCard label="Avg score" value={`${kpis.averageScore}%`} hint={`${kpis.resultCount} results`} />
        <StatCard label="Violations" value={kpis.totalViolations} />
        <StatCard label="Coding acceptance" value={`${kpis.codingAcceptanceRate}%`} />
        <StatCard label="Completed tests" value={kpis.completedTests} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h3 className="mb-4 font-semibold text-slate-800">Test participation</h3>
          {charts.participation.length === 0 ? (
            <p className="text-sm text-slate-500">No tests yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={charts.participation}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="title" tick={{ fontSize: 11 }} interval={0} angle={-12} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="assigned" fill="#6366f1" name="Assigned" />
                <Bar dataKey="attempted" fill="#22c55e" name="Attempted" />
                <Bar dataKey="completed" fill="#0ea5e9" name="Completed" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <h3 className="mb-4 font-semibold text-slate-800">Pass / fail</h3>
          {kpis.resultCount === 0 ? (
            <p className="text-sm text-slate-500">No results yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={passFailData} dataKey="value" nameKey="name" outerRadius={90} label>
                  {passFailData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="lg:col-span-3">
          <h3 className="mb-4 font-semibold text-slate-800">Violations over time (14 days)</h3>
          {charts.violationsOverTime.length === 0 ? (
            <p className="text-sm text-slate-500">No violations recorded.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={charts.violationsOverTime}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <h3 className="mb-3 font-semibold text-slate-800">Recent tests</h3>
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Test</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Assigned</th>
                <th className="px-4 py-3 text-right">Attempted</th>
                <th className="px-4 py-3 text-right">Completed</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {charts.participation.map((p) => (
                <tr key={p.testId}>
                  <td className="px-4 py-3 font-medium text-slate-700">{p.title}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{p.assigned}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{p.attempted}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{p.completed}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/admin/tests/${p.testId}`} className="text-indigo-600 hover:underline">
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
