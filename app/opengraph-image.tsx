import { ImageResponse } from 'next/og';

export const alt = 'WeddingReady: a training and food plan that works back from your wedding date';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', background: '#3B1F2E', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '80px 96px', color: '#FBF6F3' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: '#4A2A3B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 34, height: 34, borderRadius: 9999, border: '5px solid #E4C79A', display: 'flex' }} />
          </div>
          <div style={{ fontSize: 36, fontWeight: 700 }}>WeddingReady</div>
        </div>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, marginTop: 48, maxWidth: 900 }}>Feel strong on your wedding day.</div>
        <div style={{ fontSize: 32, color: '#EADCE2', marginTop: 28, maxWidth: 900 }}>A free training and food plan that works back from your date.</div>
      </div>
    ),
    size,
  );
}
