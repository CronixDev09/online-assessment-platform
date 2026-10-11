import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, apiError } from '../lib/api';
import { ErrorText } from '../components/ui';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { data } = await api.post<{ message: string; resetToken?: string }>('/auth/forgot-password', { email });
      setMessage(data.message);
      setResetToken(data.resetToken ?? '');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold text-slate-900">Forgot password</h1>
      <p className="mt-1 text-sm text-slate-500">Request a password reset link.</p>

      <form onSubmit={submit} className="mt-6 space-y-4 card p-6">
        <ErrorText>{error}</ErrorText>
        <div>
          <label className="label">Email</label>
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Sending...' : 'Send reset link'}
        </button>
        {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
        {resetToken ? (
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-medium">Development mode: email delivery is not configured.</p>
            <p className="mt-1 break-all">Reset token: {resetToken}</p>
            <Link
              to={`/reset-password?token=${resetToken}`}
              className="mt-2 inline-block text-indigo-600 hover:underline"
            >
              Open reset page
            </Link>
          </div>
        ) : null}
        <p className="text-center text-sm">
          <Link to="/login" className="text-indigo-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
