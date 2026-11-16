import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { FeatureTour, type Feature } from '@/components/landing/FeatureTour';
import { OpenAppLink } from '@/components/landing/OpenAppLink';
import { TryExampleButton } from '@/components/landing/TryExampleButton';
import { PlanTimeline } from '@/components/landing/PlanTimeline';
import { BTN, PRIMARY, SiteFooter, SiteHeader } from '@/components/landing/SiteChrome';
import { DAY_NAMES, dayIndex, fmtLong } from '@/lib/engine/dates';
import { FOODS } from '@/lib/engine/meals';
import { exampleDay, exampleDaysToGo, exampleMinutes, examplePlan, exampleTargets, exampleWorkout } from '@/lib/example';

export const metadata: Metadata = {
  title: { absolute: 'WeddingReady · A plan for every day until your wedding' },
  description:
    'Tell WeddingReady your wedding date. It works backwards from it to plan your workouts and meals, and shows you what to do today. Free.',
  openGraph: { title: 'WeddingReady', description: 'A plan for every day until your wedding. Free.', type: 'website' },
};

const FEATURES: Feature[] = [
  {
    id: 'train',
    title: 'Today’s workout',
    body: 'Each exercise shows its sets and reps. Tap a set when it’s done and the rest timer starts. Your weights carry over to next time.',
    points: [
      { icon: 'phases', text: 'Sets and reps change as you move through the phases' },
      { icon: 'timer', text: 'A rest timer counts down between sets' },
      { icon: 'dumbbell', text: 'Versions for home dumbbells, a gym or no equipment' },
    ],
  },
  {
    id: 'eat',
    title: 'Meals',
    body: 'Pick one of the day’s suggested meals, or look up what you actually ate. Food values come from the USDA’s database.',
    points: [
      { icon: 'meal', text: 'A few suggestions for each meal, matched to how you eat' },
      { icon: 'search', text: `Search ${FOODS.length} foods, or save your own` },
      { icon: 'dessert', text: 'One or two dessert nights every week' },
    ],
  },
  {
    id: 'ai',
    title: 'Logging takeout',
    body: 'Type what you had and roughly how much. You get an estimate with its assumptions, and you can change any number before saving.',
    points: [
      { icon: 'list', text: 'Says what it assumed about the portion' },
      { icon: 'alert', text: 'Flags estimates whose numbers don’t add up' },
      { icon: 'pencil', text: 'Or skip it and enter the numbers yourself' },
    ],
  },
  {
    id: 'plan',
    title: 'Your week',
    body: 'Strength days are placed around the runs, classes and sports you already do. When life gets in the way, move things.',
    points: [
      { icon: 'move', text: 'Drag a session to another day, or type the change' },
      { icon: 'rest', text: 'Warns when a change leaves too little time to recover' },
      { icon: 'undo', text: 'Undo, or go back to the suggested week' },
    ],
  },
];

const FAQS: { q: string; a: ReactNode }[] = [
  { q: 'What does it cost?', a: 'Nothing. There’s nothing to buy and no ads.' },
  { q: 'Do I need an account?', a: 'No. Your plan and logs are saved in your browser on your device. You can export a backup in Settings and import it somewhere else.' },
  {
    q: 'My wedding is soon. Is there any point?',
    a: 'Yes. A few months out, the phases are just shorter. Under four weeks out, you get a lighter plan: keep training steady, no cutting calories, sleep well.',
  },
  {
    q: 'Do I have to count calories?',
    a: 'Only if you want to. You can see calorie targets, only a protein target, or no numbers at all and go by portion sizes. Every version keeps one or two dessert nights a week.',
  },
  {
    q: 'I already run or go to classes. Will it fit?',
    a: 'Tell it what you already do and on which days. Strength sessions get placed around them with easy days in between. If your week is too full for that, it suggests a change.',
  },
  { q: 'What equipment do I need?', a: 'Whatever you have. There are versions of every workout for home dumbbells, a gym, or no equipment.' },
  {
    q: 'Is it medical advice?',
    a: 'No, and a dietitian or trainer hasn’t reviewed its rules yet. If you’re pregnant or postpartum, have a medical condition, or have had an eating disorder, it adjusts the plan, but check with your doctor first.',
  },
  {
    q: 'Where does my information go?',
    a: (
      <>
        It stays on your device. The only things sent anywhere are the words you type into the two AI features, and anonymous usage counts. <Link href="/privacy">Privacy details</Link>.
      </>
    ),
  },
];

/** A save-the-date card for the example plan, with what today holds. */
function SaveTheDate() {
  const wedding = examplePlan.timeline.weddingDate;
  return (
    <div className="relative mx-auto w-full max-w-[380px] rotate-[1.5deg] bg-surface p-2 shadow-[0_24px_50px_-28px_rgba(42,31,35,0.45)]">
      <div className="border border-gold p-1">
        <div className="border border-gold/60 px-7 pb-8 pt-7 text-center">
          <p className="font-display text-lg italic text-rose-dark">Save the date</p>
          <p className="mt-1 font-display text-[22px] font-semibold text-ink">
            {DAY_NAMES[dayIndex(wedding)]}, {fmtLong(wedding)}
          </p>
          <div className="mx-auto my-6 h-px w-16 bg-gold" />
          <p className="font-display text-[88px] font-semibold leading-none tracking-tight text-plum">{exampleDaysToGo}</p>
          <p className="mt-2 font-display text-lg italic text-ink-2">days to go</p>
          <div className="mx-auto my-6 h-px w-16 bg-gold" />
          <p className="text-[13px] uppercase tracking-[0.18em] text-muted">Today</p>
          <p className="mt-1 font-display text-2xl font-semibold text-ink">{exampleDay.title}</p>
          <p className="mt-1 text-[15px] text-ink-2">
            {exampleWorkout.meta.subtitle} · {exampleWorkout.exercises.length} exercises · about {exampleMinutes} min
          </p>
          <p className="mt-1 text-[15px] text-ink-2">
            Protein {exampleTargets.protein[0]}–{exampleTargets.protein[1]} g
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="bg-ground text-ink">
      <SiteHeader />
      <main>
        <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:pb-28 lg:pt-20">
          <div>
            <h1 className="font-display text-[44px] font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">A plan for every day between now and your wedding.</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">
              Tell WeddingReady when you’re getting married. It works backwards from the date to plan your workouts and meals, then shows you what to do today.
            </p>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">Free, for brides, grooms, partners and anyone in the wedding party.</p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <OpenAppLink className={PRIMARY} />
              <TryExampleButton className={`${BTN} border border-line-2 bg-surface text-ink hover:border-rose hover:text-rose`} />
            </div>
          </div>
          <figure className="m-0">
            <SaveTheDate />
            <figcaption className="mt-6 text-center text-[13px] text-muted">An example plan. The details are made up.</figcaption>
          </figure>
        </section>

        <section aria-labelledby="inside" className="border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
            <h2 id="inside" className="max-w-2xl font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
              What it looks like day to day
            </h2>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-ink-2">Screen recordings of the app, using an example plan.</p>
            <div className="mt-14 lg:mt-20">
              <FeatureTour features={FEATURES} />
            </div>
          </div>
        </section>

        <section aria-labelledby="built" className="border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-16">
              <h2 id="built" className="font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
                How your plan is built
              </h2>
              <div className="space-y-4 text-[17px] leading-relaxed text-ink-2">
                <p>
                  The plan runs in phases. Strength comes first, then shape. A steady phase starts two weeks before your fitting so your alterations still fit
                  on the day, and the last ten days ease off.
                </p>
                <p>Here’s the example plan, {examplePlan.timeline.totalWeeks} weeks long.</p>
              </div>
            </div>
            <div className="mt-12">
              <PlanTimeline />
            </div>
            <p className="mt-10">
              <Link href="/how-it-works" className="text-[15px] font-semibold">
                Read how the plan works, including where the numbers come from
              </Link>
            </p>
          </div>
        </section>

        <section id="faqs" aria-labelledby="faqs-heading" className="scroll-mt-6 border-t border-line">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-16 lg:py-24">
            <h2 id="faqs-heading" className="font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
              FAQs
            </h2>
            <div className="faq border-b border-line">
              {FAQS.map(({ q, a }) => (
                <details key={q} className="border-t border-line">
                  <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-6 py-5 text-[17px] font-semibold text-ink">
                    {q}
                    <span aria-hidden="true" className="faq-plus font-display text-2xl font-normal text-rose transition-transform duration-200 motion-reduce:transition-none">
                      +
                    </span>
                  </summary>
                  <p className="max-w-2xl pb-6 text-[16px] leading-relaxed text-ink-2">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-plum">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-5 py-16 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
            <p className="max-w-xl font-display text-3xl font-semibold leading-tight text-ground sm:text-4xl">
              It’s free and takes about two minutes to set up.
            </p>
            <OpenAppLink className={`${BTN} bg-ground text-plum hover:bg-rose-tint hover:text-plum`} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
