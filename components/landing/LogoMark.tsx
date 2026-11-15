/** Current mark (a ring with a rose dot). Placeholder until a new logo is chosen. */
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#3B1F2E" />
      <circle cx="16" cy="17.5" r="8" fill="none" stroke="#E4C79A" strokeWidth="2.4" />
      <circle cx="16" cy="9" r="2.6" fill="#A63D63" />
    </svg>
  );
}
