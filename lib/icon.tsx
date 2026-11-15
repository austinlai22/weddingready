import { ImageResponse } from 'next/og';
import { LogoSvg } from './logo';

// App icons and the favicon, rendered from the same drawing as the site's mark.
// Maskable (Android) shrinks into the safe zone on a square tile; the Apple
// touch icon is a full square because iOS rounds it; the rest keep the corners.
export function iconResponse(size: number, kind: 'any' | 'maskable' | 'apple' = 'any'): ImageResponse {
  return new ImageResponse(<LogoSvg size={size} maskable={kind === 'maskable'} rounded={kind === 'any'} />, { width: size, height: size });
}
