import { ensure } from '../engine/validation.ts';

/** 順序が意味を持つ配列を保ち、オブジェクトのキーだけ正規化する。 */
export function canonicalJson(value: unknown, depth = 0): string {
  ensure(depth < 80, '保存データが深すぎます');
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    ensure(Number.isFinite(value) && !Object.is(value, -0), '非有限数・負のゼロは保存できません');
    return JSON.stringify(value);
  }
  if (Array.isArray(value))
    return '[' + value.map((v) => canonicalJson(v, depth + 1)).join(',') + ']';
  ensure(
    typeof value === 'object' &&
      value !== null &&
      Object.getPrototypeOf(value) === Object.prototype,
    'JSON以外の保存値です',
  );
  return (
    '{' +
    Object.keys(value)
      .sort()
      .map(
        (key) =>
          JSON.stringify(key) +
          ':' +
          canonicalJson((value as Record<string, unknown>)[key], depth + 1),
      )
      .join(',') +
    '}'
  );
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
