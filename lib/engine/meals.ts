import foodsData from '../../data/foods.json';
import templatesData from '../../data/meal-templates.json';
import type { Diet, FoodItem, MealEntry, SlotId } from '../types';
import { daysBetween } from './dates';

export const FOODS = (foodsData as (FoodItem & { tags?: string[]; popular?: boolean })[]).map((f) => ({ ...f }));
const FOOD_BY_ID = new Map(FOODS.map((f) => [f.id, f]));

export function foodById(id: string) {
  return FOOD_BY_ID.get(id);
}

interface TemplateItem { food: string; amount: number; label: string }
export interface MealTemplate {
  id: string;
  slot: 'b' | 'main' | 's' | 'x';
  name: string;
  items: TemplateItem[];
  swap?: string;
  fixed?: boolean;
}
export const TEMPLATES = templatesData as MealTemplate[];

export interface MealOption {
  id: string;
  name: string;
  lines: string[];
  p: number;
  c: number;
  f: number;
  k: number;
  swap?: string;
  /** Shown instead of the kcal chip when the number is only a rough guide. */
  kLabel?: string;
  isTreat?: boolean;
}

// ---------- Amount formatting (ported from the prototype) ----------

export function fmtAmt(a: number): string {
  const whole = Math.floor(a + 1e-9);
  const frac = Math.round((a - whole) * 1000) / 1000;
  const map: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾', '0.125': '⅛', '0.333': '⅓', '0.667': '⅔' };
  const fs = frac === 0 ? '' : (map[String(frac)] ?? String(Math.round(frac * 100) / 100).replace('0.', '.'));
  return (whole ? String(whole) : fs ? '' : '0') + fs;
}

const NO_PLURAL = ['oz', 'tbsp', 'tsp', 'medium', 'small', 'whole', 'tall', 'large'];
export function unitText(u: string, a: number): string {
  if (a <= 1) return u;
  const parts = u.split(' ');
  const w = parts[0];
  if (NO_PLURAL.includes(w)) return u;
  parts[0] = /(s|sh|ch)$/.test(w) ? `${w}es` : `${w}s`;
  return parts.join(' ');
}

export function amountText(food: Pick<FoodItem, 'unit'>, a: number): string {
  return `${fmtAmt(a)} ${unitText(food.unit, a)}`;
}

// ---------- Diet filtering ----------

const DIET_EXCLUDES: Record<Diet, string[]> = {
  none: [],
  vegetarian: ['meat', 'poultry', 'pork', 'fish'],
  vegan: ['meat', 'poultry', 'pork', 'fish', 'dairy', 'egg', 'honey'],
  pescatarian: ['meat', 'poultry', 'pork'],
  no_pork: ['pork'],
  gluten_free: ['gluten'],
  dairy_free: ['dairy'],
};

export function avoidTokens(avoid: string[]): string[] {
  return avoid
    .flatMap((a) => a.toLowerCase().split(/[,;/]+/))
    .map((s) => s.trim())
    .filter((s) => s.length >= 3)
    .map((s) => (s.length > 4 && s.endsWith('s') ? s.slice(0, -1) : s));
}

// Avoid-list words that name a food group rather than a food: they exclude
// every food carrying that tag ("nuts" also removes almonds and peanut butter).
const AVOID_TAGS: [RegExp, string][] = [
  [/nut|almond|cashew|pecan|pistachio|hazelnut|macadamia/, 'nuts'],
  [/dairy|milk|lactose|cheese|whey|casein/, 'dairy'],
  [/egg/, 'egg'],
  [/soy|tofu|edamame/, 'soy'],
  [/gluten|wheat|celiac|coeliac/, 'gluten'],
  [/fish|seafood|shellfish|shrimp|prawn|crab|lobster/, 'fish'],
  [/pork|bacon|^ham$/, 'pork'],
  [/beef|red meat|^meat$/, 'meat'],
  [/chicken|turkey|poultry/, 'poultry'],
  [/honey/, 'honey'],
];

export function avoidTags(tokens: string[]): string[] {
  return [...new Set(tokens.flatMap((t) => AVOID_TAGS.filter(([re]) => re.test(t)).map(([, tag]) => tag)))];
}

function foodTags(id: string): string[] {
  return (FOOD_BY_ID.get(id) as { tags?: string[] } | undefined)?.tags ?? [];
}

export function templateAllowed(t: MealTemplate, diet: Diet, avoid: string[]): boolean {
  const tokens = avoidTokens(avoid);
  const excluded = [...(DIET_EXCLUDES[diet] ?? []), ...avoidTags(tokens)];
  for (const item of t.items) {
    if (foodTags(item.food).some((tag) => excluded.includes(tag))) return false;
    const name = (FOOD_BY_ID.get(item.food)?.name ?? '').toLowerCase();
    if (tokens.some((tok) => name.includes(tok) || item.label.toLowerCase().includes(tok))) return false;
  }
  if (tokens.some((tok) => t.name.toLowerCase().includes(tok))) return false;
  return true;
}

export function foodAllowed(f: FoodItem & { tags?: string[] }, diet: Diet): boolean {
  const excluded = DIET_EXCLUDES[diet] ?? [];
  return !(f.tags ?? []).some((t) => excluded.includes(t));
}

const DIET_CONFLICT: Record<Diet, string> = {
  none: '',
  vegetarian: 'Not vegetarian',
  vegan: 'Not vegan',
  pescatarian: 'Not pescatarian',
  no_pork: 'Contains pork',
  gluten_free: 'Contains gluten',
  dairy_free: 'Contains dairy',
};

/** A short label for a food that doesn't fit the person's diet, or null. Search still shows it: people log what they ate. */
export function dietConflict(f: FoodItem & { tags?: string[] }, diet: Diet): string | null {
  return foodAllowed(f, diet) ? null : DIET_CONFLICT[diet] || null;
}

// ---------- Portions ----------

/** SPEC §6.6: three portion tiers by calorie target. */
export function portionTier(kcal: number): number {
  if (kcal < 1600) return 0.85;
  if (kcal > 2100) return 1.15;
  return 1;
}

// Measured units scale in their step; countable units (eggs, slices, tortillas) stay whole.
const MEASURED = ['oz', 'cup', 'tbsp', 'tsp', 'whole'];

function roundToStep(a: number, unit: string, step: number): number {
  const s = MEASURED.includes(unit) ? (unit === 'oz' ? 0.5 : step > 0 ? step : 0.25) : 1;
  return Math.max(s, Math.round(a / s) * s);
}

export function buildOption(t: MealTemplate, scale: number): MealOption {
  let p = 0, c = 0, f = 0, k = 0;
  const lines: string[] = [];
  for (const item of t.items) {
    const food = FOOD_BY_ID.get(item.food);
    if (!food) continue;
    const a = t.fixed || scale === 1 ? item.amount : roundToStep(item.amount * scale, food.unit, food.step);
    p += food.protein * a;
    c += food.carbs * a;
    f += food.fat * a;
    k += food.kcal * a;
    lines.push(item.label.replace('{a}', amountText(food, a)).replace('{n}', fmtAmt(a)));
  }
  return { id: t.id, name: t.name, lines, p: Math.round(p), c: Math.round(c), f: Math.round(f), k: Math.round(k), swap: t.swap };
}

export function treatOption(treat?: string): MealOption {
  const name = treat?.trim() ? `${treat.trim().replace(/^./, (ch) => ch.toUpperCase())} night` : 'Treat night';
  return {
    id: 'treat',
    name,
    lines: ['1 serving from the label, in your usual bowl or plate'],
    p: 4,
    c: 30,
    f: 13,
    k: 250,
    kLabel: '~200–300 kcal · check label',
    isTreat: true,
  };
}

function rotate<T>(list: T[], offset: number, count: number): T[] {
  if (list.length <= count) return list;
  const out: T[] = [];
  for (let i = 0; i < count; i++) out.push(list[(offset + i) % list.length]);
  return out;
}

export interface DayMenu {
  b: MealOption[];
  main: MealOption[];
  dinner: MealOption[];
  s: MealOption[];
  x: MealOption[];
}

/** SPEC §6.6: 3 breakfast, 3 lunch/dinner, 4 snack, 3 dessert options per day, rotating by date. */
export function menuForDate(date: string, opts: { diet: Diet; avoid: string[]; kcal: number; treat?: string }): DayMenu {
  const scale = portionTier(opts.kcal);
  const dayNo = Math.max(0, daysBetween('2024-01-01', date));
  const pool = (slot: MealTemplate['slot']) => TEMPLATES.filter((t) => t.slot === slot && templateAllowed(t, opts.diet, opts.avoid));
  const pick = (slot: MealTemplate['slot'], count: number, s = scale) =>
    rotate(pool(slot), dayNo * count, count).map((t) => buildOption(t, s));
  const desserts = pick('x', 2, 1);
  const mains = pool('main');
  // Lunch and dinner draw from the same pool; dinner starts where lunch stops so they differ when the pool allows.
  const lunch = rotate(mains, dayNo * 3, 3);
  const dinner = mains.length >= 6 ? rotate(mains, dayNo * 3 + 3, 3) : lunch;
  return {
    b: pick('b', 3),
    main: lunch.map((t) => buildOption(t, scale)),
    dinner: dinner.map((t) => buildOption(t, scale)),
    s: pick('s', 4, 1),
    x: [...desserts, treatOption(opts.treat)],
  };
}

export const SLOT_DEFS: { id: SlotId; label: string; menu: keyof DayMenu | null; ph: string }[] = [
  { id: 'b', label: 'Breakfast', menu: 'b', ph: 'e.g. bagel with cream cheese' },
  { id: 'l', label: 'Lunch', menu: 'main', ph: 'e.g. chicken burrito bowl' },
  { id: 'd', label: 'Dinner', menu: 'dinner', ph: 'e.g. pepperoni pizza' },
  { id: 's', label: 'Protein snack', menu: 's', ph: 'e.g. protein bar' },
  { id: 'x', label: 'Dessert', menu: 'x', ph: 'e.g. chocolate chip cookies' },
  { id: 'e', label: 'Extras & drinks', menu: null, ph: 'e.g. red wine' },
];

export function optionToEntry(o: MealOption): MealEntry {
  return { name: o.name, items: o.lines, p: o.p, c: o.c, f: o.f, k: o.k, src: 'template', templateId: o.id };
}

/** Does a logged entry count as the user's named treat (or the treat template)? */
export function isTreatEntry(e: MealEntry | null | undefined, treat?: string): boolean {
  if (!e) return false;
  if (e.src === 'template') return e.templateId === 'treat';
  const words = avoidTokens(treat ? [treat] : []);
  const hay = `${e.typed ?? ''} ${e.name}`.toLowerCase();
  return words.length > 0 && words.every((w) => hay.includes(w));
}

/** Search the food list: My foods first, then the seeded DB. Empty query → recent My foods + popular picks. */
export function searchFoods(q: string, myFoods: FoodItem[], diet: Diet, limit = 8): { results: FoodItem[]; total: number } {
  const toks = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const mine = myFoods.map((f) => ({ ...f, mine: true }));
  if (!toks.length) {
    const popular = FOODS.filter((f) => (f as { popular?: boolean }).popular && foodAllowed(f, diet));
    const list = [...mine.slice(-3).reverse(), ...popular];
    return { results: list.slice(0, limit), total: 0 };
  }
  const match = (f: FoodItem) => toks.every((t) => f.name.toLowerCase().includes(t));
  // My foods first, then foods that fit the diet, then the rest (labelled in the list).
  const found = FOODS.filter((f) => match(f));
  const hits = [...mine.filter(match), ...found.filter((f) => foodAllowed(f, diet)), ...found.filter((f) => !foodAllowed(f, diet))];
  return { results: hits.slice(0, limit), total: hits.length };
}
