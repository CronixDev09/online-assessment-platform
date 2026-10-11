export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  const diff = Date.now() - d.getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export function statusClasses(status: string | null | undefined): string {
  switch ((status ?? '').toUpperCase()) {
    case 'ACCEPTED':
    case 'CORRECT':
    case 'COMPLETED':
    case 'ACTIVE':
    case 'SUBMITTED':
    case 'PASS':
      return 'bg-emerald-100 text-emerald-700';
    case 'WRONG_ANSWER':
    case 'INCORRECT':
    case 'RUNTIME_ERROR':
    case 'DISQUALIFIED':
    case 'FAIL':
    case 'TERMINATED':
      return 'bg-rose-100 text-rose-700';
    case 'COMPILATION_ERROR':
    case 'TIME_LIMIT_EXCEEDED':
    case 'MEMORY_LIMIT_EXCEEDED':
    case 'EXPIRED':
    case 'WARNING':
    case 'HIGH':
      return 'bg-amber-100 text-amber-700';
    case 'IN_PROGRESS':
    case 'MEDIUM':
      return 'bg-sky-100 text-sky-700';
    case 'UPCOMING':
    case 'SCHEDULED':
    case 'DRAFT':
    case 'LOW':
      return 'bg-slate-100 text-slate-600';
    case 'CRITICAL':
      return 'bg-red-200 text-red-800';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}
