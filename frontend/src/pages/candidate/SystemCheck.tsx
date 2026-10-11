import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { Card, ErrorText, PageHeader, Spinner } from '../../components/ui';

type CheckState = 'CHECKING' | 'READY' | 'FAILED';
interface Checks {
  browser: CheckState;
  camera: CheckState;
  microphone: CheckState;
  network: CheckState;
  fullscreen: CheckState;
}

const initial: Checks = {
  browser: 'CHECKING',
  camera: 'CHECKING',
  microphone: 'CHECKING',
  network: 'CHECKING',
  fullscreen: 'CHECKING',
};

export default function SystemCheck() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [checks, setChecks] = useState<Checks>(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const runChecks = useCallback(async () => {
    setError('');
    setChecks(initial);

    const browserOk =
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof document.fullscreenEnabled !== 'undefined';

    const next: Checks = {
      browser: browserOk ? 'READY' : 'FAILED',
      fullscreen: document.fullscreenEnabled ? 'READY' : 'FAILED',
      network: navigator.onLine ? 'READY' : 'FAILED',
      camera: 'CHECKING',
      microphone: 'CHECKING',
    };
    setChecks({ ...next });

    // Camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      setChecks((c) => ({ ...c, camera: 'READY' }));
    } catch {
      setChecks((c) => ({ ...c, camera: 'FAILED' }));
    }

    // Microphone
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setChecks((c) => ({ ...c, microphone: 'READY' }));
    } catch {
      setChecks((c) => ({ ...c, microphone: 'FAILED' }));
    }
  }, []);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  const allReady =
    checks.browser === 'READY' &&
    checks.camera === 'READY' &&
    checks.microphone === 'READY' &&
    checks.network === 'READY' &&
    checks.fullscreen === 'READY';

  const begin = async () => {
    setError('');
    setBusy(true);
    try {
      // Request fullscreen within the user gesture so the browser allows it.
      await document.documentElement.requestFullscreen().catch(() => undefined);
      const { data } = await api.post<{ sessionId: string }>(`/tests/${id}/start`);
      navigate(`/attempt/${data.sessionId}`);
    } catch (e) {
      setError(apiError(e));
      setBusy(false);
    }
  };

  const rows: { key: keyof Checks; label: string; hint: string }[] = [
    { key: 'browser', label: 'Browser compatibility', hint: 'Modern browser with media and fullscreen APIs' },
    { key: 'camera', label: 'Camera', hint: 'Required for proctoring' },
    { key: 'microphone', label: 'Microphone', hint: 'Required for proctoring' },
    { key: 'network', label: 'Network connection', hint: 'Stable internet recommended' },
    { key: 'fullscreen', label: 'Fullscreen', hint: 'The test runs in fullscreen' },
  ];

  const total = Object.values(checks);
  const stillChecking = total.some((s) => s === 'CHECKING');

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="System check" subtitle="Confirm your environment before the timer starts." />

      <Card>
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => {
            const state = checks[row.key];
            return (
              <li key={row.key} className="flex items-center justify-between py-3">
                <div>
                  <div className="font-medium text-slate-800">{row.label}</div>
                  <div className="text-xs text-slate-400">{row.hint}</div>
                </div>
                <span
                  className={`badge ${
                    state === 'READY'
                      ? 'bg-emerald-100 text-emerald-700'
                      : state === 'FAILED'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {state === 'CHECKING' ? 'Checking...' : state === 'READY' ? 'Ready' : 'Failed'}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <ErrorText>{error}</ErrorText>
      {!allReady && !stillChecking ? (
        <p className="mt-3 text-sm text-amber-600">
          Resolve the failed checks and re-run. If camera or microphone is blocked, update your browser site
          permissions and reload.
        </p>
      ) : null}

      {stillChecking ? <Spinner label="Running readiness checks..." /> : null}

      <div className="mt-5 flex justify-between gap-2">
        <button className="btn btn-secondary" onClick={runChecks}>
          Re-check
        </button>
        <button className="btn btn-primary" disabled={!allReady || busy} onClick={begin}>
          {busy ? 'Starting...' : 'Begin Test'}
        </button>
      </div>
    </div>
  );
}
