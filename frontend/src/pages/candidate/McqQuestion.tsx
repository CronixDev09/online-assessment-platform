import type { SessionQuestion } from './attemptTypes';

export function McqQuestion({
  question,
  selected,
  onSelect,
  saveState,
  index,
  total,
}: {
  question: SessionQuestion;
  selected: string[];
  onSelect: (optionIds: string[]) => void;
  saveState: 'idle' | 'saving' | 'saved';
  index: number;
  total: number;
}) {
  const options = question.options ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Question {index + 1} of {total} &middot; Single choice
        </span>
        <span className="text-xs text-slate-400">
          {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved' : ''}
        </span>
      </div>

      <h2 className="text-lg font-semibold text-slate-900">{question.title}</h2>
      {question.description ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{question.description}</p>
      ) : null}

      <div className="mt-5 space-y-2">
        {options.map((opt, i) => {
          const checked = selected.includes(opt.id);
          return (
            <label
              key={opt.id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                checked ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name={`q-${question.id}`}
                className="mt-1"
                checked={checked}
                onChange={() => onSelect([opt.id])}
              />
              <span className="text-sm text-slate-700">
                <span className="mr-2 font-medium text-slate-400">{String.fromCharCode(65 + i)}.</span>
                {opt.optionText}
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3 text-xs text-slate-400">
        <span>Marks: {question.marks}</span>
        {question.negativeMarks > 0 ? <span>Negative: -{question.negativeMarks}</span> : null}
        {selected.length > 0 ? (
          <button className="text-rose-500 hover:underline" onClick={() => onSelect([])}>
            Clear answer
          </button>
        ) : null}
      </div>
    </div>
  );
}
