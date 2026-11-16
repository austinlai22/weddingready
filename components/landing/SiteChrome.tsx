import Link from 'next/link';
import { LogoMark } from './LogoMark';
import { OpenAppLink } from './OpenAppLink';

export const BTN = 'inline-flex min-h-12 shrink-0 items-center whitespace-nowrap justify-center rounded-full px-7 text-[15px] font-bold no-underline transition-colors motion-reduce:transition-none';
export const PRIMARY = `${BTN} bg-plum text-ground hover:bg-rose-dark hover:text-ground`;

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-ground">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-ink no-underline hover:text-ink" aria-label="WeddingReady home">
          <LogoMark className="h-8 w-8" />
          <span className="font-display text-xl font-semibold">WeddingReady</span>
        </Link>
        <div className="flex items-center gap-6">
          <nav aria-label="Site" className="hidden gap-6 text-[15px] sm:flex">
            <Link href="/how-it-works" className="text-ink-2 no-underline hover:text-rose">How the plan works</Link>
            <Link href="/#faqs" className="text-ink-2 no-underline hover:text-rose">FAQs</Link>
          </nav>
          <OpenAppLink className={`${PRIMARY} min-h-11 px-5 text-sm`} />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-ground">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-10 text-sm text-muted sm:flex-row sm:items-start sm:justify-between sm:px-8">
        <div className="flex items-center gap-2.5 text-ink">
          <LogoMark className="h-6 w-6" />
          <span className="font-display text-base font-semibold">WeddingReady</span>
        </div>
        <p className="max-w-sm leading-relaxed">A free portfolio project. General guidance, not medical advice. If an exercise hurts, stop.</p>
        <nav aria-label="More" className="flex flex-wrap gap-5">
          <Link href="/how-it-works">How the plan works</Link>
          <Link href="/agents">For AI assistants</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
