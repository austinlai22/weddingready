import type { Plan } from '@/lib/engine/plan';
import { fmtShort } from '@/lib/engine/dates';

/** SPEC §6.6 realistic-expectations line. Never a promise; with a goal weight, says honestly whether the plan can reach it safely. */
export function ExpectationLine({ plan }: { plan: Plan }) {
  const p = plan.profile;
  if (p.safety.edHistory) return null;
  const e = plan.expectation;
  if (p.goalReachedAt && p.goals.includes('lose_fat')) {
    return (
      <p className="banner">
        <strong>Goal reached.</strong> You’re eating at maintenance now. Keep training to hold on to your strength and shape.
      </p>
    );
  }
  if (!p.goals.includes('lose_fat') || plan.shortTimeline) {
    return (
      <p className="banner">
        <strong>What to expect:</strong> stronger lifts and more energy week by week. The scale may not move much, and that’s fine.
      </p>
    );
  }
  const imperial = p.units === 'imperial';
  const conv = (kg: number) => (imperial ? kg * 2.20462 : kg);
  const unit = imperial ? 'lb' : 'kg';
  const range = (lowKg: number, highKg: number) => {
    const lo = Math.max(1, Math.round(conv(lowKg)));
    const hi = Math.max(lo, Math.round(conv(highKg)));
    return lo === hi ? `${lo}` : `${lo}–${hi}`;
  };
  const until = plan.expectationUntil === 'your fitting' ? 'your fitting' : `the time Maintain starts (${fmtShort(plan.timeline.maintainStartDate)})`;
  const g = plan.goal;
  if (g) {
    const target = Math.max(1, Math.round(conv(g.toLoseKg)));
    const realistic = g.highKg >= 0.5 ? `about ${range(g.lowKg, g.highKg)} ${unit}` : 'little change on the scale';
    return (
      <p className="banner">
        <strong>Your goal:</strong> lose {target} {unit} by {until}.{' '}
        {g.reachable
          ? `Your calories are set to aim for it. Realistically, expect ${realistic}; bodies vary.`
          : `That’s more than the plan can safely aim for in the time, so your calories use the safest pace instead. Realistically, expect ${realistic}. Strength and shape will change more than the scale.`}
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
  const lo = Math.max(1, Math.round(conv(e.lowKg)));
  const hi = Math.max(lo, Math.round(conv(e.highKg)));
  return (
    <p className="banner">
      <strong>What to expect:</strong> about {lo === hi ? lo : `${lo}–${hi}`} {unit} lighter by {until}, if you stay consistent. Bodies vary, so treat this as a rough guide, not a target.
    </p>
  );
}
