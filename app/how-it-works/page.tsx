import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { OpenAppLink } from '@/components/landing/OpenAppLink';
import { PlanTimeline } from '@/components/landing/PlanTimeline';
import { PRIMARY, SiteFooter, SiteHeader } from '@/components/landing/SiteChrome';
import { FOODS } from '@/lib/engine/meals';
import { EXERCISES } from '@/lib/engine/workouts';
import { examplePlan, exampleTargets } from '@/lib/example';

export const metadata: Metadata = {
  title: 'How the plan works',
  description: 'The rules WeddingReady follows to build a training and food plan from your wedding date, where its numbers come from, and what it doesn’t do.',
};

const usdaFoods = FOODS.filter((f) => f.source.startsWith('USDA')).length;

function Part({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`part-${n}`} className="grid grid-cols-1 gap-4 border-t border-line py-12 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
      <div>
        <p className="font-display text-sm italic text-muted">{n}</p>
        <h2 id={`part-${n}`} className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">
          {title}
        </h2>
      </div>
      <div className="max-w-2xl space-y-4 text-[17px] leading-relaxed text-ink-2 [&_li]:mt-2 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5">{children}</div>
    </section>
  );
}

export default function HowItWorks() {
  const t = examplePlan.timeline;
  return (
    <div className="bg-ground text-ink">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <header className="max-w-3xl py-14 lg:py-20">
          <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">How the plan works</h1>
          <p className="mt-6 text-lg leading-relaxed text-ink-2">
            WeddingReady started as a plan written by hand for one person’s wedding. The app follows the same rules for anyone. This page explains them, where the
            numbers come from, and what the app doesn’t do.
          </p>
        </header>

        <Part n="1" title="Phases">
          <p>
            The plan counts the weeks from your start date to the week of your wedding and splits them into phases. With four months or more, there are four:
          </p>
          <ul>
            <li><strong>Foundation.</strong> Learn the moves and build the habit. 3 sets of 10 to 12 on the main lifts.</li>
            <li><strong>Strength.</strong> Heavier main lifts: 4 sets of 8 to 10, with longer rests.</li>
            <li><strong>Shape.</strong> An extra set for the muscles you chose to focus on, such as shoulders and back for a dress.</li>
            <li><strong>Maintain.</strong> Same weights, three sets, nothing new. Your calories go back to maintenance here too.</li>
          </ul>
          <p>
            If you give a fitting date, Maintain starts at least two weeks before it, so your measurements don’t change after alterations. Every sixth week of
            harder training is a lighter recovery week, and the last ten days drop to two sets.
          </p>
          <p>With two to four months to go, Strength and Shape combine into one Build phase. With under four weeks, there’s a lighter plan and no calorie deficit.</p>
          <div className="pt-4">
            <p className="mb-4 text-[15px] text-muted">The example plan from the home page, {t.totalWeeks} weeks:</p>
            <PlanTimeline detail={false} />
          </div>
        </Part>

        <Part n="2" title="Your week">
          <p>You choose two to five strength days. The app places them around the things you already do, following a few rules:</p>
          <ul>
            <li>With two or three days, each session is full body. They never fall on back-to-back days, and there’s an easy day between them: rest, a walk, yoga or Pilates.</li>
            <li>With four or five days, sessions alternate lower and upper body, so two in a row is fine. Never the same session twice running, and never more than two in a row (three with five days).</li>
            <li>Runs, classes, rides and sports count as hard days. The app keeps them off strength days when it can.</li>
          </ul>
          <p>
            If your week can’t follow these rules as you’ve described it, the app says which rule breaks and offers the smallest fix: moving one or two
            sessions, or training on fewer days. You can always rearrange the week yourself, and it will warn you about the same things.
          </p>
          <p>
            There are {EXERCISES.length} exercises, with a version of each movement for home dumbbells, a gym and bodyweight. If you set a 30 or 45-minute limit,
            the last accessory exercises are dropped first.
          </p>
        </Part>

        <Part n="3" title="Food">
          <p>You pick how much detail you want, and can change it any time:</p>
          <ul>
            <li><strong>Habits.</strong> A plate guide and a daily protein target. No calories anywhere.</li>
            <li><strong>Habits and numbers.</strong> Adds calorie, carb and fat targets.</li>
            <li><strong>Portions only.</strong> Hand-sized portions and protein at every meal, with no numbers at all.</li>
          </ul>
          <p>
            Energy needs are estimated with the Mifflin-St Jeor equation, adjusted for your job, your daily walking and how often you train. The result is shown
            as a range, because these estimates can be off by 10% or more. For the example plan that’s about {exampleTargets.kcalRange[0].toLocaleString('en-US')} to{' '}
            {exampleTargets.kcalRange[1].toLocaleString('en-US')} calories a day.
          </p>
          <p>
            If you choose to lose fat, the deficit is 15% of your needs, capped so you’d lose no more than 0.75% of your weight a week, and never below your
            resting needs. Protein is 1.6 to 2 grams per kilogram of body weight. Every plan keeps one or two dessert nights a week.
          </p>
        </Part>

        <Part n="4" title="Safety">
          <ul>
            <li>It’s for adults only.</li>
            <li>If you’re pregnant or postpartum, there’s no calorie deficit and calories are hidden by default.</li>
            <li>If you’ve had an eating disorder, calorie numbers and weight goals are switched off, and the app points you to the National Alliance for Eating Disorders helpline.</li>
            <li>It won’t set a fat-loss target if your weight is already in the low range.</li>
            <li>No before-and-after photos and no streaks. A missed day is just a missed day.</li>
          </ul>
        </Part>

        <Part n="5" title="Where the numbers come from">
          <ul>
            <li>
              {usdaFoods} of the {FOODS.length} foods in the search list use values from USDA FoodData Central, each linked to its FDC ID. Restaurant dishes
              without published nutrition are marked as estimates.
            </li>
            <li>
              Typed-in meals are estimated by an AI model (Google’s Gemini, or Anthropic’s Claude when available). The estimate lists its assumptions, gets
              marked low confidence when its calories and macros don’t add up, and you can edit it before saving.
            </li>
          </ul>
        </Part>

        <Part n="6" title="What it isn’t">
          <p>
            It isn’t medical advice, and a dietitian or certified trainer hasn’t reviewed these rules yet. If an exercise hurts, stop. If you have a medical
            condition, talk to your doctor before you start. <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link>
          </p>
        </Part>

        <div className="border-t border-line pt-12">
          <OpenAppLink className={PRIMARY} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
