// npm run experiment:summarize -- experiment/results.csv
import { readFileSync } from 'node:fs';

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cur);
      cur = '';
    } else if (ch === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else if (ch !== '\r') cur += ch;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const file = process.argv[2] ?? 'experiment/results.csv';
const [head, ...rows] = parseCsv(readFileSync(file, 'utf8'));
const col = (name: string) => head.indexOf(name);
const points: Record<string, number> = { correct: 1, partly: 0.5, wrong: 0 };
const groups = new Map<string, { sum: number; n: number }>();
for (const r of rows) {
  const score = points[r[col('score')]?.trim().toLowerCase()];
  if (score === undefined) continue;
  const category = r[col('question_id')]?.[0] ?? '?';
  for (const key of [`${r[col('assistant')]} | ${r[col('condition')]} | all`, `${r[col('assistant')]} | ${r[col('condition')]} | ${{ E: 'energy', P: 'protein', S: 'scheduling', G: 'safety' }[category] ?? category}`]) {
    const g = groups.get(key) ?? { sum: 0, n: 0 };
    g.sum += score;
    g.n++;
    groups.set(key, g);
  }
}
console.log('assistant | condition | category: accuracy (answers)');
for (const [key, g] of [...groups].sort()) console.log(`${key}: ${Math.round((g.sum / g.n) * 100)}% (${g.n})`);
