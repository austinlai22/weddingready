import type { ReactNode } from 'react';

// Simple line icons for the marketing pages. Decorative: the text beside each
// one says what it means.

const PATHS = {
  phases: <path d="M4 19h4v-4h4v-4h4V7h4" />,
  timer: (
    <>
      <circle cx="12" cy="13" r="7" />
      <path d="M12 10v3l2 2M10 3h4" />
    </>
  ),
  dumbbell: <path d="M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11" />,
  meal: <path d="M7 3v18M4.5 3v5a2.5 2.5 0 0 0 5 0V3M17 21V3c-2 1.5-3 4-3 8h3" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5" />
    </>
  ),
  dessert: <path d="M8 11.5L12 21l4-9.5M7 11.5a5 5 0 0 1 10 0z" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  alert: <path d="M12 4l9 16H3zM12 10v4M12 17h.01" />,
  pencil: <path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3" />,
  move: <path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />,
  rest: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  undo: <path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  hidden: <path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c5 0 9 5 9 7a11 11 0 0 1-2.4 3.3M6.2 6.6C4.2 8 3 10.4 3 12c0 2 4 7 9 7a9 9 0 0 0 4.2-1.1" />,
  ban: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M6.5 17.5l11-11" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  adult: (
    <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor" stroke="none">
      18+
    </text>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

/** A line icon in a soft rose circle. */
export function LineIcon({ name, size = 'md' }: { name: IconName; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-9 w-9' : 'h-11 w-11';
  const glyph = size === 'sm' ? 'h-[18px] w-[18px]' : 'h-5 w-5';
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full bg-rose-tint text-rose-dark ${box}`}>
      <svg viewBox="0 0 24 24" className={glyph} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {PATHS[name]}
      </svg>
    </span>
  );
}
