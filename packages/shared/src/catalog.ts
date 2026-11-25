import type { ExamCode, ExamLevel } from './types';

/**
 * Seed data for exam categories and subjects.
 *
 * This is only the starting data loaded into the database by the API seed script.
 * After that, staff manage categories, subjects, prices and mock timings in the
 * admin dashboard, so changes never need an app release.
 *
 * Mock timings marked `verifyWithOfficialSource` must be checked against the exam
 * body's current published rules before launch.
 */

export interface MockSectionSeed {
  name: string;
  durationMinutes: number;
  questionCount: number;
}

export interface ExamCategorySeed {
  code: ExamCode;
  name: string;
  level: ExamLevel;
  /** Default annual price in kobo (1 naira = 100 kobo). Stored as an admin setting after seeding. */
  defaultPriceKobo: number;
  description: string;
  minAge: number;
  subjects: string[];
  mockSections: MockSectionSeed[];
  verifyWithOfficialSource: boolean;
  /** Shown on SAT and IELTS screens. */
  disclaimer?: string;
  /** JAMB only: candidates take Use of English plus this many other subjects. */
  electiveCount?: number;
}

const NAIRA = 100;

export const SAT_DISCLAIMER =
  'Ugo is not affiliated with or endorsed by the College Board. SAT is a trademark registered by the College Board. All Ugo SAT practice material is original.';
export const IELTS_DISCLAIMER =
  'Ugo is not affiliated with or endorsed by the British Council, IDP: IELTS Australia or Cambridge University Press & Assessment. All Ugo IELTS practice material is original.';

export const EXAM_CATALOG: ExamCategorySeed[] = [
  {
    code: 'FSLC',
    name: 'First School Leaving Certificate',
    level: 'PRIMARY',
    defaultPriceKobo: 5000 * NAIRA,
    description: 'Primary school leaving exam practice for pupils in Primary 5 and 6.',
    minAge: 8,
    subjects: ['English Language', 'Mathematics', 'Basic Science', 'Social Studies', 'Civic Education'],
    mockSections: [{ name: 'Mixed paper', durationMinutes: 60, questionCount: 50 }],
    verifyWithOfficialSource: true,
  },
  {
    code: 'COMMON_ENTRANCE',
    name: 'Common Entrance',
    level: 'PRIMARY',
    defaultPriceKobo: 5000 * NAIRA,
    description: 'Entrance exam practice for admission into junior secondary schools.',
    minAge: 9,
    subjects: [
      'English Language',
      'Mathematics',
      'Quantitative Reasoning',
      'Verbal Reasoning',
      'General Knowledge',
    ],
    mockSections: [{ name: 'Full paper', durationMinutes: 120, questionCount: 150 }],
    verifyWithOfficialSource: true,
  },
  {
    code: 'BECE',
    name: 'Basic Education Certificate Examination',
    level: 'JUNIOR_SECONDARY',
    defaultPriceKobo: 5000 * NAIRA,
    description: 'Junior secondary school exam practice for JSS3 students.',
    minAge: 11,
    subjects: [
      'English Language',
      'Mathematics',
      'Basic Science',
      'Basic Technology',
      'Social Studies',
      'Agricultural Science',
      'Civic Education',
      'French',
      'Computer Studies',
      'Home Economics',
      'Business Studies',
      'Fine Art',
      'Physical and Health Education',
      'Christian Religious Studies',
      'Islamic Religious Studies',
    ],
    mockSections: [{ name: 'Objective paper', durationMinutes: 60, questionCount: 50 }],
    verifyWithOfficialSource: true,
  },
  {
    code: 'WAEC',
    name: 'WAEC (WASSCE)',
    level: 'SENIOR_SECONDARY',
    defaultPriceKobo: 7000 * NAIRA,
    description: 'West African Senior School Certificate Examination practice.',
    minAge: 14,
    subjects: SENIOR_SECONDARY_SUBJECTS(),
    // Each WAEC paper has its own official duration. Staff set per paper timings in the admin dashboard.
    mockSections: [{ name: 'Objective paper', durationMinutes: 60, questionCount: 50 }],
    verifyWithOfficialSource: true,
  },
  {
    code: 'NECO',
    name: 'NECO (SSCE)',
    level: 'SENIOR_SECONDARY',
    defaultPriceKobo: 7000 * NAIRA,
    description: 'National Examinations Council Senior School Certificate Examination practice.',
    minAge: 14,
    subjects: SENIOR_SECONDARY_SUBJECTS(),
    mockSections: [{ name: 'Objective paper', durationMinutes: 60, questionCount: 60 }],
    verifyWithOfficialSource: true,
  },
  {
    code: 'JAMB',
    name: 'JAMB (UTME)',
    level: 'SENIOR_SECONDARY',
    defaultPriceKobo: 7000 * NAIRA,
    description: 'Unified Tertiary Matriculation Examination practice: Use of English plus three subjects.',
    minAge: 14,
    electiveCount: 3,
    subjects: ['Use of English', ...SENIOR_SECONDARY_SUBJECTS().filter((s) => s !== 'English Language')],
    // The 120 minute total comes from the Ugo specification.
    mockSections: [
      { name: 'Use of English', durationMinutes: 0, questionCount: 60 },
      { name: 'Subject 2', durationMinutes: 0, questionCount: 40 },
      { name: 'Subject 3', durationMinutes: 0, questionCount: 40 },
      { name: 'Subject 4', durationMinutes: 0, questionCount: 40 },
    ],
    verifyWithOfficialSource: true,
  },
  {
    code: 'SAT',
    name: 'SAT',
    level: 'SENIOR_SECONDARY',
    defaultPriceKobo: 7000 * NAIRA,
    description: 'Digital SAT practice with adaptive Reading and Writing and Math modules.',
    minAge: 13,
    subjects: ['Reading and Writing', 'Math'],
    mockSections: [
      { name: 'Reading and Writing: Module 1', durationMinutes: 32, questionCount: 27 },
      { name: 'Reading and Writing: Module 2', durationMinutes: 32, questionCount: 27 },
      { name: 'Math: Module 1', durationMinutes: 35, questionCount: 22 },
      { name: 'Math: Module 2', durationMinutes: 35, questionCount: 22 },
    ],
    verifyWithOfficialSource: true,
    disclaimer: SAT_DISCLAIMER,
  },
  {
    code: 'IELTS',
    name: 'IELTS',
    level: 'SENIOR_SECONDARY_AND_ABOVE',
    defaultPriceKobo: 7000 * NAIRA,
    description: 'IELTS Academic and General Training practice for all four parts.',
    minAge: 15,
    subjects: ['Listening', 'Reading', 'Writing', 'Speaking'],
    mockSections: [
      { name: 'Listening', durationMinutes: 30, questionCount: 40 },
      { name: 'Reading', durationMinutes: 60, questionCount: 40 },
      { name: 'Writing', durationMinutes: 60, questionCount: 2 },
      { name: 'Speaking', durationMinutes: 14, questionCount: 3 },
    ],
    verifyWithOfficialSource: true,
    disclaimer: IELTS_DISCLAIMER,
  },
];

/** JAMB mock total time in minutes, from the Ugo specification. */
export const JAMB_MOCK_TOTAL_MINUTES = 120;

function SENIOR_SECONDARY_SUBJECTS(): string[] {
  return [
    'English Language',
    'Mathematics',
    'Further Mathematics',
    'Literature in English',
    'Economics',
    'Government',
    'Biology',
    'Physics',
    'Chemistry',
    'Agricultural Science',
    'Geography',
    'Commerce',
    'Financial Accounting',
    'Civic Education',
    'Christian Religious Studies',
    'Islamic Religious Studies',
    'History',
    'Technical Drawing',
    'Computer Studies',
    'Data Processing',
    'Food and Nutrition',
    'Home Management',
    'Visual Art',
    'Music',
    'French',
    'Yoruba',
    'Igbo',
    'Hausa',
    'Arabic',
    'Marketing',
    'Office Practice',
    'Insurance',
    'Book Keeping',
  ];
}

/** JAMB subject groups, used to help candidates pick three subjects. */
export const JAMB_SUBJECT_GROUPS: Record<'Sciences' | 'Arts' | 'Social Sciences' | 'Commercial', string[]> = {
  Sciences: ['Mathematics', 'Further Mathematics', 'Biology', 'Physics', 'Chemistry', 'Agricultural Science', 'Geography', 'Computer Studies'],
  Arts: ['Literature in English', 'Christian Religious Studies', 'Islamic Religious Studies', 'History', 'Visual Art', 'Music', 'French', 'Yoruba', 'Igbo', 'Hausa', 'Arabic'],
  'Social Sciences': ['Economics', 'Government', 'Geography', 'Civic Education'],
  Commercial: ['Commerce', 'Financial Accounting', 'Economics', 'Marketing', 'Office Practice', 'Insurance', 'Book Keeping'],
};

export function findExam(code: ExamCode): ExamCategorySeed {
  const exam = EXAM_CATALOG.find((e) => e.code === code);
  if (!exam) throw new Error(`Unknown exam code ${code}`);
  return exam;
}

/** Total mock duration in minutes for an exam. JAMB uses one shared 120 minute clock. */
export function mockDurationMinutes(code: ExamCode, sections = findExam(code).mockSections): number {
  if (code === 'JAMB') return JAMB_MOCK_TOTAL_MINUTES;
  return sections.reduce((sum, s) => sum + s.durationMinutes, 0);
}
