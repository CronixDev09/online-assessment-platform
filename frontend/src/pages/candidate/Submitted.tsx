import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card } from '../../components/ui';

export default function Submitted() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const sessionId = params.get('sessionId');
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-xl py-10">
      <Card className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">
          ✓
        </div>
        <h1 className="mt-4 text-xl font-semibold text-slate-800">Test submitted</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your responses and coding submissions have been saved and evaluated. You will find your score on the
          results page.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          {sessionId ? (
            <button className="btn btn-primary" onClick={() => navigate(`/candidate/results/${sessionId}`)}>
              View result
            </button>
          ) : null}
          <button className="btn btn-secondary" onClick={() => navigate('/candidate/dashboard')}>
            Back to dashboard
          </button>
          <button className="btn btn-ghost" onClick={() => navigate(`/candidate/leaderboard/${id}`)}>
            Leaderboard
          </button>
        </div>
      </Card>
    </div>
  );
}
