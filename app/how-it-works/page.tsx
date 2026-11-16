import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { EnergyRange, NutritionModes } from '@/components/explain/FoodVisuals';
import { WeekDiagram, WeekLegend } from '@/components/explain/WeekDiagram';
import { WeeklySetsChart } from '@/components/explain/WeeklySetsChart';
import { OpenAppLink } from '@/components/landing/OpenAppLink';
import { BTN, SiteFooter, SiteHeader } from '@/components/landing/SiteChrome';
import { fmtShort } from '@/lib/engine/dates';
import { PHASE_COPY } from '@/lib/engine/copy';
import { FOODS } from '@/lib/engine/meals';
import { EXERCISES } from '@/lib/engine/workouts';
import { examplePlan, PHASE_FILL } from '@/lib/example';
import { exampleLoseFat, exampleMaintenance, exampleWeeks, fittingWeek, weeklyVolume } from '@/lib/explain';

export const metadata: Metadata = {
  title: 'How the plan works',
  description: 'The rules WeddingReady follows to build a training and food plan from your wedding date, where its numbers come from, and what it doesn’t do.',
};

const usdaFoods = FOODS.filter((f) => f.source.startsWith('USDA')).length;

const PARTS = [
  { id: 'phases', title: 'Phases' },
  { id: 'week', title: 'Your week' },
  { id: 'food', title: 'Food' },
  { id: 'safety', title: 'Safety' },
  { id: 'sources', title: 'Where the numbers come from' },
  { id: 'limits', title: 'What it isn’t' },
] as const;

type PartId = (typeof PARTS)[number]['id'];

const PROSE = 'space-y-4 text-[17px] leading-relaxed text-ink-2 [&_li]:mt-2 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5';

function PartHeading({ id }: { id: PartId }) {
  const i = PARTS.findIndex((p) => p.id === id);
  return (
    <>
      <p className="font-display text-sm italic text-muted">{String(i + 1).padStart(2, '0')}</p>
      <h2 id={`${id}-h`} className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        {PARTS[i].title}
      </h2>
    </>
  );
}

/** Text above, a full-width picture below. */
function Stacked({ id, text, children, tint = false }: { id: PartId; text: ReactNode; children: ReactNode; tint?: boolean }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={`scroll-mt-6 border-t border-line ${tint ? 'bg-surface' : ''}`}>
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-16">
          <div>
            <PartHeading id={id} />
          </div>
          <div className={`max-w-2xl ${PROSE}`}>{text}</div>
        </div>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}

/** Text on one side, the picture on the other; `flip` swaps them on wide screens. */
function Split({ id, text, children, flip = false, tint = false }: { id: PartId; text: ReactNode; children: ReactNode; flip?: boolean; tint?: boolean }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={`scroll-mt-6 border-t border-line ${tint ? 'bg-surface' : ''}`}>
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:py-20">
        <div className={flip ? 'lg:order-2' : ''}>
          <PartHeading id={id} />
          <div className={`mt-5 ${PROSE}`}>{text}</div>
        </div>
        <div className={flip ? 'lg:order-1' : ''}>{children}</div>
      </div>
    </section>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-tint text-rose-dark">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

const SAFETY: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor" stroke="none">18+</text>,
    title: 'Adults only',
    body: 'Setup stops if you’re under 18.',
  },
  {
    icon: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
    title: 'Pregnant or postpartum',
    body: 'No calorie deficit, calories hidden by default, and a reminder to check with your doctor or midwife.',
  },
  {
    icon: (
      <>
        <path d="M3 3l18 18" />
        <path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c5 0 9 5 9 7a11 11 0 0 1-2.4 3.3M6.2 6.6C4.2 8 3 10.4 3 12c0 2 4 7 9 7a9 9 0 0 0 4.2-1.1" />
      </>
    ),
    title: 'Eating disorder history',
    body: 'Calorie numbers and weight goals are off, and the app points you to the National Alliance for Eating Disorders helpline.',
  },
  {
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M6.5 17.5l11-11" />
      </>
    ),
    title: 'No fat-loss target at a low weight',
    body: 'If your weight is already in the low range, losing fat isn’t offered.',
  },
  {
    icon: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M4 10h16M9 3v4M15 3v4" />
      </>
    ),
    title: 'No streaks, no photos',
    body: 'No before-and-after photos and no streak counters. A missed day is just a missed day.',
  },
];

export default function HowItWorks() {
  const t = examplePlan.timeline;
  const w = exampleWeeks;
  return (
    <div className="bg-ground text-ink">
      <SiteHeader />
      <main>
        <header className="mx-auto max-w-6xl px-5 pb-14 pt-14 sm:px-8 lg:pb-16 lg:pt-20">
          <h1 className="max-w-3xl font-display text-5xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">How the plan works</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-2">
            WeddingReady started as a plan written by hand for one person’s wedding. The app follows the same rules for anyone. The pictures on this page
            are drawn by the app itself, from the same example plan as the home page.
          </p>
          <nav aria-label="On this page" className="mt-10">
            <ol className="m-0 flex list-none flex-wrap gap-2 p-0">
              {PARTS.map((p, i) => (
                <li key={p.id}>
                  <a
                    href={`#${p.id}`}
                    className="flex min-h-11 items-center gap-2 rounded-full border border-line-2 bg-surface px-4 text-[15px] text-ink-2 no-underline hover:border-rose hover:text-rose"
                  >
                    <span className="font-display text-sm italic text-muted">{i + 1}</span>
                    {p.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </header>

        <Stacked
          id="phases"
          tint
          text={
            <>
              <p>
                The plan counts the weeks from your start date to your wedding and splits them into phases. Each phase changes how many sets and reps you do.
                If you give a fitting date, Maintain starts at least two weeks before it, so your measurements don’t change after alterations.
              </p>
              <p className="text-[15px] text-muted">
                With two to four months to go, Strength and Shape combine into one Build phase. With under four weeks, there’s a lighter plan and no calorie
                deficit.
              </p>
            </>
          }
        >
          <WeeklySetsChart weeks={weeklyVolume} fittingWeek={fittingWeek} weddingDate={t.weddingDate} />
          <ol className="m-0 mt-12 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {t.phases.map((p) => (
              <li key={p.name} className="rounded-2xl border border-line bg-ground p-5">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm" style={{ background: PHASE_FILL[p.name] }} />
                  <span className="font-display text-xl font-semibold text-ink">{p.label}</span>
                </div>
                <p className="mt-1 text-[13px] text-muted">
                  {p.weeks} weeks · {fmtShort(p.startDate)} to {fmtShort(p.endDate)}
                </p>
                <p className="mt-4 font-display text-2xl font-semibold leading-tight text-plum">{PHASE_COPY[p.name].sets}</p>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{PHASE_COPY[p.name].focus}</p>
              </li>
            ))}
          </ol>
        </Stacked>

        <Split
          id="week"
          text={
            <>
              <p>You choose two to five strength days. The app places them around what you already do:</p>
              <ul>
                <li>
                  <strong>Two or three days</strong> are full body. Never on back-to-back days, with an easy day between them: rest, a walk, yoga or Pilates.
                </li>
                <li>
                  <strong>Four or five days</strong> split the body in two, so two in a row is fine. Never the same session twice running, and never more than
                  two in a row (three with five days).
                </li>
                <li>
                  <strong>Runs, rides, classes and sports</strong> count as hard days. The app keeps them off strength days when it can.
                </li>
              </ul>
              <p>
                If your week can’t follow these rules, the app says which rule breaks and offers the smallest fix. You can always drag sessions around
                yourself, and it warns you about the same things.
              </p>
              <p className="text-[15px] text-muted">
                There are {EXERCISES.length} exercises, with a version of each movement for home dumbbells, a gym and bodyweight. With a 30 or 45-minute limit, the last
                accessory exercises are dropped first.
              </p>
            </>
          }
        >
          <div className="space-y-4">
            <WeekLegend />
            <WeekDiagram week={w.three} title="Three days: full body, an easy day between" />
            <WeekDiagram week={w.four} title="Four days: two pairs, back to back is fine" />
            <WeekDiagram week={w.packed} title="A packed week, as entered" tone="warn" />
            {w.packedFix && w.packedFixed && (
              <>
                <div className="flex gap-3 rounded-2xl bg-plum p-4 text-[15px] leading-relaxed text-ground sm:p-5">
                  <span aria-hidden="true" className="font-display text-2xl leading-none text-gold">↓</span>
                  <p>
                    <span className="font-semibold text-gold">The app suggests: </span>
                    {w.packedFix.text}
                  </p>
                </div>
                <WeekDiagram week={w.packedFixed} title="The same week with two strength days" />
              </>
            )}
            <p className="text-[13px] text-muted">Each example also has a daily walk, left out to keep the pictures readable.</p>
          </div>
        </Split>

        <Stacked
          id="food"
          tint
          text={
            <>
              <p>You pick how much detail you want, and can change it any time. Every version keeps one or two dessert nights a week.</p>
              <p>
                Energy needs are estimated with the Mifflin-St Jeor equation, adjusted for your job, your daily walking and how often you train. They’re shown
                as a range because these estimates can be off by 10% or more. To lose fat, the target is 15% below your needs, no faster than 0.75% of your
                weight a week, and never below your resting needs. Protein is 1.6 to 2 grams per kilogram of body weight.
              </p>
            </>
          }
        >
          <NutritionModes t={exampleLoseFat} />
          <div className="mt-6">
            <EnergyRange maintenance={exampleMaintenance} loseFat={exampleLoseFat} />
          </div>
        </Stacked>

        <Split
          id="safety"
          text={
            <p>
              You answer a few health questions during setup. Some answers change the plan on their own. None of them are shared with anyone, and you can
              change them in Settings.
            </p>
          }
        >
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
            {SAFETY.map((s) => (
              <li key={s.title} className="flex gap-4 rounded-2xl border border-line bg-surface p-4">
                <Icon>{s.icon}</Icon>
                <div>
                  <p className="font-semibold text-ink">{s.title}</p>
                  <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{s.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Split>

        <Split
          id="sources"
          flip
          tint
          text={
            <ul>
              <li>Whole foods use values from USDA FoodData Central, each linked to its FDC ID. Restaurant dishes without published nutrition are marked as estimates.</li>
              <li>
                Typed-in meals are estimated by an AI model (Google’s Gemini, or Anthropic’s Claude when available). The estimate lists its assumptions, is
                marked low confidence when its calories and macros don’t add up, and you can edit it before saving.
              </li>
            </ul>
          }
        >
          <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {[
              [`${usdaFoods}`, `of ${FOODS.length} foods use USDA values`],
              [`${EXERCISES.length}`, 'exercises with written form cues'],
              ['3', 'versions of every workout: dumbbells, gym, bodyweight'],
            ].map(([big, small]) => (
              <div key={small} className="rounded-2xl border border-line bg-ground p-5">
                <dt className="font-display text-5xl font-semibold leading-none tracking-tight text-plum">{big}</dt>
                <dd className="m-0 mt-3 text-[15px] leading-relaxed text-ink-2">{small}</dd>
              </div>
            ))}
          </dl>
        </Split>

        <section id="limits" aria-labelledby="limits-h" className="scroll-mt-6 border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
            <div className="max-w-2xl rounded-2xl border-l-4 border-gold bg-surface p-6 sm:p-8">
              <PartHeading id="limits" />
              <p className="mt-4 text-[17px] leading-relaxed text-ink-2">
                It isn’t medical advice, and a dietitian or certified trainer hasn’t reviewed these rules yet. If an exercise hurts, stop. If you have a
                medical condition, talk to your doctor before you start. <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link>
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
