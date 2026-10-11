import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiError } from '../lib/api';
import { ErrorText } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(email, password);
      const fallback = user.role === 'ADMIN' ? '/admin' : '/candidate/dashboard';
      navigate(location.state?.from ?? fallback, { replace: true });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
      <p className="mt-1 text-sm text-slate-500">Access your assessments and results.</p>

      <form onSubmit={submit} className="mt-6 space-y-4 card p-6">
        <ErrorText>{error}</ErrorText>
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
        <div className="flex justify-between text-sm">
          <Link to="/forgot-password" className="text-indigo-600 hover:underline">
            Forgot password?
          </Link>
          <Link to="/register" className="text-indigo-600 hover:underline">
            Create an account
          </Link>
        </div>
      </form>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-500">
        <p className="font-medium text-slate-600">Demo accounts</p>
        <p className="mt-1">Admin: admin@example.com / Admin@12345</p>
        <p>Candidate: candidate@example.com / Candidate@123</p>
      </div>
    </div>
  );
}
