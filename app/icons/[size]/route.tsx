import { iconResponse } from '@/lib/icon';

const SIZES: Record<string, { px: number; kind: 'any' | 'maskable' | 'apple' }> = {
  '192.png': { px: 192, kind: 'any' },
  '512.png': { px: 512, kind: 'any' },
  'maskable-512.png': { px: 512, kind: 'maskable' },
  'apple-180.png': { px: 180, kind: 'apple' },
};

export function generateStaticParams() {
  return Object.keys(SIZES).map((size) => ({ size }));
}

export async function GET(_req: Request, ctx: RouteContext<'/icons/[size]'>) {
  const { size } = await ctx.params;
  const s = SIZES[size];
  if (!s) return new Response('Not found', { status: 404 });
  return iconResponse(s.px, s.kind);
}
