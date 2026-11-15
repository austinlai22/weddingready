// The WeddingReady mark: a wedding ring drawn as a countdown, three-quarters
// full, with the stone where the count started and a W inside. One drawing
// shared by the site header, the app icons, the favicon and the share image.

export const LOGO_COLORS = {
  tile: '#3B1F2E',
  track: '#6B4A5B',
  ring: '#E4C79A',
  stone: '#E07FA2',
  letter: '#FBF6F3',
};

/**
 * `maskable` shrinks the mark into the 80% safe zone and squares the tile,
 * because Android crops home-screen icons to its own shape.
 */
export function LogoSvg({ size, maskable = false, rounded = true }: { size: number; maskable?: boolean; rounded?: boolean }) {
  const c = LOGO_COLORS;
  const inner = maskable ? 'translate(32 32) scale(0.72) translate(-32 -32)' : undefined;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx={maskable || !rounded ? 0 : 14} fill={c.tile} />
      <g transform={inner}>
        <circle cx="32" cy="33" r="18" fill="none" stroke={c.track} strokeWidth="5.5" />
        <path d="M32 15 A18 18 0 1 1 14 33" fill="none" stroke={c.ring} strokeWidth="5.5" strokeLinecap="round" />
        <path d="M32 8.6 L36.2 15 L32 21.4 L27.8 15 Z" fill={c.stone} />
        <path d="M23.5 27.6 L27.8 39.6 L32 30.6 L36.2 39.6 L40.5 27.6" fill="none" stroke={c.letter} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
