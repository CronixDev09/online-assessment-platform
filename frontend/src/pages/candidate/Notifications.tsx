import { useEffect, useState } from 'react';
import { api, apiError } from '../../lib/api';
import { relativeTime } from '../../lib/format';
import { EmptyState, ErrorText, PageHeader, Spinner } from '../../components/ui';

interface Notification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export default function Notifications() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () =>
    api
      .get<{ notifications: Notification[] }>('/candidate/notifications')
      .then((r) => setItems(r.data.notifications))
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));

  useEffect(() => {
    void load();
  }, []);

  const markAll = async () => {
    await api.post('/candidate/notifications/read-all');
    void load();
  };

  if (loading) return <Spinner label="Loading notifications..." />;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Notifications"
        actions={
          items.some((n) => !n.isRead) ? (
            <button className="btn btn-secondary" onClick={markAll}>
              Mark all read
            </button>
          ) : undefined
        }
      />
      <ErrorText>{error}</ErrorText>
      {items.length === 0 ? (
        <EmptyState title="No notifications" />
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <div key={n.id} className={`card p-4 ${n.isRead ? '' : 'border-indigo-200 bg-indigo-50/40'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-slate-800">{n.title}</div>
                  <p className="mt-1 text-sm text-slate-500">{n.message}</p>
                </div>
                <span className="whitespace-nowrap text-xs text-slate-400">{relativeTime(n.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
