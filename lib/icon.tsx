import { ImageResponse } from 'next/og';

// The app mark: a gold ring on plum with a rose dot, drawn in code so there
// are no binary assets to keep in sync. `maskable` keeps the mark inside the
// 80% safe zone that Android crops to.
export function iconResponse(size: number, maskable = false): ImageResponse {
  const ring = Math.round(size * (maskable ? 0.42 : 0.56));
  const stroke = Math.max(2, Math.round(size * (maskable ? 0.055 : 0.07)));
  const dot = Math.round(size * (maskable ? 0.11 : 0.14));
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, background: '#3B1F2E', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: maskable ? 0 : Math.round(size * 0.22) }}>
        <div style={{ width: ring, height: ring, borderRadius: 9999, border: `${stroke}px solid #E4C79A`, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          <div style={{ width: dot, height: dot, borderRadius: 9999, background: '#A63D63', marginTop: -Math.round(dot * 0.62) }} />
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
