import { LineIcon, type IconName } from '@/components/ui/LineIcon';
import Link from 'next/link';
import { DemoVideo } from './DemoVideo';
import { PhoneFrame } from './PhoneFrame';

export interface Feature {
  id: string;
  title: string;
  body: string;
  points: { icon: IconName; text: string }[];
  /** A desktop recording (shown in a window frame) instead of a phone one. */
  wide?: { aspect: string; caption: string };
  link?: { href: string; label: string };
}

// Paper colours behind each phone, in order.
const PANELS = ['bg-rose-tint', 'bg-gold/35', 'bg-line-2/70', 'bg-chip', 'bg-rose-tint'];

/**
 * The features as alternating rows: words on one side, the screen recording
 * on the other, swapping sides each row. Only the recording most on screen
 * plays (see DemoVideo).
 */
export function FeatureTour({ features }: { features: Feature[] }) {
  return (
    <ol className="m-0 list-none space-y-20 p-0 lg:space-y-28">
      {features.map((f, i) => {
        const flip = i % 2 === 1;
        return (
          <li key={f.id} data-feature={f.id} className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-20">
            <div className={flip ? 'lg:order-2' : ''}>
              <p className="font-display text-sm italic text-muted">{String(i + 1).padStart(2, '0')}</p>
              <h3 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{f.title}</h3>
              <p className="mt-4 max-w-md text-[17px] leading-relaxed text-ink-2">{f.body}</p>
              <ul className="m-0 mt-7 max-w-md list-none space-y-3 p-0">
                {f.points.map((p) => (
                  <li key={p.text} className="flex items-center gap-3.5 text-[15px] text-ink-2">
                    <LineIcon name={p.icon} size="sm" />
                    {p.text}
                  </li>
                ))}
              </ul>
              {f.link && (
                <p className="mt-6">
                  <Link href={f.link.href} className="text-[15px] font-semibold">
                    {f.link.label}
                  </Link>
                </p>
              )}
            </div>
            <div className={`relative flex justify-center py-8 sm:py-10 ${flip ? 'lg:order-1' : ''}`}>
              <div
                aria-hidden="true"
                className={`absolute inset-y-0 left-1/2 w-full ${f.wide ? 'max-w-[600px]' : 'max-w-[420px]'} -translate-x-1/2 ${flip ? '-rotate-[1.5deg]' : 'rotate-[1.5deg]'} ${PANELS[i % PANELS.length]}`}
              />
              {f.wide ? (
                <figure className="relative m-0 w-full max-w-[520px]">
                  <div className="overflow-hidden rounded-xl bg-surface shadow-[0_30px_60px_-24px_rgba(42,31,35,0.45)] ring-1 ring-line-2">
                    <div aria-hidden="true" className="flex gap-1.5 border-b border-line px-3 py-2.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-line-2" />
                      <span className="h-2.5 w-2.5 rounded-full bg-line-2" />
                      <span className="h-2.5 w-2.5 rounded-full bg-line-2" />
                    </div>
                    <DemoVideo src={`/media/landing/${f.id}.mp4`} poster={`/media/landing/${f.id}.jpg`} label={`Screen recording: ${f.title}`} aspect={f.wide.aspect} />
                  </div>
                  <figcaption className="mt-3 text-center text-[13px] text-muted">{f.wide.caption}</figcaption>
                </figure>
              ) : (
                <PhoneFrame className="relative w-[236px] sm:w-[260px]">
                  <DemoVideo src={`/media/landing/${f.id}.mp4`} poster={`/media/landing/${f.id}.jpg`} label={`Screen recording: ${f.title}`} />
                </PhoneFrame>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
