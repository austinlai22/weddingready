import type { ReactNode } from 'react';

/** A phone outline for showing the app as it appears on a screen. Decorative framing only. */
export function PhoneFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative rounded-[2.6rem] bg-ink p-2.5 shadow-[0_30px_60px_-24px_rgba(42,31,35,0.55)] ${className}`}>
      <div className="relative overflow-hidden rounded-[2.1rem] bg-ground">
        <div aria-hidden="true" className="absolute left-1/2 top-2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-ink" />
        {children}
      </div>
    </div>
  );
}
