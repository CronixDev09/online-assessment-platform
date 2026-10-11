import { Link } from 'react-router-dom';

const features = [
  { title: 'MCQ + Coding in one test', text: 'Mix objective questions and real programming problems in a single timed assessment.' },
  { title: 'Real isolated code judge', text: 'Submissions run in a locked-down sandbox with CPU, memory and timeout limits.' },
  { title: 'Server-authoritative timing', text: 'The countdown lives on the server, so refreshing or reconnecting never buys extra time.' },
  { title: 'Browser proctoring', text: 'Fullscreen, tab-switch, focus, camera and microphone events are recorded as violations.' },
  { title: 'Auto-save & recovery', text: 'Answers and code save continuously; reconnect and continue from the last saved state.' },
  { title: 'Results & leaderboards', text: 'Automatic scoring, per-question analytics, rankings and CSV reports.' },
];

export default function Landing() {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Secure online assessments, end to end
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-600">
          Run timed MCQ and coding exams with real automated evaluation, proctoring signals and
          server-controlled sessions. Built as a complete working system, not a mockup.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/register" className="btn btn-primary px-6 py-2.5">
            Get started
          </Link>
          <Link to="/login" className="btn btn-secondary px-6 py-2.5">
            Sign in
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="card p-5">
            <h3 className="font-semibold text-slate-800">{f.title}</h3>
            <p className="mt-1 text-sm text-slate-500">{f.text}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-400">
        Online Assessment Platform
      </footer>
    </div>
  );
}
