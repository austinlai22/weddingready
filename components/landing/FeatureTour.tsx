'use client';

import { useEffect, useRef, useState } from 'react';
import { DemoVideo } from './DemoVideo';
import { PhoneFrame } from './PhoneFrame';

export interface Feature {
  id: string;
  title: string;
  body: string;
}

/**
 * One demo at a time. On wide screens the phone stays put and the clip
 * follows whichever feature is in the middle of the screen as you scroll; on
 * any screen, tapping a feature shows it.
 */
export function FeatureTour({ features }: { features: Feature[] }) {
  const [active, setActive] = useState(features[0].id);
  const items = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const wide = window.matchMedia('(min-width: 1024px)');
    let io: IntersectionObserver | null = null;
    const attach = () => {
      io?.disconnect();
      if (!wide.matches) return;
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) if (e.isIntersecting) setActive((e.target as HTMLElement).dataset.id!);
        },
        { rootMargin: '-45% 0px -45% 0px' },
      );
      items.current.forEach((el) => el && io!.observe(el));
    };
    attach();
    wide.addEventListener('change', attach);
    return () => {
      io?.disconnect();
      wide.removeEventListener('change', attach);
    };
  }, []);

  const current = features.find((f) => f.id === active) ?? features[0];
  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-20">
      <div className="order-2 lg:order-1">
        <ol className="m-0 list-none p-0">
          {features.map((f, i) => {
            const on = f.id === active;
            return (
              <li key={f.id} ref={(el) => void (items.current[i] = el)} data-id={f.id} className="lg:flex lg:min-h-[52vh] lg:items-center">
                <button
                  type="button"
                  onClick={() => setActive(f.id)}
                  aria-pressed={on}
                  className={`block w-full border-l-2 py-4 pl-5 pr-2 text-left transition-colors motion-reduce:transition-none ${on ? 'border-rose' : 'border-line hover:border-line-2'}`}
                >
                  <span className="block font-display text-sm italic text-muted">{String(i + 1).padStart(2, '0')}</span>
                  <span className={`mt-1 block font-display text-2xl font-semibold sm:text-3xl ${on ? 'text-ink' : 'text-ink-2'}`}>{f.title}</span>
                  <span className={`mt-2 block max-w-md text-[16px] leading-relaxed ${on ? 'text-ink-2' : 'text-muted'}`}>{f.body}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="order-1 lg:order-2">
        <div className="lg:sticky lg:top-[calc(50vh-290px)]">
          <PhoneFrame className="mx-auto w-[240px] lg:w-[280px]">
            <DemoVideo key={current.id} src={`/media/landing/${current.id}.mp4`} poster={`/media/landing/${current.id}.jpg`} label={`Screen recording: ${current.title}`} />
          </PhoneFrame>
          <p className="mt-4 text-center text-sm text-muted lg:hidden">{current.title}</p>
        </div>
      </div>
    </div>
  );
}
