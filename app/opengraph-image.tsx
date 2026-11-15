import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { LogoSvg } from '@/lib/logo';

export const alt = 'WeddingReady: a plan for every day until your wedding';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Fraunces is stored in the repo (assets/fonts, SIL Open Font License) so the
// share image renders the same in offline builds.
export default async function OpenGraphImage() {
  const fraunces = await readFile(path.join(process.cwd(), 'assets', 'fonts', 'Fraunces-SemiBold.ttf'));
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', background: '#FBF6F3', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '72px 88px', color: '#2A1F23' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <LogoSvg size={64} />
          <div style={{ fontFamily: 'Fraunces', fontSize: 38 }}>WeddingReady</div>
        </div>
        <div style={{ fontFamily: 'Fraunces', fontSize: 80, lineHeight: 1.04, letterSpacing: -2, maxWidth: 960 }}>A plan for every day between now and your wedding.</div>
        <div style={{ display: 'flex', fontSize: 30, color: '#6E5F65' }}>Workouts, meals and a countdown. Free.</div>
      </div>
    ),
    { ...size, fonts: [{ name: 'Fraunces', data: fraunces, weight: 600, style: 'normal' }] },
  );
}
