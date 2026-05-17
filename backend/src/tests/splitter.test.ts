import { describe, it, expect } from 'vitest';
import { recursiveSplit } from '../services/splitter.js';

describe('recursiveSplit', () => {
  it('keeps short text as a single chunk', () => {
    const chunks = recursiveSplit('短文本。', { chunkSize: 500, overlap: 80 });
    expect(chunks).toEqual(['短文本。']);
  });

  it('splits long Chinese text at sentence boundaries', () => {
    const text = '第一句。'.repeat(200);
    const chunks = recursiveSplit(text, { chunkSize: 100, overlap: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(110);
  });

  it('falls back to hard slicing when no separators help', () => {
    const text = 'x'.repeat(1000);
    const chunks = recursiveSplit(text, { chunkSize: 200, overlap: 0 });
    expect(chunks.length).toBe(5);
    expect(chunks.every((c) => c.length <= 200)).toBe(true);
  });
});
