import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { EmptyState, ErrorText, PageHeader, Spinner, StatusBadge } from '../../components/ui';

interface Violation {
  id: string;
  sessionId: string;
  testId: string;
  testTitle: string;
  candidate: { id: string; name: string; email: string };
  type: string;
  severity: string;
  description: string | null;
  metadata: unknown;
  timestamp: string;
}

export default function Violations() {
  const [params, setParams] = useSearchParams();
  const testId = params.get('testId') ?? '';
  const severity = params.get('severity') ?? '';
  const [tests, setTests] = useState<{ id: string; title: string }[]>([]);
  const [rows, setRows] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ tests: { id: string; title: string }[] }>('/admin/tests').then((r) => setTests(r.data.tests));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const q = new URLSearchParams();
    if (testId) q.set('testId', testId);
    if (severity) q.set('severity', severity);
    api
      .get<{ violations: Violation[] }>(`/admin/violations?${q.toString()}`)
      .then((r) => setRows(r.data.violations))
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  }, [testId, severity]);

  useEffect(load, [load]);

  const setFilter = (key: 'testId' | 'severity', value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  return (
    <div>
      <PageHeader
        title="Violations"
        subtitle="Real proctoring signals recorded during tests."
        actions={
          testId ? (
            <button
              className="btn btn-secondary"
              onClick={() => window.open(`/api/admin/reports/export?testId=${testId}&type=violations`, '_blank')}
            >
              Export CSV
            </button>
          ) : undefined
        }
      />
      <ErrorText>{error}</ErrorText>

      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input max-w-sm" value={testId} onChange={(e) => setFilter('testId', e.target.value)}>
          <option value="">All tests</option>
          {tests.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <select className="input max-w-[180px]" value={severity} onChange={(e) => setFilter('severity', e.target.value)}>
          <option value="">All severities</option>
          {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title="No violations recorded" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3">Test</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(v.timestamp)}</td>
                  <td className="px-4 py-3 font-medium text-slate-700">{v.candidate.name}</td>
                  <td className="px-4 py-3 text-slate-600">{v.testTitle}</td>
                  <td className="px-4 py-3 text-slate-700">{v.type.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={v.severity} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">{v.description ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
