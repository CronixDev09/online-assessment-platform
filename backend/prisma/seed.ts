import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/password';
import { DEFAULT_VIOLATION_POLICY } from '../src/services/proctoring';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const adminPassword = await hashPassword('Admin@12345');
  const candidatePassword = await hashPassword('Candidate@123');

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      name: 'Platform Admin',
      email: 'admin@example.com',
      passwordHash: adminPassword,
      role: 'ADMIN',
      organization: 'Assessment Platform',
    },
  });

  const candidatesData = [
    { name: 'Rahul Sharma', email: 'candidate@example.com', candidateCode: 'CAND-001' },
    { name: 'Amit Verma', email: 'amit@example.com', candidateCode: 'CAND-002' },
    { name: 'Neha Patel', email: 'neha@example.com', candidateCode: 'CAND-003' },
  ];

  const candidates = [];
  for (const c of candidatesData) {
    candidates.push(
      await prisma.user.upsert({
        where: { email: c.email },
        update: {},
        create: {
          name: c.name,
          email: c.email,
          passwordHash: candidatePassword,
          role: 'CANDIDATE',
          candidateCode: c.candidateCode,
          organization: 'Demo College',
        },
      }),
    );
  }

  // ---- MCQ questions ----
  const mcq1 = await prisma.question.create({
    data: {
      type: 'MCQ',
      title: 'Which data structure uses FIFO order?',
      description: 'Choose the correct data structure.',
      difficulty: 'EASY',
      category: 'Data Structures',
      tags: 'queue,fifo',
      marks: 2,
      negativeMarks: 0.5,
      explanation: 'A queue processes elements in First-In-First-Out order.',
      status: 'ACTIVE',
      createdById: admin.id,
      options: {
        create: [
          { optionText: 'Stack', isCorrect: false, displayOrder: 0 },
          { optionText: 'Queue', isCorrect: true, displayOrder: 1 },
          { optionText: 'Tree', isCorrect: false, displayOrder: 2 },
          { optionText: 'Graph', isCorrect: false, displayOrder: 3 },
        ],
      },
    },
  });

  const mcq2 = await prisma.question.create({
    data: {
      type: 'MCQ',
      title: 'What is the time complexity of binary search?',
      description: 'Assume a sorted array of n elements.',
      difficulty: 'MEDIUM',
      category: 'Algorithms',
      tags: 'search,complexity',
      marks: 2,
      negativeMarks: 0.5,
      explanation: 'Binary search halves the search space each step: O(log n).',
      status: 'ACTIVE',
      createdById: admin.id,
      options: {
        create: [
          { optionText: 'O(n)', isCorrect: false, displayOrder: 0 },
          { optionText: 'O(log n)', isCorrect: true, displayOrder: 1 },
          { optionText: 'O(n log n)', isCorrect: false, displayOrder: 2 },
          { optionText: 'O(1)', isCorrect: false, displayOrder: 3 },
        ],
      },
    },
  });

  // ---- Coding question ----
  const coding = await prisma.question.create({
    data: {
      type: 'CODING',
      title: 'Sum of Two Numbers',
      description: 'Read two integers a and b from standard input and print their sum.',
      difficulty: 'EASY',
      category: 'Basics',
      tags: 'math,io',
      marks: 10,
      negativeMarks: 0,
      status: 'ACTIVE',
      createdById: admin.id,
      coding: {
        create: {
          inputFormat: 'A single line containing two space-separated integers a and b.',
          outputFormat: 'A single integer: a + b.',
          constraints: '-10^9 <= a, b <= 10^9',
          sampleInput: '2 3',
          sampleOutput: '5',
          explanation: '2 + 3 = 5',
          timeLimitMs: 2000,
          memoryLimitMb: 256,
          maxCodeLength: 20000,
          allowedLanguages: 'python,java,cpp',
          testCases: {
            create: [
              { inputData: '2 3', expectedOutput: '5', weight: 1, isHidden: false, timeoutMs: 2000 },
              { inputData: '0 0', expectedOutput: '0', weight: 1, isHidden: false, timeoutMs: 2000 },
              { inputData: '10 20', expectedOutput: '30', weight: 2, isHidden: true, timeoutMs: 2000 },
              { inputData: '-5 5', expectedOutput: '0', weight: 2, isHidden: true, timeoutMs: 2000 },
              { inputData: '1000000 999999', expectedOutput: '1999999', weight: 2, isHidden: true, timeoutMs: 2000 },
            ],
          },
        },
      },
    },
  });

  // ---- Test ----
  const existingTest = await prisma.test.findFirst({ where: { title: 'Sample Assessment' } });
  if (!existingTest) {
    const test = await prisma.test.create({
      data: {
        title: 'Sample Assessment',
        description: 'A short demo assessment mixing MCQs and one coding problem.',
        category: 'General',
        instructions: 'Read each question carefully. MCQ answers autosave. Submit your code for grading.',
        durationMinutes: 30,
        totalMarks: 14,
        passingMarks: 7,
        negativeMarkingEnabled: true,
        randomizeQuestions: false,
        randomizeOptions: false,
        proctoringEnabled: true,
        leaderboardEnabled: true,
        autoSubmit: true,
        status: 'ACTIVE',
        createdById: admin.id,
        testQuestions: {
          create: [
            { questionId: mcq1.id, displayOrder: 0 },
            { questionId: mcq2.id, displayOrder: 1 },
            { questionId: coding.id, displayOrder: 2 },
          ],
        },
        assignments: {
          create: candidates.map((c) => ({ candidateId: c.id })),
        },
      },
    });
    console.log(`Created test "${test.title}" with assignments for ${candidates.length} candidates.`);
  } else {
    console.log('Sample test already exists; skipping creation.');
  }

  // ---- Default settings ----
  await prisma.setting.upsert({
    where: { key: 'violation_policy' },
    update: {},
    create: { key: 'violation_policy', value: JSON.stringify(DEFAULT_VIOLATION_POLICY) },
  });
  await prisma.setting.upsert({
    where: { key: 'leaderboard_config' },
    update: {},
    create: {
      key: 'leaderboard_config',
      value: JSON.stringify({ publicLeaderboard: true, maskNames: false, topN: null, showScores: true }),
    },
  });

  console.log('Seed complete.');
  console.log('Admin login   : admin@example.com / Admin@12345');
  console.log('Candidate login: candidate@example.com / Candidate@123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
