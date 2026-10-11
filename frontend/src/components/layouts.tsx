import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-semibold text-slate-900">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">A</span>
      <span className="hidden sm:inline">Assessment Platform</span>
    </Link>
  );
}

export function PublicLayout() {
  return (
    <div className="min-h-full">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-2">
            <Link to="/login" className="btn-ghost">
              Login
            </Link>
            <Link to="/register" className="btn btn-primary">
              Register
            </Link>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}

const candidateLinks = [
  { to: '/candidate/dashboard', label: 'Dashboard' },
  { to: '/candidate/results', label: 'Results' },
  { to: '/candidate/submissions', label: 'Submissions' },
  { to: '/candidate/notifications', label: 'Notifications' },
  { to: '/candidate/profile', label: 'Profile' },
];

export function CandidateLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    api
      .get<{ unread: number }>('/candidate/notifications')
      .then((r) => setUnread(r.data.unread))
      .catch(() => undefined);
  }, []);

  const doLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="hidden text-sm text-slate-500 md:inline">
              {user?.name}
            </span>
            <button className="btn-ghost" onClick={doLogout}>
              Logout
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2">
          {candidateLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {l.label}
              {l.label === 'Notifications' && unread > 0 ? (
                <span className="ml-2 rounded-full bg-rose-500 px-1.5 text-xs text-white">{unread}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

const adminLinks = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/tests', label: 'Tests' },
  { to: '/admin/questions', label: 'Question Bank' },
  { to: '/admin/results', label: 'Results' },
  { to: '/admin/leaderboard', label: 'Leaderboard' },
  { to: '/admin/monitoring', label: 'Live Monitoring' },
  { to: '/admin/violations', label: 'Violations' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/settings', label: 'Settings' },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const doLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-full lg:flex">
      <aside className="border-b border-slate-200 bg-white lg:w-60 lg:border-b-0 lg:border-r">
        <div className="flex h-14 items-center px-4">
          <Logo />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible lg:pb-4">
          {adminLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
          <span className="text-sm font-medium text-slate-500">Administration</span>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-slate-500 sm:inline">{user?.name}</span>
            <button className="btn-ghost" onClick={doLogout}>
              Logout
            </button>
          </div>
        </header>
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
