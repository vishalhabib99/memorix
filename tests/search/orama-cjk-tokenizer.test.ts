import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemorixDocument } from '../../src/types.js';

// Embeddings off (the default install): search goes through Orama full-text only.
vi.mock('../../src/embedding/provider.js', () => ({
  getEmbeddingProvider: vi.fn(async () => null),
  isEmbeddingExplicitlyDisabled: vi.fn(() => true),
  resetProvider: vi.fn(),
}));

const PROJECT = 'test/cjk-search';

function doc(observationId: number, fields: Partial<MemorixDocument>): MemorixDocument {
  return {
    id: `obs-${encodeURIComponent(PROJECT)}-${observationId}`,
    observationId,
    entityName: 'module',
    type: 'gotcha',
    title: '',
    narrative: '',
    facts: '',
    filesModified: '',
    concepts: '',
    tokens: 20,
    createdAt: new Date().toISOString(),
    projectId: PROJECT,
    accessCount: 0,
    lastAccessedAt: '',
    status: 'active',
    source: 'agent',
    ...fields,
  } as MemorixDocument;
}

const DOCS = [
  doc(1, {
    entityName: '缓存模块',
    title: '缓存过期时间设置',
    narrative: '缓存过期时间设置为三十分钟，否则会导致数据库连接池耗尽。',
  }),
  doc(2, {
    entityName: 'e2e',
    title: 'テストの実行手順',
    narrative: 'テストはCIで実行する。',
  }),
  doc(3, {
    entityName: 'cache-layer',
    title: 'Cache expiry must stay at thirty minutes',
    narrative: 'A longer cache expiry exhausts the database connection pool.',
  }),
  doc(4, {
    entityName: 'auth-service',
    title: 'Token refresh runs before session timeout',
    narrative: 'The auth service refreshes tokens five minutes before expiry.',
  }),
];

async function searchTitles(query: string): Promise<string[]> {
  const { searchObservations } = await import('../../src/store/orama-store.js');
  const entries = await searchObservations({ query, projectId: PROJECT, limit: 10 });
  return entries.map((entry) => entry.title);
}

describe('orama full-text search on CJK text (embeddings off)', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { resetDb, insertObservation } = await import('../../src/store/orama-store.js');
    await resetDb();
    for (const d of DOCS) await insertObservation(d);
  });

  it('finds a Chinese title by exact query', async () => {
    // Exact match only: CJK queries must not pick up unrelated docs via fuzzy matching.
    expect(await searchTitles('缓存过期时间设置')).toEqual(['缓存过期时间设置']);
  });

  it('finds a Chinese title by a substring', async () => {
    expect(await searchTitles('缓存')).toContain('缓存过期时间设置');
  });

  it('finds a Chinese entity name', async () => {
    expect(await searchTitles('缓存模块')).toContain('缓存过期时间设置');
  });

  it('finds a katakana word inside a Japanese title', async () => {
    const titles = await searchTitles('テスト');
    expect(titles).toContain('テストの実行手順');
    expect(titles).not.toContain('缓存过期时间设置');
  });

  it('keeps English results unchanged', async () => {
    // Same results and order as with Orama's default tokenizer.
    expect(await searchTitles('cache expiry')).toEqual([
      'Cache expiry must stay at thirty minutes',
      'Token refresh runs before session timeout',
    ]);
    expect(await searchTitles('token refresh')).toEqual(['Token refresh runs before session timeout']);
  });
});

describe('createOramaTokenizer', () => {
  it('matches the default Orama tokenizer on non-CJK text', async () => {
    const { tokenizer } = await import('@orama/orama/components');
    const { createOramaTokenizer } = await import('../../src/store/orama-tokenizer.js');
    const base = tokenizer.createTokenizer({ language: 'english' });
    const custom = createOramaTokenizer();
    const samples = [
      'Cache expiry must stay at thirty minutes',
      "src/store/orama-store.ts: don't use create({ schema }) twice",
      'café naïve résumé 1.9.10 snake_case kebab-case',
      'ErpStockProcessServiceImpl, pattern=atomic-claim-first',
      '',
    ];
    for (const text of samples) {
      expect(custom.tokenize(text, undefined, 'title')).toEqual(base.tokenize(text, undefined, 'title'));
    }
  });

  it('adds bigrams for CJK runs and keeps Latin tokens in mixed text', async () => {
    const { createOramaTokenizer } = await import('../../src/store/orama-tokenizer.js');
    const tokens = createOramaTokenizer().tokenize('Redis缓存设置 と 테스트', undefined, 'title');
    expect(tokens).toEqual(['redis', '缓存', '存设', '设置', 'と', '테스', '스트']);
  });

  it('bounds the number of CJK tokens for long text', async () => {
    const { cjkTokens, MAX_CJK_TOKENS } = await import('../../src/store/orama-tokenizer.js');
    const long = Array.from({ length: 5000 }, (_, i) => String.fromCharCode(0x4e00 + i)).join('');
    expect(cjkTokens(long)).toHaveLength(MAX_CJK_TOKENS);
  });
});
