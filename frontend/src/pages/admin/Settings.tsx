import { useEffect, useState } from 'react';
import { api, apiError } from '../../lib/api';
import { Card, ErrorText, PageHeader, Spinner } from '../../components/ui';

interface PolicyEntry {
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  warnAfter: number;
  disqualifyAfter: number | null;
  pauseTest: boolean;
  autoSubmit: boolean;
}
type Policy = Record<string, PolicyEntry>;

interface LeaderboardConfig {
  publicLeaderboard: boolean;
  maskNames: boolean;
  topN: number | null;
  showScores: boolean;
}

const SEVERITIES: PolicyEntry['severity'][] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export default function AdminSettings() {
  const [policy, setPolicy] = useState<Policy>({});
  const [config, setConfig] = useState<LeaderboardConfig>({ publicLeaderboard: true, maskNames: false, topN: null, showScores: true });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api
      .get<{ violationPolicy: Policy; leaderboardConfig: LeaderboardConfig }>('/admin/settings')
      .then((r) => {
        setPolicy(r.data.violationPolicy);
        setConfig(r.data.leaderboardConfig);
      })
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  }, []);

  const updateEntry = (type: string, patch: Partial<PolicyEntry>) =>
    setPolicy((p) => ({ ...p, [type]: { ...p[type], ...patch } }));

  const savePolicy = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.put('/admin/settings/violation-policy', policy);
      setMessage('Violation policy saved.');
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const saveConfig = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.put('/admin/settings/leaderboard', config);
      setMessage('Leaderboard settings saved.');
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner label="Loading settings..." />;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Proctoring thresholds and leaderboard visibility." />
      <ErrorText>{error}</ErrorText>
      {message ? <p className="mb-3 text-sm text-emerald-600">{message}</p> : null}

      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div>
            <h3 className="font-semibold text-slate-800">Violation policy</h3>
            <p className="text-xs text-slate-500">Warn and disqualify thresholds per event type. These are data-driven, not hard-coded.</p>
          </div>
          <button className="btn btn-primary" onClick={savePolicy} disabled={busy}>
            Save policy
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Event</th>
                <th className="px-4 py-2">Severity</th>
                <th className="px-4 py-2 text-right">Warn after</th>
                <th className="px-4 py-2 text-right">Disqualify after</th>
                <th className="px-4 py-2 text-center">Pause test</th>
                <th className="px-4 py-2 text-center">Auto-submit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(policy).map(([type, entry]) => (
                <tr key={type}>
                  <td className="px-4 py-2 font-medium text-slate-700">{type.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2">
                    <select className="input py-1" value={entry.severity} onChange={(e) => updateEntry(type, { severity: e.target.value as PolicyEntry['severity'] })}>
                      {SEVERITIES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number"
                      className="input w-20 py-1 text-right"
                      value={entry.warnAfter}
                      onChange={(e) => updateEntry(type, { warnAfter: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number"
                      className="input w-20 py-1 text-right"
                      placeholder="never"
                      value={entry.disqualifyAfter ?? ''}
                      onChange={(e) => updateEntry(type, { disqualifyAfter: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input type="checkbox" checked={entry.pauseTest} onChange={(e) => updateEntry(type, { pauseTest: e.target.checked })} />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input type="checkbox" checked={entry.autoSubmit} onChange={(e) => updateEntry(type, { autoSubmit: e.target.checked })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Leaderboard visibility</h3>
          <button className="btn btn-primary" onClick={saveConfig} disabled={busy}>
            Save settings
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={config.publicLeaderboard} onChange={(e) => setConfig({ ...config, publicLeaderboard: e.target.checked })} />
            Show leaderboard to candidates
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={config.maskNames} onChange={(e) => setConfig({ ...config, maskNames: e.target.checked })} />
            Mask candidate names
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={config.showScores} onChange={(e) => setConfig({ ...config, showScores: e.target.checked })} />
            Show scores
          </label>
          <div>
            <label className="label">Top N (blank = all)</label>
            <input
              type="number"
              className="input"
              value={config.topN ?? ''}
              onChange={(e) => setConfig({ ...config, topN: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
