export interface SessionQuestionOption {
  id: string;
  optionText: string;
}

export interface SessionQuestion {
  id: string;
  type: 'MCQ' | 'CODING';
  title: string;
  description: string | null;
  difficulty: string;
  marks: number;
  negativeMarks: number;
  order: number;
  options?: SessionQuestionOption[];
  coding?: {
    inputFormat: string | null;
    outputFormat: string | null;
    constraints: string | null;
    sampleInput: string | null;
    sampleOutput: string | null;
    explanation: string | null;
    timeLimitMs: number;
    memoryLimitMb: number;
    allowedLanguages: string[];
    sampleCases: { id: string; inputData: string; expectedOutput: string }[];
  };
}

export interface SessionAnswer {
  questionId: string;
  selectedOptionIds: string[];
  answerText: string | null;
  savedAt: string;
  version: number;
}

export interface SessionState {
  sessionId: string;
  testId: string;
  test: {
    id: string;
    title: string;
    durationMinutes: number;
    proctoringEnabled: boolean;
    negativeMarkingEnabled: boolean;
    allowedLanguages: string[];
    passingMarks: number;
    totalMarks: number;
  };
  status: string;
  attempt: number;
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  submissionReason: string | null;
  serverNow: string;
  remainingSeconds: number;
  questions: SessionQuestion[];
  answers: SessionAnswer[];
  codeDrafts: Record<string, { language: string; sourceCode: string; savedAt: string }>;
  latestSubmissions: Record<
    string,
    { id: string; status: string; score: number; passedCases: number; totalCases: number; language: string; submittedAt: string }
  >;
  violationCount: number;
}

export interface JudgeCaseResult {
  id: string;
  label: string | null;
  isHidden: boolean;
  status: string;
  executionTime: number | null;
  stdout: string | null;
  stderr: string | null;
  expected: string | null;
}

export interface JudgeOutcome {
  status: string;
  passedCases: number;
  totalCases: number;
  executionTime: number;
  compileOutput?: string;
  message?: string;
  engine?: string;
  caseResults?: JudgeCaseResult[];
}

export const CODE_TEMPLATES: Record<string, string> = {
  python: `import sys\n\ndef main():\n    data = sys.stdin.read().split()\n    # TODO: implement your solution\n    print(0)\n\nif __name__ == "__main__":\n    main()\n`,
  java: `import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // TODO: implement your solution\n    }\n}\n`,
  cpp: `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // TODO: implement your solution\n    return 0;\n}\n`,
};

export const LANGUAGE_LABELS: Record<string, string> = {
  python: 'Python 3',
  java: 'Java',
  cpp: 'C++17',
};
