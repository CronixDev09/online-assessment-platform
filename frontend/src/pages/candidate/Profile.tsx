import { useEffect, useState } from 'react';
import { api, apiError } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { Card, ErrorText, PageHeader, Spinner } from '../../components/ui';

interface Profile {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  phone: string | null;
  organization: string | null;
  candidateCode: string | null;
  createdAt: string;
}

export default function Profile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<{ user: Profile }>('/candidate/profile')
      .then((r) => setProfile(r.data.user))
      .catch((e) => setError(apiError(e)));
  }, []);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!profile) return <Spinner label="Loading profile..." />;

  const rows: [string, string][] = [
    ['Name', profile.name],
    ['Email', profile.email],
    ['Role', profile.role],
    ['Status', profile.status],
    ['Candidate ID', profile.candidateCode ?? '-'],
    ['Phone', profile.phone ?? '-'],
    ['Organization', profile.organization ?? '-'],
    ['Member since', formatDate(profile.createdAt)],
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Profile" subtitle="Your account details." />
      <Card>
        <dl className="divide-y divide-slate-100">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-3 text-sm">
              <dt className="text-slate-500">{k}</dt>
              <dd className="font-medium text-slate-700">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
