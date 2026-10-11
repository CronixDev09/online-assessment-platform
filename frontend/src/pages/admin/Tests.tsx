import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { EmptyState, ErrorText, PageHeader, Spinner, StatusBadge } from '../../components/ui';

interface Test {
  id: string;
  title: string;
  category: string | null;
  status: string;
  durationMinutes: number;
  totalMarks: number;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  _count: { testQuestions: number; assignments: number; sessions: number };
}

export default function AdminTests() {
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api
      .get<{ tests: Test[] }>('/admin/tests')
      .then((r) => setTests(r.data.tests))
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const archive = async (t: Test) => {
    if (!window.confirm(`Archive "${t.title}"?`)) return;
    await api.delete(`/admin/tests/${t.id}`);
    load();
  };

  return (
    <div>
      <PageHeader
        title="Tests"
        subtitle="Create, configure and publish assessments."
        actions={
          <Link to="/admin/tests/create" className="btn btn-primary">
            Create test
          </Link>
        }
      />
      <ErrorText>{error}</ErrorText>
      {loading ? (
        <Spinner />
      ) : tests.length === 0 ? (
        <EmptyState title="No tests yet" action={<Link to="/admin/tests/create" className="btn btn-primary">Create a test</Link>} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Questions</th>
                <th className="px-4 py-3 text-right">Assigned</th>
                <th className="px-4 py-3 text-right">Attempts</th>
                <th className="px-4 py-3 text-right">Marks</th>
                <th className="px-4 py-3">Window</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tests.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-medium text-slate-700">
                    <Link to={`/admin/tests/${t.id}`} className="hover:text-indigo-600">
                      {t.title}
                    </Link>
                    <div className="text-xs text-slate-400">{t.category ?? ''}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{t._count.testQuestions}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{t._count.assignments}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{t._count.sessions}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{t.totalMarks}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {t.startAt || t.endAt ? (
                      <>
                        {formatDateTime(t.startAt)} &rarr; {formatDateTime(t.endAt)}
                      </>
                    ) : (
                      'Always open'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2 text-xs">
                      <Link to={`/admin/tests/${t.id}`} className="text-indigo-600 hover:underline">
                        Manage
                      </Link>
                      <Link to={`/admin/tests/${t.id}/edit`} className="text-slate-600 hover:underline">
                        Edit
                      </Link>
                      <button className="text-rose-600 hover:underline" onClick={() => archive(t)}>
                        Archive
                      </button>
                    </div>
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
