import type { Plan } from '@/lib/engine/plan';
import { fmtShort } from '@/lib/engine/dates';

/** SPEC §6.6 realistic-expectations line. Never a promise; with a goal weight, says honestly whether the plan can reach it safely. */
export function ExpectationLine({ plan }: { plan: Plan }) {
  const p = plan.profile;
  if (p.safety.edHistory) return null;
  const e = plan.expectation;
  if (!p.goals.includes('lose_fat') || plan.shortTimeline) {
    return (
      <p className="banner">
        <strong>What to expect:</strong> stronger lifts and more energy week by week. The scale may not move much, and that’s fine.
      </p>
    );
  }
  if (!e || e.highKg < 0.5) {
    return (
      <p className="banner">
        <strong>What to expect:</strong> your shape and strength will change more than the scale. Expect lifts to climb and clothes to fit differently.
      </p>
    );
  }
  const imperial = p.units === 'imperial';
  const conv = (kg: number) => (imperial ? kg * 2.20462 : kg);
  const lo = Math.max(1, Math.round(conv(e.lowKg)));
  const hi = Math.max(lo, Math.round(conv(e.highKg)));
  const unit = imperial ? 'lb' : 'kg';
  const until = plan.expectationUntil === 'your fitting' ? 'your fitting' : `the time Maintain starts (${fmtShort(plan.timeline.maintainStartDate)})`;
  if (plan.goal) {
    const target = Math.max(1, Math.round(conv(plan.goal.toLoseKg)));
    return (
      <p className="banner">
        <strong>Your goal:</strong> {target} {unit} by {until}.{' '}
        {plan.goal.reachable
          ? `Your calories are set to aim for it. Realistically, expect about ${lo === hi ? lo : `${lo}–${hi}`} ${unit}; bodies vary.`
          : `That’s more than the plan can safely aim for in the time, so your calories use the safest pace instead: realistically about ${lo === hi ? lo : `${lo}–${hi}`} ${unit}. Strength and shape will change more than the scale.`}
      </p>
    );
  }
  return (
    <p className="banner">
      <strong>What to expect:</strong> about {lo === hi ? lo : `${lo}–${hi}`} {unit} lighter by {until}, if you stay consistent. Bodies vary, so treat this as a rough guide, not a target.
    </p>
  );
}
