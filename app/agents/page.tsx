import type { Metadata } from 'next';
import { LandingAnalytics } from '@/components/landing/LandingAnalytics';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CopyButton } from '@/components/landing/CopyButton';
import { DemoVideo } from '@/components/landing/DemoVideo';
import { BTN, SiteFooter, SiteHeader } from '@/components/landing/SiteChrome';
import { LineIcon, type IconName } from '@/components/ui/LineIcon';

export const metadata: Metadata = {
  title: 'For AI assistants',
  description: 'Connect WeddingReady to Claude or another AI assistant to build a wedding training plan, get a day’s workout, set calorie and protein targets and look up foods.',
};

const URL = 'https://weddingready.vercel.app/api/mcp';
const CLAUDE_HELP = 'https://support.claude.com/en/articles/11175166';

const TOOLS: { name: string; icon: IconName; does: string }[] = [
  { name: 'build_plan', icon: 'phases', does: 'Builds the phased plan from today to the wedding: phases and dates, recovery weeks, the taper, and the weekly schedule around existing activities.' },
  { name: 'get_workout', icon: 'dumbbell', does: 'Gives one day’s workout: each exercise with sets, reps, rest and how to do it.' },
  { name: 'calendar_events', icon: 'calendar', does: 'Turns the coming weeks into dated events with a time and the workout in each, so an assistant with a calendar connector can add them, plus a calendar file link.' },
  { name: 'plan_week', icon: 'move', does: 'Picks strength days around runs, classes and sports, says which recovery rule a week breaks, and suggests the smallest fix.' },
  { name: 'nutrition_targets', icon: 'meal', does: 'Gives daily calorie, protein, carb and fat targets for maintenance or gentle fat loss, with the safety rules applied.' },
  { name: 'search_foods', icon: 'search', does: 'Looks up calories and macros for foods, with USDA sources.' },
];

const EXAMPLES = [
  'My wedding is October 16 next year and my dress fitting is September 4. I can lift three days a week at home with dumbbells, and I run on Tuesdays. Build me a plan with WeddingReady.',
  'What’s my WeddingReady workout today?',
  'I do spin on Wednesday and a class on Saturday. Which days should my four strength sessions go on?',
  'How much protein should I eat? I’m 30, 5′6″ and 150 lb, and I sit at a desk.',
  'Add my next four weeks of workouts to my Google Calendar at 6:30pm.',
];

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
      <h2 className="font-display text-2xl font-semibold text-ink">{title}</h2>
      <div className="mt-4 space-y-3 text-[16px] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

export default function Agents() {
  return (
    <div className="bg-ground text-ink">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pb-20 pt-14 sm:px-8 lg:pt-20">
        <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">For AI assistants</h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-2">
          Add WeddingReady to Claude, or any assistant that supports MCP connectors, and it can plan training and food with the same rules as this app.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] lg:gap-14">
        {/* The recording stays in view on the right while the sections scroll past. */}
        <figure className="m-0 lg:sticky lg:top-8 lg:order-last lg:self-start">
          <div className="overflow-hidden rounded-xl bg-surface shadow-[0_30px_60px_-24px_rgba(42,31,35,0.45)] ring-1 ring-line-2">
            <DemoVideo src="/media/landing/agent.mp4" poster="/media/landing/agent.jpg" label="Screen recording: Claude building a WeddingReady plan and the first workout" aspect="aspect-[1080/790]" />
          </div>
          <figcaption className="mt-3 text-[14px] text-muted">A real conversation in Claude using the WeddingReady connector, sped up while it calls the tools.</figcaption>
        </figure>

        <div className="space-y-5">
          <Block title="Connector address">
            <div className="flex flex-wrap items-center gap-3">
              <code className="break-all rounded-xl bg-ground px-3 py-2 font-mono text-[14px] text-ink ring-1 ring-line">{URL}</code>
              <CopyButton text={URL} className={`${BTN} min-h-11 border border-line-2 bg-surface px-5 text-sm text-ink hover:border-rose hover:text-rose`} />
            </div>
            <p>
              <strong className="text-ink">Claude:</strong> add a custom connector with this address. No sign-in is needed. Claude’s help page shows where the setting is
              on each plan: <a href={CLAUDE_HELP}>Getting started with custom connectors</a>.
            </p>
            <p>
              <strong className="text-ink">Claude Code:</strong> <code className="font-mono text-[14px]">claude mcp add --transport http weddingready {URL}</code>
            </p>
            <p>Other assistants: add it as a remote MCP server using streamable HTTP.</p>
          </Block>

          <Block title="What it can do">
            <ul className="m-0 list-none space-y-4 p-0">
              {TOOLS.map((t) => (
                <li key={t.name} className="flex gap-3.5">
                  <LineIcon name={t.icon} size="sm" />
                  <div>
                    <code className="font-mono text-[14px] font-semibold text-ink">{t.name}</code>
                    <p className="mt-0.5">{t.does}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Block>

          <Block title="From chat to the app, and back">
            <p>
              After building a plan, the assistant gives a link that opens WeddingReady with the plan filled in, so tracking starts in one tap. It also gets a plan code
              (“wr1.…”) it can reuse instead of asking again.
            </p>
            <p>Going the other way, the app’s Plan tab has “Copy for Claude”: paste it into a chat and the assistant picks up your plan, including any exercises you’ve swapped.</p>
          </Block>

          <Block title="Try asking">
            <ul className="m-0 list-disc space-y-2 pl-5">
              {EXAMPLES.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Block>

          <Block title="Privacy and limits">
            <ul className="m-0 list-disc space-y-2 pl-5">
              <li>It’s read-only and stores nothing about you or your conversation. Details like your dates or weight are used for that one answer and not kept.</li>
              <li>It counts how often each tool is used, with no identifier, and limits how many requests one network can make a day.</li>
              <li>
                It applies the same safety rules as the app: adults only, no calorie deficit when pregnant or postpartum or at a low weight, and no calorie numbers
                for anyone with a history of eating disorders.
              </li>
              <li>
                It’s general guidance, not medical advice. <Link href="/how-it-works">How the plan works</Link> explains the rules.
              </li>
            </ul>
          </Block>
        </div>
        </div>
      </main>
      <SiteFooter />
      <LandingAnalytics page="agents" />
    </div>
  );
}
