import { randomBytes } from 'node:crypto';

export function generateId(prefix: string = 'chatcmpl'): string {
  const hex = randomBytes(12).toString('hex');
  return `${prefix}-${hex}`;
}
