import type { Plan } from '@/lib/engine/plan';
import { fmtShort } from '@/lib/engine/dates';

/** SPEC §6.6 realistic-expectations line. Never a promise, never a goal weight. */
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
  return (
    <p className="banner">
      <strong>What to expect:</strong> about {lo === hi ? lo : `${lo}–${hi}`} {unit} lighter by {until}, if you stay consistent. Bodies vary, so treat this as a rough guide, not a target.
    </p>
  );
}
