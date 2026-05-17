import path from 'node:path';
import mammoth from 'mammoth';

const SUPPORTED = new Set(['.txt', '.md', '.pdf', '.docx']);

export class UnsupportedFileTypeError extends Error {
  statusCode = 415;
  constructor(public ext: string) {
    super(`unsupported_file_type: ${ext}`);
  }
}

export function isSupported(filename: string): boolean {
  return SUPPORTED.has(path.extname(filename).toLowerCase());
}

export async function parseDocument(filename: string, buf: Buffer): Promise<string> {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.txt':
    case '.md':
      return buf.toString('utf-8');
    case '.pdf': {
      // pdf-parse is CJS; default import via createRequire would work, but
      // dynamic import handles ESM interop for us.
      const mod = await import('pdf-parse');
      const pdf = (mod as { default?: (b: Buffer) => Promise<{ text: string }> }).default ?? (mod as unknown as (b: Buffer) => Promise<{ text: string }>);
      const out = await pdf(buf);
      return out.text;
    }
    case '.docx': {
      const out = await mammoth.extractRawText({ buffer: buf });
      return out.value;
    }
    default:
      throw new UnsupportedFileTypeError(ext);
  }
}
