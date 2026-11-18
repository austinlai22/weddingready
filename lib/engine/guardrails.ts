import type { Goal, NutritionMode, Profile, Safety } from '../types';
import { bmi } from './nutrition';

// SPEC §6.7. Every rule here is enforced twice: by the onboarding/settings UI
// (disabled options with a reason) and by the engine (effectiveProfile), so a
// hand-edited import can never get around them.

export const MIN_AGE = 18;
export const MIN_BMI = 18.5;

export const ED_HELPLINE = {
  name: 'National Alliance for Eating Disorders',
  phone: '866-662-1235',
  tel: 'tel:+18666621235',
  url: 'https://www.allianceforeatingdisorders.com/',
};

export function isAdult(age: number): boolean {
  return Number.isFinite(age) && age >= MIN_AGE;
}

export function loseFatBlockedReason(p: { safety: Safety; weightKg: number; heightCm: number }): string | null {
  if (p.safety.edHistory) return 'Not offered here. This plan focuses on strength and feeling good.';
  if (p.safety.pregnantOrPostpartum) return 'Not offered while pregnant or postpartum. Check with your doctor or midwife.';
  if (p.weightKg > 0 && p.heightCm > 0 && bmi(p.weightKg, p.heightCm) < MIN_BMI) {
    return 'Not offered at your current height and weight.';
  }
  return null;
}

export function numbersModeBlocked(safety: Safety): boolean {
  return safety.edHistory;
}

/** Goals with the exclusivity rule and guardrails applied. Never empty. */
export function allowedGoals(goals: Goal[], p: { safety: Safety; weightKg: number; heightCm: number }): Goal[] {
  let out = [...new Set(goals)];
  if (out.includes('lose_fat') && out.includes('maintain')) out = out.filter((g) => g !== 'maintain');
  if (loseFatBlockedReason(p)) out = out.filter((g) => g !== 'lose_fat');
  return out.length ? out : ['maintain'];
}

export function allowedNutritionMode(mode: NutritionMode, safety: Safety): NutritionMode {
  if (safety.edHistory) return 'portions_only';
  return mode;
}

/** The default style offered at onboarding (pregnancy defaults away from numbers but allows them). */
export function defaultNutritionMode(safety: Safety): NutritionMode {
  if (safety.edHistory) return 'portions_only';
  if (safety.pregnantOrPostpartum) return 'habits';
  return 'habits_numbers';
}

/** Rejects a target weight that implies BMI < 18.5. */
export function targetWeightAllowed(targetKg: number, heightCm: number): boolean {
  return targetKg > 0 && bmi(targetKg, heightCm) >= MIN_BMI;
}

export function effectiveProfile(p: Profile): Profile {
  const goals = allowedGoals(p.goals, p);
  // A goal weight counts only with Lose fat, without an eating-disorder history, and at a healthy weight for the height.
  const goalOk = p.goalWeightKg !== undefined && goals.includes('lose_fat') && !p.safety.edHistory && targetWeightAllowed(p.goalWeightKg, p.heightCm);
  const { goalWeightKg: _drop, ...rest } = p;
  void _drop;
  return {
    ...rest,
    ...(goalOk ? { goalWeightKg: p.goalWeightKg } : {}),
    goals,
    nutritionMode: allowedNutritionMode(p.nutritionMode, p.safety),
  };
}

export interface SafetyNote {
  kind: 'pregnancy' | 'ed' | 'medical';
  text: string;
}

export function safetyNotes(safety: Safety): SafetyNote[] {
  const notes: SafetyNote[] = [];
  if (safety.pregnantOrPostpartum) {
    notes.push({ kind: 'pregnancy', text: 'Check with your doctor or midwife before changing your training. This plan has no calorie deficit.' });
  }
  if (safety.edHistory) {
    notes.push({
      kind: 'ed',
      text: 'Your plan skips calorie numbers and weight goals and focuses on strength, energy and regular meals. If food feels hard right now, a doctor or the National Alliance for Eating Disorders can help.',
    });
  }
  if (safety.medicalCondition) {
    notes.push({ kind: 'medical', text: 'Check with your doctor before you start, and tell them what this plan includes.' });
  }
  return notes;
}
