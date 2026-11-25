import type { ExamCode } from '@prisma/client';

/**
 * Starter content written by Ugo (original practice material, not past exam papers).
 * Used to seed development and staging, and as worked examples for the content team.
 */
export interface SeedQuestion {
  topic: string;
  body: string;
  options: [string, string, string, string];
  answer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
}

export interface SeedSubjectContent {
  examCode: ExamCode;
  subject: string;
  topics: string[];
  questions: SeedQuestion[];
  note: { topic: string; title: string; markdown: string; keyPoints: string[] };
  cards: { front: string; back: string }[];
}

const maths = (examCode: ExamCode, subject = 'Mathematics'): SeedSubjectContent => ({
  examCode,
  subject,
  topics: ['Number and numeration', 'Algebra'],
  questions: [
    { topic: 'Number and numeration', body: 'What is 15% of 2,400 naira?', options: ['₦240', '₦360', '₦300', '₦480'], answer: 'B', explanation: '15% means 15 out of 100. 2,400 × 15 ÷ 100 = 36,000 ÷ 100 = 360. So 15% of ₦2,400 is ₦360.' },
    { topic: 'Number and numeration', body: 'Which of these numbers is a prime number?', options: ['21', '27', '29', '33'], answer: 'C', explanation: 'A prime number has exactly two factors: 1 and itself. 21 = 3 × 7, 27 = 3 × 9 and 33 = 3 × 11, but 29 can only be divided by 1 and 29. So 29 is prime.' },
    { topic: 'Number and numeration', body: 'Simplify 3/4 + 1/6.', options: ['4/10', '11/12', '5/6', '1'], answer: 'B', explanation: 'Use a common denominator. The LCM of 4 and 6 is 12. 3/4 = 9/12 and 1/6 = 2/12. 9/12 + 2/12 = 11/12.' },
    { topic: 'Algebra', body: 'Solve for x: 3x + 5 = 20.', options: ['x = 3', 'x = 5', 'x = 15', 'x = 25/3'], answer: 'B', explanation: 'Subtract 5 from both sides: 3x = 15. Divide both sides by 3: x = 5. Check: 3 × 5 + 5 = 20.' },
    { topic: 'Algebra', body: 'If y = 2x − 1, find y when x = 4.', options: ['5', '6', '7', '9'], answer: 'C', explanation: 'Replace x with 4: y = 2 × 4 − 1 = 8 − 1 = 7.' },
  ],
  note: {
    topic: 'Algebra',
    title: 'Solving simple linear equations',
    markdown:
      '## What is a linear equation?\n\nA linear equation has a letter (the unknown) raised only to the power 1, for example 3x + 5 = 20.\n\n## The golden rule\n\nWhatever you do to one side, do to the other side, so the equation stays balanced.\n\n## Worked example\n\nSolve 4x − 7 = 13.\n\n1. Add 7 to both sides: 4x = 20\n2. Divide both sides by 4: x = 5\n3. Check: 4 × 5 − 7 = 13 ✔',
    keyPoints: ['Keep the equation balanced', 'Undo addition with subtraction, and multiplication with division', 'Always check your answer by substituting it back'],
  },
  cards: [
    { front: 'Percentage formula', back: 'Part = (Percentage ÷ 100) × Whole' },
    { front: 'Prime number', back: 'A whole number greater than 1 with exactly two factors: 1 and itself' },
    { front: 'LCM', back: 'Lowest common multiple: the smallest number that two or more numbers divide into exactly' },
  ],
});

const english = (examCode: ExamCode, subject = 'English Language'): SeedSubjectContent => ({
  examCode,
  subject,
  topics: ['Grammar', 'Vocabulary'],
  questions: [
    { topic: 'Grammar', body: 'Choose the correct option: Neither the teacher nor the students ___ in the hall.', options: ['was', 'were', 'is', 'has been'], answer: 'B', explanation: 'With "neither ... nor", the verb agrees with the subject nearest to it. "Students" is plural, so the verb is "were".' },
    { topic: 'Grammar', body: 'Choose the correct option: She has been living in Enugu ___ 2019.', options: ['for', 'since', 'from', 'by'], answer: 'B', explanation: 'Use "since" with a point in time (2019) and "for" with a length of time (five years). So: since 2019.' },
    { topic: 'Vocabulary', body: 'Choose the word nearest in meaning to "diligent".', options: ['lazy', 'hardworking', 'clever', 'quiet'], answer: 'B', explanation: '"Diligent" describes someone who works carefully and steadily. The closest word is "hardworking". "Lazy" is its opposite.' },
    { topic: 'Vocabulary', body: 'Choose the word opposite in meaning to "scarce".', options: ['rare', 'expensive', 'plentiful', 'small'], answer: 'C', explanation: '"Scarce" means there is not enough of something. The opposite is "plentiful", meaning there is a lot of it.' },
    { topic: 'Grammar', body: 'Choose the correct option: Each of the boys ___ his own book.', options: ['have', 'are having', 'has', 'were having'], answer: 'C', explanation: '"Each" is singular, so it takes a singular verb: "Each of the boys has his own book."' },
  ],
  note: {
    topic: 'Grammar',
    title: 'Subject and verb agreement',
    markdown:
      '## The rule\n\nA singular subject takes a singular verb. A plural subject takes a plural verb.\n\n## Tricky cases\n\n- **Each, every, either, neither** are singular: *Each student has a pen.*\n- **Neither ... nor / either ... or**: the verb agrees with the nearer subject: *Neither Ada nor her brothers were late.*\n- Words between the subject and verb do not change the rule: *The box of mangoes is heavy.*',
    keyPoints: ['Find the real subject first', '"Each" and "every" are singular', 'With neither/nor, look at the nearer subject'],
  },
  cards: [
    { front: 'Synonym', back: 'A word with the same or nearly the same meaning' },
    { front: 'Antonym', back: 'A word with the opposite meaning' },
    { front: 'since vs for', back: '"since" + point in time (since Monday); "for" + length of time (for two days)' },
  ],
});

export const SEED_CONTENT: SeedSubjectContent[] = [
  maths('FSLC'),
  english('FSLC'),
  maths('COMMON_ENTRANCE'),
  english('COMMON_ENTRANCE'),
  maths('BECE'),
  english('BECE'),
  maths('WAEC'),
  english('WAEC'),
  maths('NECO'),
  english('NECO'),
  maths('JAMB'),
  english('JAMB', 'Use of English'),
  maths('SAT', 'Math'),
  english('SAT', 'Reading and Writing'),
  english('IELTS', 'Reading'),
];
