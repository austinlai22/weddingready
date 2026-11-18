// npm run experiment:generate → experiment/questions.csv (the answer key; not committed).
import { writeFileSync } from 'node:fs';
import { buildQuestions } from './questions';

const cols = ['id', 'category', 'question', 'correct_answer', 'acceptable_variants', 'how_computed'] as const;
const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
const rows = buildQuestions().map((q) => cols.map((c) => cell(String(q[c]))).join(','));
writeFileSync(new URL('./questions.csv', import.meta.url), [cols.join(','), ...rows].join('\n') + '\n');
console.log(`Wrote experiment/questions.csv (${rows.length} questions). Keep it private.`);
