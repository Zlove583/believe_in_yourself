import { net } from 'electron';

/**
 * 单词释义查询服务：
 * 优先有道公开词典接口（中文释义），备用 dictionaryapi.dev（英文释义）。
 * 每个单词只查一次——释义随单词入库,复习环节全部读本地。
 */

export interface LookupResult {
  ok: boolean;
  word: string;
  meaning: string | null;
  phonetic: string | null;
  source: 'youdao' | 'dictionaryapi' | 'notfound';
}

const fetchJson = async (url: string): Promise<unknown> => {
  const res = await net.fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ShibieVocab/1.0' },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) return null;
  return res.json();
};

/** 有道公开接口:解析 ec(英汉) 词典释义 */
function parseYoudao(json: any): { meaning: string | null; phonetic: string | null } {
  try {
    const phonetic: string | null = json?.ec?.word?.[0]?.ukphone || json?.ec?.word?.[0]?.usphone || null;
    const trs: any[] = json?.ec?.word?.[0]?.trs ?? [];
    const meanings: string[] = [];
    for (const tr of trs) {
      const items = tr?.tr?.[0]?.l?.i ?? [];
      const texts = (Array.isArray(items) ? items : [items])
        .map((i: any) => (typeof i === 'string' ? i : i?.['#text']))
        .filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0);
      if (texts.length > 0) meanings.push(texts.join(' '));
      if (meanings.length >= 4) break;
    }
    return { meaning: meanings.length > 0 ? meanings.join('；') : null, phonetic };
  } catch {
    return { meaning: null, phonetic: null };
  }
}

/** dictionaryapi.dev:取第一个词条的第一条英文释义 */
function parseDictApi(json: any): string | null {
  try {
    const entry = Array.isArray(json) ? json[0] : null;
    const def = entry?.meanings?.[0]?.definitions?.[0]?.definition;
    const pos = entry?.meanings?.[0]?.partOfSpeech;
    if (typeof def === 'string' && def.trim()) {
      return pos ? `(${pos}) ${def}` : def;
    }
    return null;
  } catch {
    return null;
  }
}

export async function lookupMeaning(rawWord: string): Promise<LookupResult> {
  const word = rawWord.trim().toLowerCase();
  if (!/^[\x20-\x7e]{1,64}$/.test(word)) {
    return { ok: false, word, meaning: null, phonetic: null, source: 'notfound' };
  }

  // ① 有道(中文释义)
  try {
    const json = await fetchJson(
      `https://dict.youdao.com/jsonapi?dicts=%7B%22count%22%3A99%2C%22dicts%22%3A%5B%5B%22ec%22%5D%5D%7D&q=${encodeURIComponent(word)}`
    );
    const { meaning, phonetic } = parseYoudao(json);
    if (meaning) return { ok: true, word, meaning, phonetic, source: 'youdao' };
  } catch (err) {
    console.warn('[vocab] 有道查询失败', word, err);
  }

  // ② dictionaryapi.dev(英文释义兜底)
  try {
    const json = await fetchJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    const meaning = parseDictApi(json);
    if (meaning) return { ok: true, word, meaning, phonetic: null, source: 'dictionaryapi' };
  } catch (err) {
    console.warn('[vocab] dictionaryapi 查询失败', word, err);
  }

  return { ok: false, word, meaning: null, phonetic: null, source: 'notfound' };
}
