const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64urlEncode(data: Uint8Array): string {
  const binStr = Array.from(data, (b) => String.fromCharCode(b)).join('');
  return btoa(binStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  const binStr = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binStr, (c) => c.charCodeAt(0));
}

async function getKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export interface JWTPayload {
  sub: string;
  iat: number;
  exp: number;
}

const TOKEN_EXPIRY = 24 * 60 * 60; // 24 hours in seconds

export async function signJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + TOKEN_EXPIRY,
  };

  const header = base64urlEncode(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64urlEncode(encoder.encode(JSON.stringify(fullPayload)));
  const data = `${header}.${body}`;

  const key = await getKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));

  return `${data}.${base64urlEncode(sig)}`;
}

export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, sig] = parts;
  const key = await getKey(secret);

  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64urlDecode(sig),
    encoder.encode(`${header}.${body}`),
  );
  if (!valid) return null;

  const payload: JWTPayload = JSON.parse(decoder.decode(base64urlDecode(body)));

  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload;
}
