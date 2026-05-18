export type SplitOptions = {
  chunkSize: number;
  overlap: number;
  separators?: string[];
};

const DEFAULT_SEPARATORS = ['\n\n', '\n', '。', '！', '？', '.', '!', '?', ' ', ''];

/**
 * Recursive character splitter, similar in spirit to LangChain's. Tries each
 * separator in order; if a piece still exceeds chunkSize, recurses with the
 * next separator. Final result is reassembled with `overlap` characters of
 * lookback.
 */
export function recursiveSplit(text: string, opts: SplitOptions): string[] {
  const seps = opts.separators ?? DEFAULT_SEPARATORS;
  const pieces = splitBySeparators(text, opts.chunkSize, seps);
  return mergePieces(pieces, opts.chunkSize, opts.overlap);
}

function splitBySeparators(text: string, chunkSize: number, seps: string[]): string[] {
  if (text.length <= chunkSize) return [text];
  const sep = seps[0] ?? '';
  const rest = seps.slice(1);
  const parts = sep === '' ? sliceFixed(text, chunkSize) : text.split(sep);

  const out: string[] = [];
  // Re-attach the separator that `split` consumed, but only when (a) the
  // separator actually divided the text (parts.length > 1) and (b) this part
  // was followed by sep in the original (i.e. not the last element). Without
  // this guard we'd append phantom characters that weren't in the input and
  // pollute downstream hard slicing.
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const reattachSep = sep && part.length > 0 && parts.length > 1 && i < parts.length - 1;
    const piece = reattachSep ? part + sep : part;
    if (piece.length <= chunkSize) {
      if (piece.length > 0) out.push(piece);
    } else if (rest.length > 0) {
      out.push(...splitBySeparators(piece, chunkSize, rest));
    } else {
      out.push(...sliceFixed(piece, chunkSize));
    }
  }
  return out;
}

function sliceFixed(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

function mergePieces(pieces: string[], chunkSize: number, overlap: number): string[] {
  const out: string[] = [];
  let current = '';
  for (const p of pieces) {
    if ((current + p).length <= chunkSize) {
      current += p;
    } else {
      if (current.length > 0) out.push(current.trim());
      if (p.length > chunkSize) {
        out.push(...sliceFixed(p, chunkSize).map((s) => s.trim()).filter(Boolean));
        current = '';
      } else {
        current = overlap > 0 && current.length >= overlap ? current.slice(-overlap) + p : p;
      }
    }
  }
  if (current.trim().length > 0) out.push(current.trim());
  return out.filter((c) => c.length > 0);
}
