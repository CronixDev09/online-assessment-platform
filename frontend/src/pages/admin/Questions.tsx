import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { EmptyState, ErrorText, PageHeader, Spinner, StatusBadge } from '../../components/ui';

interface Question {
  id: string;
  type: string;
  title: string;
  difficulty: string;
  category: string | null;
  tags: string | null;
  marks: number;
  status: string;
  options: { id: string }[];
  coding: { testCases: { id: string }[] } | null;
}

export default function AdminQuestions() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ type: '', difficulty: '', search: '' });

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.type) params.set('type', filters.type);
    if (filters.difficulty) params.set('difficulty', filters.difficulty);
    if (filters.search) params.set('search', filters.search);
    api
      .get<{ questions: Question[] }>(`/admin/questions?${params.toString()}`)
      .then((r) => setQuestions(r.data.questions))
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const duplicate = async (q: Question) => {
    await api.post(`/admin/questions/${q.id}/duplicate`);
    load();
  };

  const remove = async (q: Question) => {
    if (!window.confirm(`Delete/archive "${q.title}"?`)) return;
    const { data } = await api.delete<{ archived: boolean }>(`/admin/questions/${q.id}`);
    if (data.archived) window.alert('This question is used by a test, so it was archived instead of deleted.');
    load();
  };

  return (
    <div>
      <PageHeader
        title="Question bank"
        subtitle="Reusable MCQ and coding questions."
        actions={
          <Link to="/admin/questions/create" className="btn btn-primary">
            New question
          </Link>
        }
      />
      <ErrorText>{error}</ErrorText>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search title or tag..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
        <select className="input max-w-[160px]" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
          <option value="">All types</option>
          <option value="MCQ">MCQ</option>
          <option value="CODING">Coding</option>
        </select>
        <select
          className="input max-w-[160px]"
          value={filters.difficulty}
          onChange={(e) => setFilters({ ...filters, difficulty: e.target.value })}
        >
          <option value="">All difficulty</option>
          <option value="EASY">Easy</option>
          <option value="MEDIUM">Medium</option>
          <option value="HARD">Hard</option>
        </select>
      </div>

      {loading ? (
        <Spinner />
      ) : questions.length === 0 ? (
        <EmptyState title="No questions found" action={<Link to="/admin/questions/create" className="btn btn-primary">Create a question</Link>} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Difficulty</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Marks</th>
                <th className="px-4 py-3 text-right">Test cases</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {questions.map((q) => (
                <tr key={q.id}>
                  <td className="px-4 py-3 font-medium text-slate-700">{q.title}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${q.type === 'CODING' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>
                      {q.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{q.difficulty}</td>
                  <td className="px-4 py-3 text-slate-500">{q.category ?? '-'}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{q.marks}</td>
                  <td className="px-4 py-3 text-right text-slate-500">
                    {q.type === 'CODING' ? q.coding?.testCases.length ?? 0 : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={q.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2 text-xs">
                      <button className="text-indigo-600 hover:underline" onClick={() => navigate(`/admin/questions/${q.id}/edit`)}>
                        Edit
                      </button>
                      <button className="text-slate-600 hover:underline" onClick={() => duplicate(q)}>
                        Duplicate
                      </button>
                      <button className="text-rose-600 hover:underline" onClick={() => remove(q)}>
                        Delete
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
