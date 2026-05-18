import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listKnowledgeBases } from '../services/kb.js';
import { retrieve } from '../services/retrieval.js';

/**
 * Build a fresh MCP server with our two tools registered.
 * We construct per request (stateless transport) so a slow LLM tool call
 * doesn't block other clients.
 */
export function buildMcpServer(): McpServer {
  const server = new McpServer({
    name: 'rag-knowledge-base',
    version: '0.1.0',
  });

  server.registerTool(
    'list_knowledge_bases',
    {
      title: 'List knowledge bases',
      description:
        '列出当前系统中所有可用的知识库，返回每个知识库的 id、名称、描述和统计信息。' +
        '在调用 retrieve 之前先用这个工具拿到 kb_id。',
      inputSchema: {},
    },
    async () => {
      const kbs = await listKnowledgeBases();
      const summary = kbs.map((k) => ({
        id: k.id,
        name: k.name,
        description: k.description,
        document_count: k.document_count,
        chunk_count: k.chunk_count,
      }));
      return {
        content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
      };
    },
  );

  server.registerTool(
    'retrieve',
    {
      title: 'Retrieve from a knowledge base',
      description:
        '在指定知识库内做向量 + 关键词混合召回，本地 reranker 重排后返回原文 chunk（不做 LLM 汇总）。' +
        'kb_id 通过 list_knowledge_bases 获取。',
      inputSchema: {
        kb_id: z.string().uuid().describe('目标知识库的 UUID'),
        query: z.string().min(1).max(2000).describe('检索查询文本'),
        top_k: z.number().int().min(1).max(50).optional().describe('返回结果条数，默认 5'),
      },
    },
    async ({ kb_id, query, top_k }) => {
      const results = await retrieve({
        kbId: kb_id,
        query,
        topK: top_k ?? 5,
        vectorK: 50,
        keywordK: 50,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              results.map((r) => ({
                content: r.context,
                document_filename: r.document_filename,
                score: r.score,
                source: r.source,
                chunk_id: r.chunk_id,
              })),
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  return server;
}
