import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { NutritionModes } from '@/components/explain/FoodVisuals';
import { WeekDiagram } from '@/components/explain/WeekDiagram';
import { WeeklySetsChart } from '@/components/explain/WeeklySetsChart';
import { OpenAppLink } from '@/components/landing/OpenAppLink';
import { BTN, SiteFooter, SiteHeader } from '@/components/landing/SiteChrome';
import { LineIcon, type IconName } from '@/components/ui/LineIcon';
import { PHASE_COPY } from '@/lib/engine/copy';
import { FOODS } from '@/lib/engine/meals';
import { EXERCISES } from '@/lib/engine/workouts';
import { examplePlan, exampleTargets, PHASE_FILL } from '@/lib/example';
import { exampleWeeks, fittingWeek, weeklyVolume } from '@/lib/explain';

export const metadata: Metadata = {
  title: 'How the plan works',
  description: 'How WeddingReady builds a training and food plan from your wedding date: the phases, your week, food, safety and where the numbers come from.',
};

const usdaFoods = FOODS.filter((f) => f.source.startsWith('USDA')).length;

function Section({ n, id, title, lead, children, tint = false }: { n: number; id: string; title: string; lead: ReactNode; children: ReactNode; tint?: boolean }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={`scroll-mt-6 border-t border-line ${tint ? 'bg-surface' : ''}`}>
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
        <p className="font-display text-sm italic text-muted">{String(n).padStart(2, '0')}</p>
        <h2 id={`${id}-h`} className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {title}
        </h2>
        <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-ink-2">{lead}</p>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

/** Icon + one short line. */
function Facts({ items }: { items: { icon: IconName; title: string; body?: string }[] }) {
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-x-8 gap-y-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((f) => (
        <li key={f.title} className="flex items-start gap-3.5">
          <LineIcon name={f.icon} size="sm" />
          <div className="pt-1.5">
            <p className="text-[16px] font-semibold leading-snug text-ink">{f.title}</p>
            {f.body && <p className="mt-0.5 text-[15px] leading-relaxed text-ink-2">{f.body}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function RuleCard({ title, rule, children }: { title: string; rule: string; children: ReactNode }) {
  return (
    <figure className="m-0 rounded-2xl border border-line bg-surface p-3 sm:p-5">
      <figcaption className="mb-4 px-1">
        <span className="block font-display text-2xl font-semibold text-ink">{title}</span>
        <span className="mt-1 block text-[15px] text-ink-2">{rule}</span>
      </figcaption>
      {children}
    </figure>
  );
}

export default function HowItWorks() {
  const t = examplePlan.timeline;
  return (
    <div className="bg-ground text-ink">
      <SiteHeader />
      <main>
        <header className="mx-auto max-w-6xl px-5 pb-14 pt-14 sm:px-8 lg:pb-16 lg:pt-20">
          <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">How the plan works</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-2">
            The rules behind your plan, shown with the example plan from the home page.
          </p>
        </header>

        <Section n={1} id="phases" title="Phases" tint lead="Your plan counts back from the wedding in four phases. Maintain starts at least two weeks before your fitting, so alterations still fit on the day.">
          <ol className="m-0 mb-12 grid list-none grid-cols-2 gap-3 p-0 lg:grid-cols-4">
            {t.phases.map((p) => (
              <li key={p.name} className="rounded-2xl border border-line bg-ground p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm" style={{ background: PHASE_FILL[p.name] }} />
                  <span className="font-display text-xl font-semibold text-ink">{p.label}</span>
                </div>
                <p className="mt-2 text-[15px] leading-snug text-ink-2">{PHASE_COPY[p.name].focus.split('.')[0]}.</p>
                <p className="mt-2 text-[13px] text-muted">{p.weeks} weeks</p>
              </li>
            ))}
          </ol>
          <WeeklySetsChart weeks={weeklyVolume} fittingWeek={fittingWeek} weddingDate={t.weddingDate} />
        </Section>

        <Section n={2} id="week" title="Your week" lead="Pick two to five strength days. The app fits them around what you already do.">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RuleCard title="2 or 3 days: full body" rule="Never back to back. An easy day in between.">
              <WeekDiagram days={exampleWeeks.fullBody} />
            </RuleCard>
            <RuleCard title="4 or 5 days: split" rule="The body is split in two, so back to back is fine.">
              <WeekDiagram days={exampleWeeks.split} />
            </RuleCard>
          </div>
          <div className="mt-10">
            <Facts
              items={[
                { icon: 'rest', title: 'Hard days stay apart', body: 'Runs, rides, classes and sports are kept off strength days.' },
                { icon: 'alert', title: 'Too full? It says so', body: 'You get a suggested fix, like moving a class or one fewer strength day.' },
                { icon: 'move', title: 'Change anything', body: 'Drag sessions to other days. It warns you if recovery gets short.' },
              ]}
            />
          </div>
        </Section>

        <Section n={3} id="food" title="Food" tint lead="Choose how much detail you want. You can switch any time.">
          <NutritionModes t={exampleTargets} />
          <div className="mt-10">
            <Facts
              items={[
                { icon: 'meal', title: 'Gentle deficit', body: 'To lose fat, about 15% under what you burn. Never below your resting needs.' },
                { icon: 'dumbbell', title: 'Protein first', body: '1.6 to 2 g per kg of body weight a day.' },
                { icon: 'dessert', title: 'Dessert stays', body: 'One or two dessert nights every week.' },
              ]}
            />
          </div>
        </Section>

        <Section n={4} id="safety" title="Safety" lead="A few setup answers change the plan automatically.">
          <Facts
            items={[
              { icon: 'adult', title: 'Adults only', body: 'Setup stops under 18.' },
              { icon: 'heart', title: 'Pregnant or postpartum', body: 'No calorie deficit.' },
              { icon: 'hidden', title: 'Eating disorder history', body: 'No calorie numbers or weight goals, plus a helpline.' },
              { icon: 'ban', title: 'Already a low weight', body: 'No fat-loss target.' },
              { icon: 'calendar', title: 'For everyone', body: 'No streaks and no before-and-after photos.' },
            ]}
          />
        </Section>

        <Section n={5} id="sources" title="Where the numbers come from" tint lead="Calorie needs use the Mifflin-St Jeor equation and are shown as a range. AI meal estimates list their assumptions, and you can edit them.">
          <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              [`${usdaFoods}`, `of ${FOODS.length} foods use USDA values`],
              [`${EXERCISES.length}`, 'exercises with form cues'],
              ['3', 'versions of every workout: dumbbells, gym, bodyweight'],
            ].map(([big, small]) => (
              <div key={small} className="rounded-2xl border border-line bg-ground p-5">
                <dt className="font-display text-5xl font-semibold leading-none tracking-tight text-plum">{big}</dt>
                <dd className="m-0 mt-3 text-[15px] leading-relaxed text-ink-2">{small}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <section aria-labelledby="limits-h" className="border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
            <div className="max-w-2xl rounded-2xl border-l-4 border-gold bg-surface p-6">
              <h2 id="limits-h" className="font-display text-2xl font-semibold text-ink">
                What it isn’t
              </h2>
              <p className="mt-2 text-[16px] leading-relaxed text-ink-2">
                Medical advice. A dietitian or trainer hasn’t reviewed these rules yet. If something hurts, stop. <Link href="/terms">Terms</Link> ·{' '}
                <Link href="/privacy">Privacy</Link>
              </p>
            </div>
          </div>
        </section>

        <section className="bg-plum">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-5 py-16 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
            <p className="max-w-xl font-display text-3xl font-semibold leading-tight text-ground sm:text-4xl">See it with your own dates.</p>
            <OpenAppLink className={`${BTN} bg-ground text-plum hover:bg-rose-tint hover:text-plum`} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
