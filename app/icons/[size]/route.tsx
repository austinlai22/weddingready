import { iconResponse } from '@/lib/icon';

const SIZES: Record<string, { px: number; maskable: boolean }> = {
  '192.png': { px: 192, maskable: false },
  '512.png': { px: 512, maskable: false },
  'maskable-512.png': { px: 512, maskable: true },
  'apple-180.png': { px: 180, maskable: true },
};

export function generateStaticParams() {
  return Object.keys(SIZES).map((size) => ({ size }));
}

export async function GET(_req: Request, ctx: RouteContext<'/icons/[size]'>) {
  const { size } = await ctx.params;
  const s = SIZES[size];
  if (!s) return new Response('Not found', { status: 404 });
  return iconResponse(s.px, s.maskable);
}
