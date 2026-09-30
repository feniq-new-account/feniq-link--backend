import { afterEach, describe, expect, it, vi } from 'vitest';
import { humanTime, localStamp, parseLocal, weekKey } from '../src/time.js';
import { extractJson } from '../src/util.js';
import { askJSON } from '../src/llm.js';
import { explainMetaError, MetaError } from '../src/meta.js';

describe('time (Damascus, UTC+3)', () => {
  it('parses and formats local times', () => {
    const ms = parseLocal('2026-10-02 19:00');
    expect(new Date(ms).toISOString()).toBe('2026-10-02T16:00:00.000Z');
    expect(localStamp(ms)).toBe('2026-10-02 19:00');
    expect(humanTime(ms)).toBe('الجمعة 2 تشرين الأول، 7:00 مساءً');
    expect(parseLocal('now', 5)).toBe(5);
    expect(parseLocal('بكرا')).toBeNull();
  });

  it('groups a week from Sunday', () => {
    expect(weekKey(parseLocal('2026-10-04 00:30'))).toBe('2026-10-04'); // الأحد
    expect(weekKey(parseLocal('2026-10-10 23:59'))).toBe('2026-10-04'); // السبت
  });
});

describe('extractJson', () => {
  it('handles fenced and chatty model output', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('تفضل: {"reply":"أهلين"} ✨')).toEqual({ reply: 'أهلين' });
    expect(() => extractJson('بدون جيسون')).toThrow();
  });
});

describe('askJSON fallback chain', () => {
  afterEach(() => vi.restoreAllMocks());

  it('moves to the next model and then to OpenAI on failures', async () => {
    const seen = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      seen.push(String(url));
      if (String(url).includes('gemini-a')) return Response.json({ error: { message: 'quota' } }, { status: 429 });
      if (String(url).includes('gemini-b')) return Response.json({ candidates: [{ content: { parts: [{ text: 'مو جيسون' }] } }] });
      return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
    });
    const env = { GEMINI_API_KEY: 'k', GEMINI_MODELS: 'gemini-a,gemini-b', OPENAI_API_KEY: 'o' };
    const out = await askJSON(env, { system: 'JSON', user: 'hi' });
    expect(out).toEqual({ data: { ok: true }, provider: 'openai' });
    expect(seen.map((u) => u.split('/').pop())).toEqual(['gemini-a:generateContent', 'gemini-b:generateContent', 'completions']);
  });

  it('falls back to Workers AI with no keys at all', async () => {
    const env = { AI: { run: async () => ({ response: '{"reply":"تمام"}' }) } };
    expect(await askJSON(env, { system: 's', user: 'u' })).toEqual({ data: { reply: 'تمام' }, provider: 'workers-ai' });
  });

  it('reports every failure when nothing works', async () => {
    await expect(askJSON({}, { system: 's', user: 'u' })).rejects.toThrow('ما في أي نموذج');
  });
});

describe('explainMetaError', () => {
  it('turns common Graph errors into plain Arabic', () => {
    expect(explainMetaError(new MetaError({ code: 190, message: 'expired' }, 400))).toContain('/connect');
    expect(explainMetaError(new MetaError({ code: 10, message: 'perm' }, 400))).toContain('صلاحية');
  });
});
