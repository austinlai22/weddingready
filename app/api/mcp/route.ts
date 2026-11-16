// /api/mcp: WeddingReady as a remote MCP server for AI assistants (see /agents).
import { createMcpEndpoint } from '@/lib/server/mcp/server';
import { getStore } from '@/lib/server/store';

const endpoint = createMcpEndpoint({ store: getStore() });

export const GET = (request: Request) => endpoint.fetch(request);
export const POST = (request: Request) => endpoint.fetch(request);
export const DELETE = (request: Request) => endpoint.fetch(request);
