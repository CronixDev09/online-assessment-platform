import Editor from '@monaco-editor/react';

const MONACO_LANGUAGE: Record<string, string> = {
  python: 'python',
  java: 'java',
  cpp: 'cpp',
};

export function CodeEditor({
  language,
  value,
  onChange,
  height = '360px',
  readOnly = false,
}: {
  language: string;
  value: string;
  onChange?: (value: string) => void;
  height?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-700">
      <Editor
        height={height}
        language={MONACO_LANGUAGE[language] ?? 'plaintext'}
        value={value}
        theme="vs-dark"
        onChange={(v) => onChange?.(v ?? '')}
        loading={<div className="p-4 text-sm text-slate-400">Loading editor...</div>}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 14,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          padding: { top: 12, bottom: 12 },
          renderWhitespace: 'selection',
        }}
      />
    </div>
  );
}
