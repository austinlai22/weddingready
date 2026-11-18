// The coach's model step, on Google's free Gemini tier ($0). The app runs the
// coach's tools and loop in the browser (lib/coach/session.ts) and sends one
// step at a time to /api/coach, which calls coachStep. The server writes the
// instructions itself from a few plain facts, so a request can't replace them.
// runCoach runs the whole loop here, for tests and the coach eval.

import { GoogleGenAI, ThinkingLevel, type Content } from '@google/genai';
import { z } from 'zod';
import { CoachContextSchema, CoachSession, coachContext, declarations, runCoachLoop, systemPrompt, TOOL_NAMES, type CoachContext, type CoachReply, type CoachRequest, type StepResult } from '../coach/session';
import { AiUnavailable, coolDown, coolingDown, geminiAccountProblem, geminiBusy, withDeadline } from './ai';
import { profileFromCode } from './mcp/tools';

export * from '../coach/session';

// Fastest free models for tool use first (in testing: 3.1 Flash-Lite ~5 s for a
// multi-step request), then the others as fallbacks.
export const COACH_MODELS = [process.env.COACH_MODEL || 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.6-flash'].filter((m, i, a) => a.indexOf(m) === i);

// ---------- What /api/coach accepts ----------

const toolName = z.enum(TOOL_NAMES as [string, ...string[]]);
const jsonSize = (v: unknown) => JSON.stringify(v ?? null).length;
/** Only the part fields a coach conversation uses: text, tool calls and results, and the model's thought signatures. */
const PartSchema = z
  .object({
    text: z.string().max(4000).optional(),
    thought: z.boolean().optional(),
    thoughtSignature: z.string().max(20_000).optional(),
    functionCall: z.object({ name: toolName, id: z.string().max(128).optional(), args: z.record(z.string(), z.unknown()).optional() }).optional(),
    functionResponse: z.object({ name: toolName, id: z.string().max(128).optional(), response: z.record(z.string(), z.unknown()) }).optional(),
  })
  .refine((p) => jsonSize(p) <= 16_000, 'Part too large');
export const CoachStepRequestSchema = z.object({
  deviceId: z.string().min(8).max(64),
  context: CoachContextSchema,
  contents: z.array(z.object({ role: z.enum(['user', 'model']), parts: z.array(PartSchema).min(1).max(12) })).min(1).max(40),
  model: z.string().max(64).nullable().optional(),
});
export type CoachStepRequest = z.infer<typeof CoachStepRequestSchema>;

let client: GoogleGenAI | null = null;
async function step(model: string, contents: Content[], system: string) {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { timeout: 15_000, retryOptions: { attempts: 1 } } });
  return withDeadline(
    client.models.generateContent({
      model,
      contents,
      config: { systemInstruction: system, tools: [{ functionDeclarations: declarations() }], thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }, maxOutputTokens: 1500 },
    }),
    17_000,
  ).catch((e: unknown) => {
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

/** One coach step for a context the server checked; the model's turn is returned as-is so it can be sent back. */
export async function coachStep(contents: Content[], ctx: CoachContext, preferred: string | null): Promise<StepResult> {
  if (!process.env.GEMINI_API_KEY) throw new AiUnavailable('no AI key set');
  const r = await stepWithFallback(contents, systemPrompt(ctx), preferred && COACH_MODELS.includes(preferred) ? preferred : null);
  const turn = r.response.candidates?.[0]?.content ?? null;
  return {
    model: r.model,
    text: (turn?.parts ?? []).filter((part) => part.text && !part.thought).map((part) => part.text).join(''),
    calls: (r.response.functionCalls ?? []).map((c) => ({ name: c.name ?? '', ...(c.args ? { args: c.args as Record<string, unknown> } : {}), ...(c.id ? { id: c.id } : {}) })),
    turn,
  };
}

/** The whole coach on the server, for tests and the eval. */
export async function runCoach(req: CoachRequest): Promise<CoachReply> {
  if (!process.env.GEMINI_API_KEY) throw new AiUnavailable('no AI key set');
  const session = new CoachSession(req, profileFromCode(req.plan, req.today, { equipmentOverrides: req.equipmentOverrides }));
  const ctx = coachContext(req, session.plan);
  return runCoachLoop(req, session, (contents, preferred) => coachStep(contents, ctx, preferred));
}
