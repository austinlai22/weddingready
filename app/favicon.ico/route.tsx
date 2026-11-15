import { iconResponse } from '@/lib/icon';

// Browsers still ask for /favicon.ico; serve the same mark as a PNG.
export function GET() {
  return iconResponse(48);
}
