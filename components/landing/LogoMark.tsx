import { LogoSvg } from '@/lib/logo';

/** The mark at UI sizes; sized by its wrapper's class. */
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-block shrink-0 [&>svg]:h-full [&>svg]:w-full ${className}`}>
      <LogoSvg size={64} />
    </span>
  );
}
