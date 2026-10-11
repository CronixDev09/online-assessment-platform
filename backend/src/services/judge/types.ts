/** Execution statuses surfaced to candidates and admins. */
export type JudgeStatus =
  | 'ACCEPTED'
  | 'WRONG_ANSWER'
  | 'COMPILATION_ERROR'
  | 'RUNTIME_ERROR'
  | 'TIME_LIMIT_EXCEEDED'
  | 'MEMORY_LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR';

export interface JudgeCase {
  id?: string;
  label?: string;
  input: string;
  expectedOutput: string;
  isHidden: boolean;
  timeoutMs?: number;
  weight?: number;
}

export interface JudgeCaseResult {
  testCaseId?: string;
  label?: string;
  isHidden: boolean;
  status: JudgeStatus;
  executionTime: number;
  memoryUsed?: number;
  stdout: string;
  stderr: string;
  expected: string;
}

export interface JudgeResult {
  status: JudgeStatus;
  compileOutput?: string;
  executionTime: number;
  memoryUsed?: number;
  passedCases: number;
  totalCases: number;
  cases: JudgeCaseResult[];
  engine: 'docker' | 'local';
  message?: string;
}

export interface LanguageSpec {
  id: string;
  label: string;
  sourceFile: string;
  /** Command used to compile locally (empty/undefined = interpreted). */
  compileLocal?: string[];
  /** Command used to run locally. */
  runLocal: string[];
  /** Command used to compile inside the Docker image. */
  compileDocker?: string[];
  /** Command used to run inside the Docker image. */
  runDocker: string[];
  dockerImage: string;
  /** Filenames that the compiler produces which must be executed. */
  artifact?: string;
}

const isWindows = process.platform === 'win32';

export const LANGUAGE_SPECS: Record<string, LanguageSpec> = {
  python: {
    id: 'python',
    label: 'Python 3',
    sourceFile: 'main.py',
    runLocal: [isWindows ? 'python' : 'python3', 'main.py'],
    runDocker: ['python3', 'main.py'],
    dockerImage: 'python:3.12-slim',
  },
  java: {
    id: 'java',
    label: 'Java',
    sourceFile: 'Main.java',
    compileLocal: ['javac', 'Main.java'],
    runLocal: ['java', '-cp', '.', 'Main'],
    compileDocker: ['javac', 'Main.java'],
    runDocker: ['java', '-cp', '.', 'Main'],
    dockerImage: 'eclipse-temurin:17-jdk',
    artifact: 'Main.class',
  },
  cpp: {
    id: 'cpp',
    label: 'C++ 17',
    sourceFile: 'main.cpp',
    compileLocal: ['g++', '-std=c++17', '-O2', '-o', isWindows ? 'main.exe' : 'main', 'main.cpp'],
    runLocal: [isWindows ? '.\\main.exe' : './main'],
    compileDocker: ['g++', '-std=c++17', '-O2', '-o', 'main', 'main.cpp'],
    runDocker: ['./main'],
    dockerImage: 'gcc:13',
    artifact: isWindows ? 'main.exe' : 'main',
  },
};

export function getLanguageSpec(language: string): LanguageSpec | undefined {
  return LANGUAGE_SPECS[language];
}

export function normalizeOutput(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
    .replace(/\n+$/g, '')
    .trim();
}
