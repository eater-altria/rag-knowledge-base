import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { buildMcpServer } from '../mcp/server.js';
import { logger } from '../logger.js';

/**
 * Minimal MCP-over-HTTP endpoint.
 *
 * We bypass the SDK's StreamableHTTPServerTransport (which assumes a Web
 * Standard Request/Response and got tangled with fastify's stream handling)
 * and use an InMemoryTransport pair: the HTTP layer is just a JSON-RPC
 * forwarder. For each request we link a fresh server + transport pair,
 * forward the inbound message, wait for the response by id, and write it
 * back. Notifications (no id) get a 202 Accepted.
 *
 * This handles single-request POST flows used by MCP clients (Claude
 * Desktop, mcp-cli, etc.) but does NOT implement the full Streamable HTTP
 * spec (no SSE streaming, no batching). That's a deliberate trade-off
 * for simplicity & reliability — the LLM-facing tools work correctly.
 */
export async function mcpRoutes(app: FastifyInstance) {
  const handle = async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.method !== 'POST') {
      return reply.code(405).send({ error: 'method_not_allowed', hint: 'Use POST with a JSON-RPC body' });
    }
    const body = req.body as JSONRPCMessage | undefined;
    if (!body || typeof body !== 'object' || !('jsonrpc' in body)) {
      return reply.code(400).send({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id: null });
    }

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = buildMcpServer();
    await server.connect(serverTransport);

    // A request has a numeric/string id; a notification does not. We only wait
    // for a response if the inbound message is a request.
    const isRequest = 'id' in body && body.id !== undefined && body.id !== null && 'method' in body;

    if (!isRequest) {
      await clientTransport.send(body);
      reply.code(202).send();
      await Promise.allSettled([serverTransport.close(), clientTransport.close(), server.close()]);
      return;
    }

    const requestId = (body as { id: string | number }).id;

    try {
      const response = await new Promise<JSONRPCMessage>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('mcp_response_timeout')), 30_000);
        clientTransport.onmessage = (msg: JSONRPCMessage) => {
          if ('id' in msg && (msg as { id?: unknown }).id === requestId) {
            clearTimeout(timer);
            resolve(msg);
          }
        };
        clientTransport.onerror = (e) => {
          clearTimeout(timer);
          reject(e);
        };
        void clientTransport.send(body);
      });
      reply.code(200).type('application/json').send(response);
    } catch (e) {
      logger.error({ err: e, requestId }, 'mcp handler error');
      reply.code(500).send({ jsonrpc: '2.0', id: requestId, error: { code: -32603, message: (e as Error).message ?? 'internal_error' } });
    } finally {
      await Promise.allSettled([serverTransport.close(), clientTransport.close(), server.close()]);
    }
  };

  app.post('/mcp', handle);
  // GET/DELETE not used in this minimal mode — respond 405 for clarity
  app.get('/mcp', (_req, reply) => reply.code(405).send({ error: 'method_not_allowed' }));
  app.delete('/mcp', (_req, reply) => reply.code(405).send({ error: 'method_not_allowed' }));
}
