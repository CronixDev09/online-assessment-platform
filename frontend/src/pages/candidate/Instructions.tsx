import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { Card, ErrorText, PageHeader, Spinner } from '../../components/ui';

interface TestDetail {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  instructions: string | null;
  durationMinutes: number;
  totalMarks: number;
  passingMarks: number;
  negativeMarkingEnabled: boolean;
  proctoringEnabled: boolean;
  allowedLanguages: string[];
  questionCounts: { mcq: number; coding: number; total: number };
  maxAttempts: number;
  startAt: string | null;
  endAt: string | null;
}

const warnings = [
  'Camera permission is required for this assessment.',
  'Microphone permission is required.',
  'The test runs in fullscreen; leaving it is recorded.',
  'Switching tabs or losing window focus is recorded.',
  'Repeated violations can lead to disqualification.',
  'The test submits automatically when time expires.',
  'Keep a stable internet connection; your work autosaves.',
];

export default function Instructions() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [test, setTest] = useState<TestDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<{ test: TestDetail }>(`/candidate/tests/${id}`)
      .then((r) => setTest(r.data.test))
      .catch((e) => setError(apiError(e)));
  }, [id]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!test) return <Spinner label="Loading test details..." />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={test.title} subtitle={test.category ?? undefined} />

      <Card className="mb-4">
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-400">Duration</dt>
            <dd className="text-lg font-semibold text-slate-800">{test.durationMinutes} min</dd>
          </div>
          <div>
            <dt className="text-slate-400">Questions</dt>
            <dd className="text-lg font-semibold text-slate-800">{test.questionCounts.total}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Total marks</dt>
            <dd className="text-lg font-semibold text-slate-800">{test.totalMarks}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Passing marks</dt>
            <dd className="text-lg font-semibold text-slate-800">{test.passingMarks}</dd>
          </div>
        </dl>
        <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          <p>
            <span className="text-slate-400">Format:</span> {test.questionCounts.mcq} MCQ &middot;{' '}
            {test.questionCounts.coding} coding
          </p>
          <p>
            <span className="text-slate-400">Attempts allowed:</span> {test.maxAttempts}
          </p>
          <p>
            <span className="text-slate-400">Negative marking:</span>{' '}
            {test.negativeMarkingEnabled ? 'Enabled' : 'Disabled'}
          </p>
          <p>
            <span className="text-slate-400">Languages:</span>{' '}
            {test.allowedLanguages.length > 0 ? test.allowedLanguages.join(', ') : 'N/A'}
          </p>
          <p className="sm:col-span-2">
            <span className="text-slate-400">Window:</span> {formatDateTime(test.startAt)} &rarr;{' '}
            {formatDateTime(test.endAt)}
          </p>
        </div>
      </Card>

      {test.instructions ? (
        <Card className="mb-4">
          <h2 className="font-semibold text-slate-800">Instructions</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{test.instructions}</p>
        </Card>
      ) : null}

      <Card className="mb-4 border-amber-200 bg-amber-50">
        <h2 className="font-semibold text-amber-800">Before you begin</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </Card>

      <div className="flex justify-end gap-2">
        <button className="btn btn-secondary" onClick={() => navigate('/candidate/dashboard')}>
          Cancel
        </button>
        <Link to={`/candidate/tests/${test.id}/system-check`} className="btn btn-primary">
          Continue to system check
        </Link>
      </div>
    </div>
  );
}
