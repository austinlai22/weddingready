// The in-app coach: a small agent on Google's free Gemini tier ($0) that can
// look at the person's plan and propose changes: move sessions (this week only
// or from now on), swap an exercise, use other equipment for some dates, or
// log a meal. It never changes anything itself: proposals go back to the app,
// which shows a preview and applies them only when the person taps Apply.
// Every proposal is checked against the same training rules as the app.

import { GoogleGenAI, ThinkingLevel, type Content, type FunctionCall } from '@google/genai';
import { z } from 'zod';
import { addDays, DAY_NAMES, dayIndex, isISODate, mondayOf } from '../engine/dates';
import { kcalFromMacros } from '../engine/nutrition';
import { buildPlan, dayPlan, type Plan } from '../engine/plan';
import { applyOps, OpError, ScheduleOpSchema, templateForDate, validateTemplate, type Schedule, type ScheduleOp } from '../engine/schedule';
import { splitFor } from '../engine/split';
import { alternativesFor, equipmentOn, exerciseById, workoutSlots } from '../engine/workouts';
import { dietConflict, searchFoods } from '../engine/meals';
import { WeekTemplateSchema } from '../state/schema';
import { DAY_IDS, type Diet, type Equipment, type MealEntry, type Profile, type SlotId, type WeekTemplate } from '../types';
import { AiUnavailable, asData, coolDown, coolingDown, geminiAccountProblem, geminiBusy } from './ai';
import { profileFromCode, ToolInputError } from './mcp/tools';

// Fastest free models for tool use first (in testing: 3.1 Flash-Lite ~5 s for a
// multi-step request), then the others as fallbacks.
export const COACH_MODELS = [process.env.COACH_MODEL || 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.6-flash'].filter((m, i, a) => a.indexOf(m) === i);
const MAX_STEPS = 8;

const isoDate = z.string().refine(isISODate, 'Expected YYYY-MM-DD');
const SLOTS = ['b', 'l', 'd', 's', 'x', 'e'] as const;

export const CoachRequestSchema = z.object({
  deviceId: z.string().min(8).max(64),
  today: isoDate,
  message: z.string().trim().min(1).max(500),
  history: z.array(z.object({ role: z.enum(['user', 'coach']), text: z.string().max(1500) })).max(10).default([]),
  /** Training details only (a plan code): no body measurements or health answers. */
  plan: z.string().max(2000),
  equipmentOverrides: z.array(z.object({ from: isoDate, to: isoDate, equipment: z.enum(['home_db', 'gym', 'bodyweight']) })).max(20).optional(),
  schedule: z.object({ overrides: WeekTemplateSchema.nullable(), history: z.array(z.object({ until: isoDate, template: WeekTemplateSchema })).max(30) }),
  /** Session ids done, by date, for this week. */
  done: z.record(isoDate, z.array(z.string().max(80)).max(10)).default({}),
  nutrition: z.object({
    mode: z.enum(['habits', 'habits_numbers', 'portions_only']),
    diet: z.enum(['none', 'vegetarian', 'vegan', 'pescatarian', 'no_pork', 'gluten_free', 'dairy_free']),
    targets: z.object({ kcal: z.tuple([z.number(), z.number()]), protein: z.tuple([z.number(), z.number()]), carbs: z.tuple([z.number(), z.number()]), fat: z.tuple([z.number(), z.number()]) }).optional(),
    eaten: z.object({ p: z.number(), c: z.number(), f: z.number(), k: z.number() }).optional(),
    logged: z.array(z.enum(SLOTS)).max(6).default([]),
  }),
});
export type CoachRequest = z.infer<typeof CoachRequestSchema>;

/** Every proposal says what the person told the coach that it relies on, shown in the preview. */
export type Proposal = { basedOn: string } & (
  | { kind: 'schedule'; scope: 'this_week' | 'from_now_on'; ops: ScheduleOp[]; summary: string }
  | { kind: 'swap'; from: string; to: string; fromName: string; toName: string; reason: string }
  | { kind: 'equipment'; from: string; to: string; equipment: Equipment; reason: string }
  | { kind: 'meal'; slot: SlotId; entry: MealEntry }
);

export interface CoachReply {
  reply: string;
  proposals: Proposal[];
  /** Quick answers to the coach's question, when it asked one. */
  options?: string[];
  model: string;
}

const EQUIPMENT_NAMES: Record<Equipment, string> = { home_db: 'home dumbbells', gym: 'a gym', bodyweight: 'no equipment' };
const EQUIPMENT_INPUT = { home_dumbbells: 'home_db', gym: 'gym', bodyweight: 'bodyweight' } as const;

// ---------- Tools ----------

const NoArgs = z.object({});
const DECLARED = {
  get_week: {
    description: 'The person’s training week: each day’s date and sessions (with ids), which are done, and any recovery-rule problems. Look before proposing changes.',
    schema: z.object({ week: z.enum(['this', 'next']).optional().describe('Default this week.') }),
  },
  get_workout: {
    description: 'The strength workout on a date: each exercise with its id, sets and reps, and the equipment used that day.',
    schema: z.object({ date: isoDate.describe('YYYY-MM-DD') }),
  },
  exercise_alternatives: {
    description: 'Exercises that can replace one (same movement first, then gentler related ones), for the person’s equipment.',
    schema: z.object({ exercise_id: z.string().max(64) }),
  },
  propose_schedule_change: {
    description:
      'Propose moving, adding or removing sessions. scope this_week changes only the rest of this week (for a missed or busy day); from_now_on changes every week from today. Returns the resulting week and any rule problems: fix them or explain them. A new call replaces the earlier schedule proposal.',
    schema: z.object({
      scope: z.enum(['this_week', 'from_now_on']),
      changes: z
        .array(
          z.object({
            op: z.enum(['move', 'add', 'remove']),
            session_id: z.string().max(80).optional().describe('For move and remove: an id from get_week.'),
            to_day: z.enum(DAY_IDS).optional().describe('For move.'),
            activity: z.string().max(40).optional().describe('For add: an activity in plain words, e.g. "yoga". Never strength.'),
            day: z.enum(DAY_IDS).optional().describe('For add.'),
          }),
        )
        .min(1)
        .max(6),
      summary: z.string().max(200).describe('One sentence describing the change for the person.'),
      based_on: z.string().min(3).max(200).describe('What the person told you that this relies on, in their terms, e.g. “free Saturday morning”, “hotel gym has dumbbells only”. If you’d have to guess, call ask_question instead.'),
    }),
  },
  propose_exercise_swap: {
    description: 'Propose replacing an exercise in every workout from now on (e.g. lunges for a sore knee). to_exercise_id must come from exercise_alternatives.',
    schema: z.object({
      from_exercise_id: z.string().max(64),
      to_exercise_id: z.string().max(64),
      reason: z.string().max(160),
      based_on: z.string().min(3).max(200).describe('What the person told you that this relies on, in their terms, e.g. “free Saturday morning”, “hotel gym has dumbbells only”. If you’d have to guess, call ask_question instead.'),
    }),
  },
  propose_equipment_change: {
    description: 'Propose different equipment for a stretch of dates (e.g. a hotel gym while travelling), up to 4 weeks.',
    schema: z.object({
      from_date: isoDate,
      to_date: isoDate,
      equipment: z.enum(['home_dumbbells', 'gym', 'bodyweight']).describe('home_dumbbells = dumbbells only (many hotel gyms); gym = racks, cables and machines; bodyweight = nothing.'),
      reason: z.string().max(160),
      based_on: z.string().min(3).max(200).describe('What the person told you that this relies on, in their terms, e.g. “free Saturday morning”, “hotel gym has dumbbells only”. If you’d have to guess, call ask_question instead.'),
    }),
  },
  get_nutrition_today: {
    description: 'Today’s food targets and what’s logged so far, as the person has chosen to see them (some people see no numbers).',
    schema: NoArgs,
  },
  search_foods: {
    description: 'Look up foods in WeddingReady’s list (USDA values; restaurant dishes are estimates).',
    schema: z.object({ query: z.string().max(60) }),
  },
  propose_meal: {
    description: 'Propose logging a meal or snack for today, e.g. an order at a restaurant. Use realistic numbers (calories must roughly equal 4×protein + 4×carbs + 9×fat).',
    schema: z.object({
      slot: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'extra']),
      name: z.string().max(80),
      items: z.array(z.string().max(120)).min(1).max(8),
      protein_g: z.number().min(0).max(300),
      carbs_g: z.number().min(0).max(600),
      fat_g: z.number().min(0).max(300),
      kcal: z.number().min(0).max(4000),
      based_on: z.string().min(3).max(200).describe('What the person told you that this relies on, in their terms, e.g. “free Saturday morning”, “hotel gym has dumbbells only”. If you’d have to guess, call ask_question instead.'),
    }),
  },
  ask_question: {
    description:
      'Ask the person for something you need before you can propose a change correctly: which days they’re free, the exact dates, what equipment they’ll have, which exercise hurts and how, where they’re eating. One question at a time. Give 2–5 short options when there are likely answers. This ends your turn.',
    schema: z.object({
      question: z.string().min(5).max(240),
      options: z.array(z.string().min(1).max(60)).max(5).optional().describe('Short answers they can tap, e.g. ["Friday", "Saturday", "Not this week"].'),
    }),
  },
} satisfies Record<string, { description: string; schema: z.ZodType }>;
type ToolName = keyof typeof DECLARED;

function declarations() {
  return Object.entries(DECLARED).map(([name, d]) => {
    const json = { ...(z.toJSONSchema(d.schema) as Record<string, unknown>) };
    delete json.$schema;
    return { name, description: d.description, parametersJsonSchema: json };
  });
}

const ING: Record<string, string> = {
  updated: 'updating',
  changed: 'changing',
  moved: 'moving',
  added: 'adding',
  removed: 'removing',
  swapped: 'swapping',
  switched: 'switching',
  replaced: 'replacing',
  logged: 'logging',
  scheduled: 'scheduling',
  adjusted: 'adjusting',
  set: 'setting',
};

/**
 * Nothing has changed until the person taps Apply, so "I've moved it" becomes
 * "I suggest moving it" (small models slip into the past tense despite the prompt).
 */
export function honest(text: string): string {
  return text.replace(/\bI(?:['’]ve| have) (?:also )?(updated|changed|moved|added|removed|swapped|switched|replaced|logged|scheduled|adjusted|set)\b/gi, (_m, verb: string) => `I suggest ${ING[verb.toLowerCase()]}`);
}

/** Replies that talk about a change to apply or log, or ask whether to make one. */
const CLAIMS_CHANGE = /propos|tap apply|apply (it|this|the)|log it|one tap|would you like me to|want me to|shall i/i;

const SLOT_ID: Record<string, SlotId> = { breakfast: 'b', lunch: 'l', dinner: 'd', snack: 's', dessert: 'x', extra: 'e' };

/** Runs the coach's tools against the person's plan. Holds the proposals made so far. */
export class CoachSession {
  readonly plan: Plan;
  readonly proposals: Proposal[] = [];
  /** Set when the coach asked the person something; the turn ends there. */
  question: { text: string; options: string[] } | null = null;
  private readonly from: string;

  constructor(
    private readonly req: CoachRequest,
    profile: Profile,
  ) {
    this.plan = buildPlan(profile);
    this.from = req.today < profile.startDate ? profile.startDate : req.today;
  }

  private get schedule(): Schedule {
    return { overrides: this.req.schedule.overrides, history: this.req.schedule.history };
  }

  private sessionsOn(t: WeekTemplate | Schedule, date: string) {
    const day = dayPlan(this.plan, t, date);
    return day.sessions.map((s) => (s.kind === 'strength' ? { id: s.ref.id, kind: 'strength', name: `${s.meta.title} (${s.meta.subtitle})` } : { id: s.ref.id, kind: s.isWalk ? 'walk' : 'activity', name: s.title }));
  }

  /** A week as the person sees it: days already past as they were, the rest from `upcoming` (the plan, or a proposal). */
  private weekView(monday: string, upcoming: WeekTemplate | Schedule) {
    return DAY_IDS.map((d, i) => {
      const date = addDays(monday, i);
      const done = new Set(this.req.done[date] ?? []);
      const past = date < this.from;
      return { day: d, date, past, sessions: this.sessionsOn(past ? this.schedule : upcoming, date).map((s) => ({ ...s, done: done.has(s.id) })) };
    });
  }

  /**
   * For each strength session still to come this week, the days it could move
   * to (this week only) without breaking a training rule. Offer only these.
   */
  private moveOptions(t: WeekTemplate) {
    const p = this.plan.profile;
    const todayIdx = dayIndex(this.from);
    const ok = (next: WeekTemplate) => !validateTemplate(next, p.equipment, p.focusAreas).some((w) => w.severity === 'rule');
    return t.days.flatMap((sessions, day) =>
      day < todayIdx
        ? []
        : sessions
            .filter((s) => s.kind === 'strength' && !(this.req.done[addDays(mondayOf(this.from), day)] ?? []).includes(s.id))
            .map((s) => ({
              session_id: s.id,
              now_on: DAY_IDS[day],
              can_move_to: DAY_IDS.filter((d, i) => i >= todayIdx && i !== day && ok(applyOps(t, [{ op: 'move', sessionId: s.id, toDay: d }], p))),
            })),
    );
  }

  /** Alternatives that aren't already in a workout alongside the exercise being replaced. */
  private swapOptions(id: string) {
    const p = this.plan.profile;
    const keys = [...new Set(splitFor(p.strengthDays))];
    const sessions = keys.map((k) => workoutSlots(k, p.equipment, p.focusAreas).map((s) => p.exerciseSwaps?.[s.id] ?? s.id)).filter((ids) => ids.includes(p.exerciseSwaps?.[id] ?? id) || ids.includes(id));
    const taken = new Set(sessions.flat());
    return alternativesFor(id, p.equipment).filter((o) => !taken.has(o.exercise.id));
  }

  run(name: string, args: unknown): unknown {
    if (!(name in DECLARED)) return { error: `No tool called ${name}.` };
    const parsed = DECLARED[name as ToolName].schema.safeParse(args ?? {});
    if (!parsed.success) return { error: `Bad arguments: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}` };
    const a = parsed.data as Record<string, never>;
    try {
      return this.call(name as ToolName, a);
    } catch (e) {
      if (e instanceof OpError || e instanceof ToolInputError) return { error: e.message };
      throw e;
    }
  }

  private call(name: ToolName, a: Record<string, never>): unknown {
    const p = this.plan.profile;
    switch (name) {
      case 'get_week': {
        const monday = addDays(mondayOf(this.from), a.week === 'next' ? 7 : 0);
        const t = templateForDate(p, this.schedule, monday < this.from ? this.from : monday);
        return {
          today: `${DAY_NAMES[dayIndex(this.req.today)]} ${this.req.today}`,
          days: this.weekView(monday, this.schedule),
          rule_problems: validateTemplate(t, p.equipment, p.focusAreas).filter((w) => w.severity === 'rule').map((w) => w.text),
          ...(a.week === 'next' ? {} : { move_options: this.moveOptions(t) }),
        };
      }
      case 'get_workout': {
        const date = a.date as string;
        const day = dayPlan(this.plan, this.schedule, date);
        const s = day.sessions.find((x) => x.kind === 'strength');
        if (!s || s.kind !== 'strength') return { date, strength_workout: null, note: `${day.title}: no strength session that day.` };
        return {
          date,
          name: `${s.meta.title} (${s.meta.subtitle})`,
          equipment: EQUIPMENT_NAMES[equipmentOn(p, date)],
          exercises: s.exercises.map((e) => ({ exercise_id: e.exercise.id, name: e.exercise.name, prescription: e.rx, main_lift: e.main })),
        };
      }
      case 'exercise_alternatives': {
        const id = a.exercise_id as string;
        exerciseById(id);
        return {
          options: this.swapOptions(id)
            .slice(0, 8)
            .map((o) => ({ exercise_id: o.exercise.id, name: o.exercise.name, same_movement: o.same, works: o.exercise.primaryMuscles.join(', ') })),
        };
      }
      case 'propose_schedule_change': {
        const scope = a.scope as 'this_week' | 'from_now_on';
        const ops = (a.changes as { op: string; session_id?: string; to_day?: string; activity?: string; day?: string }[]).map((c) => {
          const candidate = c.op === 'move' ? { op: 'move', sessionId: c.session_id, toDay: c.to_day } : c.op === 'add' ? { op: 'add', activity: c.activity, day: c.day } : { op: 'remove', sessionId: c.session_id };
          const r = ScheduleOpSchema.safeParse(candidate);
          if (!r.success) throw new ToolInputError(`A ${c.op} change is missing ${c.op === 'add' ? 'activity or day' : 'session_id or to_day'}.`);
          return r.data;
        });
        if (scope === 'this_week') {
          const todayIdx = dayIndex(this.from);
          const past = ops.find((o) => (o.op === 'move' && DAY_IDS.indexOf(o.toDay) < todayIdx) || (o.op === 'add' && DAY_IDS.indexOf(o.day) < todayIdx));
          if (past) throw new ToolInputError('That day has already passed this week. Pick today or a later day.');
        }
        const before = templateForDate(p, this.schedule, this.from);
        const after = applyOps(before, ops, p);
        const proposal: Proposal = { kind: 'schedule', scope, ops, summary: String(a.summary), basedOn: String(a.based_on) };
        const at = this.proposals.findIndex((x) => x.kind === 'schedule');
        if (at >= 0) this.proposals[at] = proposal;
        else this.proposals.push(proposal);
        return {
          proposed: true,
          week_after: this.weekView(mondayOf(this.from), after).map((d) => ({ day: d.day, sessions: d.sessions.map((s) => s.name) })),
          rule_problems: validateTemplate(after, p.equipment, p.focusAreas).filter((w) => w.severity === 'rule').map((w) => w.text),
        };
      }
      case 'propose_exercise_swap': {
        const from = exerciseById(a.from_exercise_id as string);
        const to = this.swapOptions(from.id).find((o) => o.exercise.id === a.to_exercise_id)?.exercise;
        if (!to) return { error: `${a.to_exercise_id} can’t replace ${from.name} with this equipment. Use an id from exercise_alternatives.` };
        this.proposals.push({ kind: 'swap', from: from.id, to: to.id, fromName: from.name, toName: to.name, reason: String(a.reason), basedOn: String(a.based_on) });
        return { proposed: true, swap: `${from.name} → ${to.name} in every workout from now on` };
      }
      case 'propose_equipment_change': {
        const from = a.from_date as string;
        const to = a.to_date as string;
        if (from < this.req.today) return { error: 'from_date has already passed.' };
        if (to < from) return { error: 'to_date must be on or after from_date.' };
        if (to > addDays(from, 27)) return { error: 'Keep it to 4 weeks or less; for a lasting change, the person can change equipment in Settings.' };
        if (to >= this.plan.timeline.weddingDate) return { error: 'That runs into the wedding.' };
        const equipment = EQUIPMENT_INPUT[a.equipment as keyof typeof EQUIPMENT_INPUT];
        this.proposals.push({ kind: 'equipment', from, to, equipment, reason: String(a.reason), basedOn: String(a.based_on) });
        return { proposed: true, change: `${EQUIPMENT_NAMES[equipment]} from ${from} to ${to}; the workouts switch to versions for that equipment.` };
      }
      case 'get_nutrition_today': {
        const n = this.req.nutrition;
        const logged = n.logged.map((s) => Object.entries(SLOT_ID).find(([, v]) => v === s)?.[0]);
        if (n.mode === 'portions_only' || !n.targets) {
          return { mode: 'portions only: never mention calories, grams or numbers', logged, guidance: 'A palm of protein at every meal and snack, half the plate vegetables, a cupped handful of carbs, a thumb of fat.' };
        }
        const eaten = n.eaten ?? { p: 0, c: 0, f: 0, k: 0 };
        if (n.mode === 'habits') {
          return { mode: 'protein only: don’t mention calories', protein_target_g: n.targets.protein, protein_eaten_g: Math.round(eaten.p), logged, diet: n.diet };
        }
        return { mode: 'numbers', targets: n.targets, eaten: { protein_g: Math.round(eaten.p), carbs_g: Math.round(eaten.c), fat_g: Math.round(eaten.f), kcal: Math.round(eaten.k) }, logged, diet: n.diet };
      }
      case 'search_foods': {
        const n = this.req.nutrition;
        const { results } = searchFoods(String(a.query), [], n.diet as Diet, 6);
        return {
          foods: results.map((f) => ({
            name: f.name,
            per: `1 ${f.unit}`,
            ...(n.mode === 'portions_only' ? {} : { protein_g: Math.round(f.protein * 10) / 10 }),
            ...(n.mode === 'habits_numbers' ? { kcal: Math.round(f.kcal), carbs_g: Math.round(f.carbs), fat_g: Math.round(f.fat) } : {}),
            fits_diet: dietConflict(f as never, n.diet as Diet) === null,
          })),
        };
      }
      case 'propose_meal': {
        const k = Math.round(a.kcal as number);
        const fromMacros = kcalFromMacros(a.protein_g as number, a.carbs_g as number, a.fat_g as number);
        if (Math.abs(k - fromMacros) / Math.max(k, fromMacros, 1) > 0.25) return { error: `Calories (${k}) don’t match the macros (${fromMacros}). Fix the numbers.` };
        const entry: MealEntry = {
          name: String(a.name).slice(0, 80),
          items: (a.items as string[]).slice(0, 8),
          p: Math.round(a.protein_g as number),
          c: Math.round(a.carbs_g as number),
          f: Math.round(a.fat_g as number),
          k,
          src: 'ai',
          conf: 'medium',
          note: 'Suggested by your coach; restaurant portions vary.',
        };
        this.proposals.push({ kind: 'meal', slot: SLOT_ID[a.slot as string], entry, basedOn: String(a.based_on) });
        return { proposed: true };
      }
      case 'ask_question': {
        this.question = { text: String(a.question), options: ((a.options as string[] | undefined) ?? []).slice(0, 5) };
        return { asked: true };
      }
    }
  }
}

// ---------- The agent loop ----------

function systemPrompt(req: CoachRequest, plan: Plan): string {
  const p = plan.profile;
  const numbers = req.nutrition.mode === 'habits_numbers' ? 'They see calories and macros.' : req.nutrition.mode === 'habits' ? 'They see a protein target but no calories: never mention calories.' : 'They chose no food numbers at all: never mention calories, grams or any food numbers.';
  return `You are the coach inside WeddingReady, an app that plans strength training and food for the months before someone's wedding.
Today is ${DAY_NAMES[dayIndex(req.today)]} ${req.today}. The wedding is ${plan.timeline.weddingDate}. They train ${p.strengthDays} days a week with ${EQUIPMENT_NAMES[p.equipment]}. ${numbers}

A wrong change is worse than no change. Before proposing anything, make sure you know what you need. If something important is missing or could mean two things, call ask_question: one question at a time, with tap-able options when there are likely answers. Don't ask about things you can look up with the tools or work out from today's date.

What you need before proposing:
- Missed or busy day: which session it is (look it up), and which day they can train instead. get_week lists move_options: the days each session can move to without breaking a training rule. Ask which of those days works, offering only those days plus "Skip it this week". If they already named a day, check it's in move_options; if not, say why and offer the ones that are.
- Travel: the exact dates (turn "next week" into dates yourself and say them back) and what they'll have to train with. "Hotel gym" can mean dumbbells only (home_dumbbells), a full gym with racks and machines (gym), or almost nothing (bodyweight): always ask unless they told you.
- Pain or injury: which exercise or movement hurts, and whether it's sharp, swollen or getting worse. If it is, tell them to stop training that area and see a doctor or physio, and don't propose a swap. For a dull ache in certain moves, swap those moves.
- Eating out: where they're eating, and (to log it) what they're ordering or considering.
- Lasting changes (a new class schedule, a new job): which days, and whether it's every week from now on.

How to work:
- Look before you act: use get_week or get_workout to see the plan.
- Once you have what you need, propose straight away with the propose_ tools; don't ask "would you like me to". Fill based_on with what they told you.
- You can only propose. Write "I suggest…" or "Here's a change you can apply". Never write "I've updated", "I've changed" or "done": nothing changes until they tap Apply.
- Use ids exactly as tools return them.
- Training rules: with 2–3 strength days (full body) never put two on back-to-back days and keep an easy day between them; with 4–5 days, never the same session two days running. If a proposal returns rule_problems, fix it or explain the trade-off.
- A missed or busy day is usually this_week scope. A lasting change (new class schedule) is from_now_on.
- Pain or injury: find the exercises involved with get_workout, pick a gentler option from exercise_alternatives, and propose_exercise_swap for each one. Tell them to stop anything that hurts and to see a doctor or physio if pain is sharp or lasts. Don't diagnose.
- Eating out or "what should I eat": call get_nutrition_today, choose one specific order that fits what's left of their day, and propose_meal with it so they can log it in one tap.
- Food: never change their calorie targets or suggest eating less than their target. Keep their diet in mind.
- Not medical advice. Don't discuss weight loss for anyone who chose no food numbers.
- Reply in plain, warm, short sentences: under 90 words, no headings, no tables.`;
}

let client: GoogleGenAI | null = null;

async function step(model: string, contents: Content[], system: string) {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { timeout: 15_000, retryOptions: { attempts: 1 } } });
  return client.models
    .generateContent({
      model,
      contents,
      config: { systemInstruction: system, tools: [{ functionDeclarations: declarations() }], thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }, maxOutputTokens: 1500 },
    })
    .catch((e: unknown) => {
      throw geminiAccountProblem(e) ?? e;
    });
}

/** One step on the first free model that answers; busy or out-of-quota models are skipped for a while. */
async function stepWithFallback(contents: Content[], system: string, preferred: string | null): Promise<{ model: string; response: Awaited<ReturnType<typeof step>> }> {
  const order = preferred ? [preferred, ...COACH_MODELS.filter((m) => m !== preferred)] : COACH_MODELS;
  const ready = order.filter((m) => !coolingDown(m));
  let quota = false;
  for (const model of ready.length ? ready : order) {
    try {
      return { model, response: await step(model, contents, system) };
    } catch (e) {
      if (e instanceof AiUnavailable && e.message === 'quota') {
        quota = true;
        coolDown(model, 10 * 60_000);
        continue;
      }
      if (!geminiBusy(e)) throw e;
      coolDown(model, 2 * 60_000);
    }
  }
  throw new AiUnavailable(quota ? 'quota' : 'all free models busy');
}

export async function runCoach(req: CoachRequest): Promise<CoachReply> {
  if (!process.env.GEMINI_API_KEY) throw new AiUnavailable('no AI key set');
  const profile = profileFromCode(req.plan, req.today, { equipmentOverrides: req.equipmentOverrides });
  const session = new CoachSession(req, profile);
  const system = systemPrompt(req, session.plan);
  const contents: Content[] = [
    ...req.history.map((h) => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.role === 'user' ? asData(h.text, 500) : h.text.slice(0, 1500) }] })),
    { role: 'user', parts: [{ text: asData(req.message, 500) }] },
  ];
  let model: string | null = null;
  let nudged = false;
  for (let i = 0; i < MAX_STEPS; i++) {
    const r = await stepWithFallback(contents, system, model);
    model = r.model;
    const calls: FunctionCall[] = r.response.functionCalls ?? [];
    if (!calls.length) {
      const text = (r.response.text ?? '').trim();
      // Small models sometimes describe a change (or ask whether to make it) without
      // proposing it. Point that out once, so the reply and the proposals match.
      if (!nudged && !session.proposals.length && CLAIMS_CHANGE.test(text)) {
        nudged = true;
        contents.push({ role: 'model', parts: [{ text }] });
        contents.push({
          role: 'user',
          parts: [{ text: '(App note, not from the person) Nothing has been proposed, so there is nothing to apply. If you know everything the change needs, call the right propose_ tool now. If anything is missing or you would be guessing, call ask_question instead.' }],
        });
        continue;
      }
      const reply = session.proposals.length ? honest(text) : text;
      return { reply: reply || 'I couldn’t work that out. Try saying it another way.', proposals: session.proposals, model };
    }
    const turn = r.response.candidates?.[0]?.content;
    if (turn) contents.push(turn);
    contents.push({
      role: 'user',
      parts: calls.map((c) => ({ functionResponse: { name: c.name ?? '', ...(c.id ? { id: c.id } : {}), response: { result: session.run(c.name ?? '', c.args) } } })),
    });
    if (session.question) {
      // The coach needs an answer first. Anything it proposed in the same breath
      // was made without it, so it's dropped: a wrong change is worse than none.
      const preamble = (turn?.parts ?? []).map((part) => part.text ?? '').join(' ').trim();
      const reply = preamble && !preamble.includes(session.question.text) ? `${preamble} ${session.question.text}` : session.question.text;
      return { reply, proposals: [], options: session.question.options, model };
    }
  }
  return {
    reply: session.proposals.length ? 'Here’s what I’d change. Have a look and tap Apply if it works for you.' : 'That took more steps than I can manage. Try a simpler request.',
    proposals: session.proposals,
    model: model ?? COACH_MODELS[0],
  };
}
