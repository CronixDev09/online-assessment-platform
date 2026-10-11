import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { formatClock, relativeTime } from '../../lib/format';
import { EmptyState, ErrorText, PageHeader, Spinner, StatusBadge } from '../../components/ui';

interface ActiveSession {
  sessionId: string;
  candidate: { id: string; name: string; email: string };
  test: { id: string; title: string };
  startedAt: string;
  expiresAt: string;
  remainingSeconds: number;
  lastHeartbeatAt: string | null;
  connected: boolean;
  violationCount: number;
  highestSeverity: string | null;
}

export default function Monitoring() {
  const [active, setActive] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [busyId, setBusyId] = useState('');

  const load = () => {
    api
      .get<{ active: ActiveSession[] }>('/admin/monitoring')
      .then((r) => {
        setActive(r.data.active);
        setLastUpdated(new Date());
      })
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const t = window.setInterval(load, 10_000);
    return () => window.clearInterval(t);
  }, []);

  const terminate = async (s: ActiveSession) => {
    if (!window.confirm(`Terminate ${s.candidate.name}'s session? Their current work will be submitted.`)) return;
    setBusyId(s.sessionId);
    try {
      await api.post(`/admin/sessions/${s.sessionId}/terminate`, {});
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusyId('');
    }
  };

  return (
    <div>
      <PageHeader
        title="Live monitoring"
        subtitle={lastUpdated ? `Auto-refreshing · updated ${relativeTime(lastUpdated)}` : 'Active exam sessions'}
        actions={
          <button className="btn btn-secondary" onClick={load}>
            Refresh now
          </button>
        }
      />
      <ErrorText>{error}</ErrorText>
      {loading ? (
        <Spinner label="Loading active sessions..." />
      ) : active.length === 0 ? (
        <EmptyState title="No candidates are taking a test right now" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3">Test</th>
                <th className="px-4 py-3">Time left</th>
                <th className="px-4 py-3">Connection</th>
                <th className="px-4 py-3">Violations</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {active.map((s) => (
                <tr key={s.sessionId}>
                  <td className="px-4 py-3">
                    <Link to={`/admin/users/${s.candidate.id}`} className="font-medium text-slate-700 hover:text-indigo-600">
                      {s.candidate.name}
                    </Link>
                    <div className="text-xs text-slate-400">{s.candidate.email}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.test.title}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{formatClock(s.remainingSeconds)}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${s.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {s.connected ? 'Online' : 'Disconnected'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={s.violationCount > 0 ? 'font-medium text-amber-600' : 'text-slate-500'}>
                      {s.violationCount}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.highestSeverity ?? 'IN_PROGRESS'} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2 text-xs">
                      <Link to={`/admin/violations?testId=${s.test.id}`} className="text-slate-600 hover:underline">
                        Violations
                      </Link>
                      <button className="text-rose-600 hover:underline" onClick={() => terminate(s)} disabled={busyId === s.sessionId}>
                        {busyId === s.sessionId ? 'Terminating...' : 'Terminate'}
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
