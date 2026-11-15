import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DemoVideo } from '@/components/landing/DemoVideo';
import { OpenAppLink } from '@/components/landing/OpenAppLink';
import { PhoneFrame } from '@/components/landing/PhoneFrame';
import { Reveal } from '@/components/landing/Reveal';
import { daysBetween, fmtDayLong, fmtShort } from '@/lib/engine/dates';
import { PROTOTYPE_USER } from '@/lib/engine/fixtures';
import { buildPlan, dayPlan, targetsFor, type StrengthSession } from '@/lib/engine/plan';
import { FOODS } from '@/lib/engine/meals';
import { EXERCISES } from '@/lib/engine/workouts';

export const metadata: Metadata = {
  title: { absolute: 'WeddingReady · A training and food plan that works back from your wedding date' },
  description:
    'Free. Tell WeddingReady your wedding date and it builds a strength and nutrition plan backwards from it, then tells you exactly what to do each day. No account needed.',
  openGraph: {
    title: 'WeddingReady',
    description: 'A free training and food plan that works back from your wedding date.',
    type: 'website',
  },
};

// The hero phone and the timeline tile are rendered by the real plan engine
// from an invented example, so the home page can never show something the app
// wouldn't. No real person's details.
const EXAMPLE_TODAY = '2027-02-01';
const example = buildPlan({ ...PROTOTYPE_USER, name: 'Sam', startDate: '2026-11-16', weddingDate: '2027-10-16', fittingDate: '2027-09-04' });
const exampleDay = dayPlan(example, null, EXAMPLE_TODAY);
const exampleStrength = exampleDay.sessions.find((s): s is StrengthSession => s.kind === 'strength')!;
const exampleTargets = targetsFor(example, EXAMPLE_TODAY);
const daysToGo = daysBetween(EXAMPLE_TODAY, example.timeline.weddingDate);

const BTN = 'inline-flex min-h-12 items-center justify-center rounded-full px-7 text-[15px] font-bold no-underline transition-colors motion-reduce:transition-none';
const PRIMARY = `${BTN} bg-rose text-white hover:bg-rose-dark hover:text-white`;
const SECONDARY = `${BTN} border border-line-2 bg-surface text-ink-2 hover:border-rose hover:text-ink`;
const TILE = 'rounded-[28px] border border-line bg-surface';

function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#3B1F2E" />
      <circle cx="16" cy="17.5" r="8" fill="none" stroke="#E4C79A" strokeWidth="2.4" />
      <circle cx="16" cy="9" r="2.6" fill="#A63D63" />
    </svg>
  );
}

function SectionHeading({ id, eyebrow, title, intro }: { id: string; eyebrow: string; title: string; intro?: ReactNode }) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <p className="text-sm font-bold uppercase tracking-[0.14em] text-rose">{eyebrow}</p>
      <h2 id={`${id}-heading`} className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
        {title}
      </h2>
      {intro && <p className="mt-4 text-lg leading-relaxed text-muted">{intro}</p>}
    </div>
  );
}

function Section({ id, tone = 'ground', children }: { id: string; tone?: 'ground' | 'white'; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={`scroll-mt-16 ${tone === 'white' ? 'bg-surface' : 'bg-ground'}`}>
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">{children}</div>
    </section>
  );
}

/** The Train screen as the app renders it for the example day. */
function HeroScreen() {
  const exercises = exampleStrength.exercises.slice(0, 3);
  return (
    <div className="space-y-3 px-3 pb-5 pt-9 text-left">
      <div className="rounded-[22px] bg-plum p-4 text-ground">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-gold">Today · {fmtDayLong(EXAMPLE_TODAY)}</p>
          <p className="text-[9px] font-semibold text-on-plum">
            <span className="font-display text-sm font-bold text-ground">{daysToGo}</span> days
          </p>
        </div>
        <p className="mt-2 font-display text-[28px] font-semibold leading-none tracking-tight">{exampleDay.title}</p>
        <p className="mt-2 text-[11px] leading-snug text-on-plum">{exampleDay.pep}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full border border-plum-line px-2.5 py-1 text-[9px] font-medium">
            Week {exampleDay.week} of {example.timeline.totalWeeks} · {exampleDay.phase.label}
          </span>
        </div>
      </div>
      {exercises.map((p, i) => (
        <div key={p.exercise.id} className={`rounded-2xl border bg-surface p-3 ${i === 0 ? 'border-rose' : 'border-line'}`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                {p.focus && <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose" />}
                {p.exercise.name}
              </p>
              <p className={`text-[11px] ${p.changed ? 'font-bold text-rose' : 'text-muted'}`}>{p.rx}</p>
            </div>
            <span className="rounded-lg border border-line bg-ground px-2 py-1 text-[11px] font-bold text-ink">{i === 0 ? '25' : i === 1 ? '30' : '20'} <span className="font-semibold text-muted">lb</span></span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            {Array.from({ length: p.sets }, (_, s) => {
              const done = i === 0 || (i === 1 && s === 0);
              return (
                <span key={s} className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-bold ${done ? 'border-rose bg-rose text-white' : 'border-line-2 bg-surface text-ink'}`}>
                  {done ? '✓' : s + 1}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function FloatingNote({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className={`absolute hidden rounded-2xl bg-surface/95 px-4 py-3 text-left shadow-[0_12px_30px_-12px_rgba(42,31,35,0.35)] ring-1 ring-line md:block ${className}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-rose-dark">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

const PHASE_FILL: Record<string, string> = {
  foundation: '#F6E4EA',
  strength: '#E3CCD4',
  shape: '#C9A9B5',
  build: '#C9A9B5',
  maintain: '#E4C79A',
  feelgood: '#E4C79A',
};

function MiniTimeline() {
  const total = example.timeline.totalWeeks;
  return (
    <div>
      <div className="flex h-10 overflow-hidden rounded-xl">
        {example.timeline.phases.map((p) => (
          <div key={p.name} style={{ width: `${(p.weeks / total) * 100}%`, background: PHASE_FILL[p.name] }} className="flex items-center border-r-2 border-surface px-2 text-[11px] font-bold text-ink last:border-r-0">
            <span className="truncate">{p.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-semibold text-muted">
        <span>Start · {fmtShort(example.timeline.startMonday)}</span>
        <span className="text-rose">Fitting · {fmtShort(example.profile.fittingDate!)}</span>
        <span>Wedding · {fmtShort(example.timeline.weddingDate)}</span>
      </div>
    </div>
  );
}

const STEPS: { title: string; body: string; visual: ReactNode }[] = [
  {
    title: 'Tell it your date',
    body: 'Five quick screens: your wedding date (and fitting, if you know it), a few details, your goals, your week and how you like to eat. About two minutes.',
    visual: (
      <div className="w-56 rounded-2xl bg-surface p-4 shadow-[0_12px_30px_-16px_rgba(42,31,35,0.4)]">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-rose-dark">Wedding date</p>
        <p className="mt-1 font-display text-2xl font-semibold text-ink">Oct 16, 2027</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-seg"><div className="h-full w-2/5 rounded-full bg-rose" /></div>
        <p className="mt-2 text-xs text-muted">Step 2 of 6</p>
      </div>
    ),
  },
  {
    title: 'Get a plan that works back from it',
    body: 'Phases that build strength first, then shape, then hold steady before your fitting, with a calorie and protein target that changes when it should.',
    visual: (
      <div className="w-60 rounded-2xl bg-surface p-4 shadow-[0_12px_30px_-16px_rgba(42,31,35,0.4)]">
        <MiniTimeline />
      </div>
    ),
  },
  {
    title: 'Know exactly what to do today',
    body: 'Open the app and see today’s workout, the sets to tick off, what to eat and how many days are left. Less than five seconds.',
    visual: (
      <div className="flex w-56 items-center gap-3 rounded-2xl bg-plum p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose text-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gold">Today</p>
          <p className="font-display text-lg font-semibold text-ground">{exampleDay.title}</p>
        </div>
      </div>
    ),
  },
];

const DEMOS = [
  { id: 'train', title: 'Today’s workout', body: 'Tick off sets as you go. A rest timer starts on its own, and your weights are remembered for next time.' },
  { id: 'eat', title: 'Log a meal in seconds', body: 'Pick one of today’s meals, or search over 160 foods with USDA nutrition data and watch your protein add up.' },
  { id: 'ai', title: 'Or just describe it', body: '“Pad thai, one takeout box.” Get an estimate with its assumptions spelled out, and fix any number before you save.' },
  { id: 'plan', title: 'Make the week yours', body: 'Drag sessions to other days, or ask in plain words. It warns you if a change would cut into recovery.' },
];

const FAQ: { q: string; a: ReactNode }[] = [
  { q: 'Is it free?', a: 'Yes. There’s nothing to buy and no ads.' },
  {
    q: 'Do I need an account?',
    a: 'No. Your plan and everything you log are saved on your device. You can export a backup from Settings at any time and import it on another device.',
  },
  {
    q: 'Who is it for?',
    a: 'Anyone with a wedding coming up who wants to feel strong on the day: brides, grooms, partners, and anyone in the wedding party. It works for a dress, a suit or anything else, at home with dumbbells, at a gym or with no equipment at all.',
  },
  {
    q: 'My wedding is soon. Is it too late?',
    a: 'No. With a few months to go, the phases get shorter. With under four weeks, you get a “feel-good” plan: steady training, no calorie cutting, and a focus on sleep and feeling your best.',
  },
  {
    q: 'Do I have to count calories?',
    a: 'Only if you want to. Choose habits only (a plate guide and a protein target), habits plus numbers, or portions only with no numbers at all. You can switch any time, and every plan keeps one or two treat nights a week.',
  },
  {
    q: 'I already run, do classes or play sports. Does it fit around that?',
    a: 'Yes. Add what you already do and your strength days are placed around it, with easy days between full-body sessions. If your week is too packed to recover well, it suggests the smallest change that would fix it.',
  },
  {
    q: 'Is this medical advice?',
    a: 'No. It’s general guidance, and its rules haven’t yet been reviewed by a dietitian or certified trainer. If you’re pregnant or postpartum, have a medical condition, or have a history of an eating disorder, it changes the plan to suit you, and you should talk to your doctor before you start.',
  },
  {
    q: 'What happens to my data?',
    a: (
      <>
        Your details, health answers and logs stay on your device. Only the text you type into the two AI features is sent, to estimate a meal or change your
        schedule, and usage stats are anonymous.{' '}
        <Link href="/privacy" className="font-semibold">
          Read the privacy page
        </Link>
        .
      </>
    ),
  },
  { q: 'Can I use it on my phone, or offline?', a: 'Yes. Add it to your home screen and it works like an app, including offline. Only the AI features need a connection.' },
];

const NUMBERS: { title: string; body: string; icon: ReactNode }[] = [
  {
    title: 'Food data from USDA',
    body: `${FOODS.filter((f) => f.source.startsWith('USDA')).length} of the ${FOODS.length} foods come straight from USDA FoodData Central, each with its FDC ID. Restaurant dishes are labelled as estimates.`,
    icon: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M4 10h16M9 3v4M15 3v4" />
      </>
    ),
  },
  {
    title: 'Targets as ranges, not promises',
    body: 'Energy needs use the Mifflin-St Jeor equation and your real activity, shown as a range, because estimates can be off by 10% or more. Any calorie deficit is capped and never goes below your resting needs.',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16h.01" />
      </>
    ),
  },
  {
    title: 'Training by the rules of recovery',
    body: `${EXERCISES.length} exercises with versions for home dumbbells, the gym and bodyweight. Full-body days are never back to back, and sets and rest change as the phases move from strength to shape to maintenance.`,
    icon: <path d="M4 12h3m10 0h3M7 8v8M17 8v8M9 12h6M5 10v4M19 10v4" />,
  },
  {
    title: 'Safe by design',
    body: 'Adults only. No calorie deficit during pregnancy or postpartum. With a history of an eating disorder, numbers and weight goals switch off. No before-and-after photos, and no streaks to break.',
    icon: <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />,
  },
];

export default function Home() {
  return (
    <div className="bg-ground text-ink">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-ground/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 no-underline" aria-label="WeddingReady home">
            <LogoMark />
            <span className="font-display text-xl font-semibold text-ink">WeddingReady</span>
          </Link>
          <nav aria-label="Sections" className="hidden items-center gap-7 text-sm font-semibold md:flex">
            <a href="#how" className="text-ink-2 no-underline hover:text-rose">How it works</a>
            <a href="#see" className="text-ink-2 no-underline hover:text-rose">See it</a>
            <a href="#faq" className="text-ink-2 no-underline hover:text-rose">FAQ</a>
          </nav>
          <OpenAppLink className={`${PRIMARY} min-h-11 px-5 text-sm`} />
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-[radial-gradient(ellipse_at_top,#F6E4EA,#FBF6F3_62%)]">
          <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 text-center sm:px-6 sm:pt-20">
            <p className="inline-flex rounded-full bg-surface/80 px-3.5 py-1 text-xs font-semibold text-muted ring-1 ring-line">
              Free · No account · Works offline
            </p>
            <h1 className="mx-auto mt-6 max-w-4xl font-display text-5xl font-semibold leading-[1.04] tracking-tight text-ink sm:text-6xl lg:text-7xl">
              Feel strong on your wedding day.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">
              WeddingReady builds a training and food plan backwards from your wedding date, then tells you exactly what to do each day.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <OpenAppLink className={PRIMARY} />
              <a href="#see" className={SECONDARY}>
                See it in action
              </a>
            </div>

            <figure aria-label="Example day in the WeddingReady app" className="relative mx-auto mt-16 flex max-w-4xl justify-center">
              <div aria-hidden="true" className="absolute inset-x-0 top-24 mx-auto h-72 max-w-2xl rounded-full bg-rose/15 blur-3xl" />
              <FloatingNote label="Countdown" value={`${daysToGo} days to go`} className="left-[2%] top-16 lg:left-[8%]" />
              <FloatingNote label="Today’s protein" value={`${exampleTargets.protein[0]}–${exampleTargets.protein[1]} g`} className="right-[2%] top-40 lg:right-[8%]" />
              <FloatingNote label="This phase" value={`${exampleDay.phase.label} · ${exampleStrength.exercises[0].rx}`} className="bottom-20 left-[4%] lg:left-[12%]" />
              <PhoneFrame className="relative z-10 w-[290px]">
                <HeroScreen />
              </PhoneFrame>
            </figure>
            <p className="mt-6 text-xs text-muted">Example plan with invented details.</p>
          </div>
        </section>

        {/* Who it's for */}
        <section aria-label="Who it’s for" className="border-y border-line bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-7 sm:px-6">
            <span className="text-sm text-muted">Made for</span>
            {['Brides', 'Grooms', 'Partners', 'The wedding party'].map((w) => (
              <span key={w} className="font-display text-xl font-semibold text-muted">
                {w}
              </span>
            ))}
          </div>
        </section>

        <Section id="how">
          <SectionHeading id="how" eyebrow="How it works" title="From date to daily plan in three steps." intro="Whether the wedding is four weeks or a year away." />
          <ol className="m-0 grid list-none grid-cols-1 gap-6 p-0 md:grid-cols-3">
            {STEPS.map(({ title, body, visual }, i) => (
              <Reveal key={title} delay={i * 80} as="li" className="list-none">
                <div className={`${TILE} h-full overflow-hidden`}>
                  <div className="flex h-48 items-center justify-center bg-gradient-to-b from-rose-tint to-ground">{visual}</div>
                  <div className="p-6">
                    <p className="text-sm font-bold text-rose">Step {i + 1}</p>
                    <h3 className="mt-1 font-display text-2xl font-semibold text-ink">{title}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-muted">{body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ol>
        </Section>

        <Section id="see" tone="white">
          <SectionHeading id="see" eyebrow="See it in action" title="Built for the five minutes you actually have." intro="Real recordings of the app, with an example plan." />
          <div className="grid grid-cols-1 gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-4">
            {DEMOS.map((d, i) => (
              <Reveal key={d.id} delay={(i % 4) * 70}>
                <figure className="m-0">
                  <PhoneFrame className="mx-auto w-[250px]">
                    <DemoVideo src={`/media/landing/${d.id}.mp4`} poster={`/media/landing/${d.id}.jpg`} label={`Screen recording: ${d.title}`} />
                  </PhoneFrame>
                  <figcaption className="mx-auto mt-6 max-w-[270px] text-center">
                    <p className="font-display text-xl font-semibold text-ink">{d.title}</p>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{d.body}</p>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </Section>

        <Section id="why">
          <SectionHeading id="why" eyebrow="Why WeddingReady" title="A plan that bends around your life." />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Reveal className="lg:col-span-2">
              <div className={`${TILE} grid h-full gap-6 p-7 sm:grid-cols-2 sm:p-8`}>
                <div>
                  <h3 className="font-display text-2xl font-semibold text-ink">Built around your date</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-muted">
                    Strength first, then shape, then a steady phase that starts two weeks before your fitting, so your size holds for alterations. The final ten days ease off.
                  </p>
                </div>
                <div className="self-center rounded-2xl bg-ground p-5">
                  <MiniTimeline />
                </div>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <div className={`${TILE} flex h-full flex-col p-7 sm:p-8`}>
                <h3 className="font-display text-2xl font-semibold text-ink">Keep your dessert</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-muted">
                  Every plan keeps one or two treat nights a week. No “earn your dessert”, no shaming, no streaks to break.
                </p>
                <div className="mt-auto pt-6">
                  <span className="inline-flex rounded-full bg-rose-tint px-4 py-2 text-sm font-bold text-rose-dark">1 of 2 ice cream nights this week</span>
                </div>
              </div>
            </Reveal>
            <Reveal>
              <div className={`${TILE} flex h-full flex-col p-7 sm:p-8`}>
                <h3 className="font-display text-2xl font-semibold text-ink">Fits around what you already do</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-muted">
                  Runs, classes, Pilates and sports go in first. Strength days fit around them, with an easy day between full-body sessions.
                </p>
              </div>
            </Reveal>
            <Reveal className="lg:col-span-2" delay={80}>
              <div className={`${TILE} h-full p-7 sm:p-8`}>
                <h3 className="font-display text-2xl font-semibold text-ink">Your outfit, your focus</h3>
                <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
                  A dress puts the focus on shoulders, upper back and arms; a suit on shoulders, chest and upper back. Pick your own instead if you like. Focus muscles get a dot in every workout and extra sets in the Shape phase.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {['Shoulders', 'Upper back', 'Arms', 'Chest', 'Glutes', 'Legs', 'Core'].map((m, i) => (
                    <span key={m} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${i < 3 ? 'bg-plum text-ground' : 'border border-line bg-ground text-ink-2'}`}>
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </Section>

        <Section id="faq" tone="white">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-rose">FAQ</p>
              <h2 id="faq-heading" className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
                Questions, answered
              </h2>
              <div className="mt-8 hidden lg:block" aria-hidden="true">
                <LogoMark className="h-40 w-40 opacity-15" />
              </div>
            </div>
            <div className="faq divide-y divide-line overflow-hidden rounded-[28px] border border-line bg-ground">
              {FAQ.map(({ q, a }) => (
                <details key={q} className="group">
                  <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 px-6 py-5 text-[16px] font-semibold text-ink">
                    {q}
                    <span aria-hidden="true" className="faq-plus flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-lg text-rose shadow-sm transition-transform duration-200 motion-reduce:transition-none">
                      +
                    </span>
                  </summary>
                  <p className="px-6 pb-6 text-[15px] leading-relaxed text-muted">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </Section>

        <Section id="numbers">
          <SectionHeading id="numbers" eyebrow="About the numbers" title="Where the plan comes from." intro="And which parts are estimates." />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {NUMBERS.map(({ title, body, icon }, i) => (
              <Reveal key={title} delay={(i % 2) * 80}>
                <div className={`${TILE} flex h-full gap-5 p-7`}>
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-tint text-rose-dark">
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {icon}
                    </svg>
                  </span>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-ink">{title}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-muted">{body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>

        <section className="bg-ground">
          <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
            <div className="relative overflow-hidden rounded-[28px] bg-plum p-8 sm:p-12">
              <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 hidden h-72 w-72 rounded-full border-[18px] border-gold/30 sm:block" />
              <div className="relative max-w-lg">
                <h2 className="font-display text-4xl font-semibold text-ground sm:text-5xl">Start today. Walk in strong.</h2>
                <p className="mt-3 text-lg text-on-plum">Two minutes to set up. Free, with no account.</p>
                <OpenAppLink className={`${BTN} mt-7 bg-ground text-plum hover:bg-rose-tint hover:text-plum`} startLabel="Start my plan" />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2.5">
            <LogoMark className="h-6 w-6" />
            <span className="font-display text-base font-semibold text-ink">WeddingReady</span>
          </div>
          <p className="max-w-md text-xs leading-relaxed">General guidance, not medical advice. If any exercise causes pain, stop it.</p>
          <nav aria-label="Legal" className="flex gap-5 font-semibold">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
