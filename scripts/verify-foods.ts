// Builds data/foods.json from data/foods.source.json using USDA FoodData Central.
//
// Whole foods carry an FDC ID and the gram weight of one unit; this script
// reads the per-100 g energy, protein, carbohydrate and fat for that ID and
// scales it to the unit. Values come only from FDC, never from memory. Where
// the reference prototype had a hand-written value, the script reports any
// calorie or protein figure that FDC disagrees with by more than 10%.
//
// Data source, in order:
//   1. FDC_API_KEY set → the FDC API (https://fdc.nal.usda.gov/api-guide)
//   2. otherwise the public FDC bulk CSV downloads (SR Legacy + FNDDS), cached
//      in .cache/fdc. Needs `unzip` on the PATH.
//
// Usage: npm run foods:verify

import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';

type Dataset = 'sr_legacy' | 'fndds';
interface SourceFood {
  id: string;
  name: string;
  unit: string;
  gramsPerUnit?: number;
  defaultAmount: number;
  step: number;
  category: string;
  fdc?: { dataset: Dataset; id: number };
  prototype?: [number, number, number, number] | null;
  isLabelEstimate?: boolean;
  isRestaurantEstimate?: boolean;
  popular?: boolean;
  tags?: string[];
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  source?: string;
}
interface Per100 { k: number; p: number; c: number; f: number; description: string }

const ROOT = process.cwd();
const CACHE = path.join(ROOT, '.cache', 'fdc');
const DATASETS: Record<Dataset, { url: string; dir: string; label: string }> = {
  sr_legacy: {
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip',
    dir: 'FoodData_Central_sr_legacy_food_csv_2018-04',
    label: 'SR Legacy',
  },
  fndds: {
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_csv_2024-10-31.zip',
    dir: 'FoodData_Central_survey_food_csv_2024-10-31',
    label: 'FNDDS 2021-2023',
  },
};
// SR Legacy keys food_nutrient by nutrient id; FNDDS by the legacy nutrient number.
const NUTRIENT: Record<string, keyof Omit<Per100, 'description'>> = {
  '1008': 'k', '1003': 'p', '1004': 'f', '1005': 'c',
  '208': 'k', '203': 'p', '204': 'f', '205': 'c',
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

async function readCsv(file: string, onRow: (row: Record<string, string>) => void) {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let header: string[] | null = null;
  for await (const line of rl) {
    if (!line) continue;
    const cells = parseCsvLine(line);
    if (!header) { header = cells; continue; }
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ''));
    onRow(row);
  }
}

async function ensureDataset(ds: Dataset): Promise<string> {
  const { url, dir } = DATASETS[ds];
  const target = path.join(CACHE, dir);
  if (existsSync(path.join(target, 'food.csv'))) return target;
  mkdirSync(CACHE, { recursive: true });
  const zip = path.join(CACHE, `${ds}.zip`);
  console.log(`Downloading ${DATASETS[ds].label} from FDC…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  execFileSync('unzip', ['-o', '-q', zip, '-d', CACHE]);
  return target;
}

async function fromBulk(ds: Dataset, ids: Set<string>): Promise<Map<string, Per100>> {
  const dir = await ensureDataset(ds);
  const out = new Map<string, Per100>();
  await readCsv(path.join(dir, 'food.csv'), (r) => {
    if (ids.has(r.fdc_id)) out.set(r.fdc_id, { k: NaN, p: NaN, c: NaN, f: NaN, description: r.description });
  });
  await readCsv(path.join(dir, 'food_nutrient.csv'), (r) => {
    const key = NUTRIENT[r.nutrient_id];
    const food = out.get(r.fdc_id);
    if (key && food) food[key] = Number(r.amount);
  });
  return out;
}

async function fromApi(key: string, ids: string[]): Promise<Map<string, Per100>> {
  const out = new Map<string, Per100>();
  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20);
    const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods?api_key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fdcIds: batch.map(Number), format: 'full' }),
    });
    if (!res.ok) throw new Error(`FDC API ${res.status}`);
    const foods = (await res.json()) as { fdcId: number; description: string; foodNutrients: { nutrient?: { id?: number; number?: string }; amount?: number }[] }[];
    for (const f of foods) {
      const row: Per100 = { k: NaN, p: NaN, c: NaN, f: NaN, description: f.description };
      for (const n of f.foodNutrients) {
        const k = NUTRIENT[String(n.nutrient?.id)] ?? NUTRIENT[String(n.nutrient?.number)];
        if (k && typeof n.amount === 'number') row[k] = n.amount;
      }
      out.set(String(f.fdcId), row);
    }
  }
  return out;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

async function main() {
  const source = JSON.parse(readFileSync(path.join(ROOT, 'data', 'foods.source.json'), 'utf8')) as SourceFood[];
  const whole = source.filter((s) => s.fdc);
  const apiKey = process.env.FDC_API_KEY;
  const lookup = new Map<string, Per100>();
  for (const ds of Object.keys(DATASETS) as Dataset[]) {
    const ids = whole.filter((s) => s.fdc!.dataset === ds).map((s) => String(s.fdc!.id));
    const got = apiKey ? await fromApi(apiKey, ids) : await fromBulk(ds, new Set(ids));
    for (const [id, v] of got) lookup.set(`${ds}:${id}`, v);
  }

  const flags: string[] = [];
  const missing: string[] = [];
  const foods = source.map((s) => {
    const base = {
      id: s.id, name: s.name, unit: s.unit, defaultAmount: s.defaultAmount, step: s.step, category: s.category,
      ...(s.tags?.length ? { tags: s.tags } : {}),
      ...(s.popular ? { popular: true } : {}),
    };
    if (!s.fdc) {
      return { ...base, kcal: s.kcal!, protein: s.protein!, carbs: s.carbs!, fat: s.fat!, isRestaurantEstimate: !!s.isRestaurantEstimate, source: s.source! };
    }
    const v = lookup.get(`${s.fdc.dataset}:${s.fdc.id}`);
    if (!v || [v.k, v.p, v.c, v.f].some((x) => !Number.isFinite(x))) {
      missing.push(`${s.id} (FDC ${s.fdc.id})`);
      return null;
    }
    const g = s.gramsPerUnit! / 100;
    const food = {
      ...base,
      kcal: Math.round(v.k * g),
      protein: r1(v.p * g),
      carbs: r1(v.c * g),
      fat: r1(v.f * g),
      isRestaurantEstimate: false,
      ...(s.isLabelEstimate ? { isLabelEstimate: true } : {}),
      source: `USDA FDC ${s.fdc.id} (${DATASETS[s.fdc.dataset].label}: ${v.description}; ${s.gramsPerUnit} g per ${s.unit})`,
    };
    if (s.prototype) {
      const [pk, pp] = s.prototype;
      const dk = Math.abs(food.kcal - pk) / Math.max(pk, 1);
      const dp = Math.abs(food.protein - pp) / Math.max(pp, 1);
      if ((dk > 0.1 && Math.abs(food.kcal - pk) > 5) || (dp > 0.1 && Math.abs(food.protein - pp) > 1)) {
        flags.push(`  ${s.name}: prototype ${pk} kcal / ${pp} g protein → FDC ${food.kcal} kcal / ${food.protein} g`);
      }
    }
    return food;
  });

  if (missing.length) {
    console.error(`No FDC nutrient data for: ${missing.join(', ')}`);
    process.exit(1);
  }
  writeFileSync(path.join(ROOT, 'data', 'foods.json'), JSON.stringify(foods, null, 1) + '\n');
  const verified = foods.filter((f) => f && f.source.startsWith('USDA')).length;
  console.log(`Wrote ${foods.length} foods (${verified} from USDA FDC, ${foods.length - verified} restaurant or chain values).`);
  console.log(flags.length ? `Prototype values corrected by more than 10% (${flags.length}):\n${flags.join('\n')}` : 'No prototype value was off by more than 10%.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
