/**
 * Orama tokenizer with CJK support.
 *
 * Orama's default tokenizer splits on everything outside Latin letters and
 * digits, so Chinese, Japanese and Korean text produces no tokens and cannot
 * be found by full-text search. This wraps the default tokenizer unchanged
 * (same splitting, normalization and settings for Latin text) and adds
 * character bigrams for each CJK run, or the single character when the run
 * is one character long. Index and queries share this tokenizer, so a query
 * matches any stored text that contains it.
 */

import type { DefaultTokenizer } from '@orama/orama';
import { tokenizer as oramaTokenizer } from '@orama/orama/components';

// Han (CJK Unified Ideographs, Extension A, compatibility ideographs, 々〆〇),
// Hiragana, Katakana (including ー and half-width forms) and Hangul syllables.
const CJK_CHAR_CLASS = '[\\u3005-\\u3007\\u3040-\\u309f\\u30a0-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uff66-\\uff9f\\uac00-\\ud7af]';
const CJK_CHAR = new RegExp(CJK_CHAR_CLASS);
const CJK_RUN = new RegExp(`${CJK_CHAR_CLASS}+`, 'g');

export function containsCjk(text: string): boolean {
  return CJK_CHAR.test(text);
}

/** Upper bound on CJK tokens emitted for one field value or query. */
export const MAX_CJK_TOKENS = 1024;

export function cjkTokens(text: string, limit = MAX_CJK_TOKENS): string[] {
  const tokens = new Set<string>();
  for (const match of text.matchAll(CJK_RUN)) {
    const run = match[0];
    if (run.length === 1) {
      tokens.add(run);
    } else {
      for (let i = 0; i < run.length - 1 && tokens.size < limit; i++) {
        tokens.add(run.slice(i, i + 2));
      }
    }
    if (tokens.size >= limit) break;
  }
  return [...tokens];
}

export function createOramaTokenizer(): DefaultTokenizer {
  const tokenizer = oramaTokenizer.createTokenizer({ language: 'english' });
  const baseTokenize = tokenizer.tokenize;
  tokenizer.tokenize = (raw, language, prop, withCache) => {
    const tokens = baseTokenize(raw, language, prop, withCache);
    if (typeof raw !== 'string' || (prop && tokenizer.tokenizeSkipProperties.has(prop))) {
      return tokens;
    }
    const extra = cjkTokens(raw);
    if (extra.length === 0) return tokens;
    const seen = new Set(tokens);
    for (const token of extra) {
      if (!seen.has(token)) tokens.push(token);
    }
    return tokens;
  };
  return tokenizer;
}
