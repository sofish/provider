import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { signJWT, verifyJWT } from '../utils/jwt.js';

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to avoid length-based timing leaks
    b = a;
  }
  const encoder = new TextEncoder();
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let result = a.length ^ b.length; // will be non-zero if lengths differ
  for (let i = 0; i < ab.length; i++) {
    result |= ab[i] ^ bb[i];
  }
  return result === 0;
}

export function createAuthRoutes(adminPassword: string, jwtSecret: string) {
  const app = new Hono();

  // POST /admin/login
  app.post('/login', async (c) => {
    const body = await c.req.json<{ password?: string }>();

    if (!body.password || !timingSafeEqual(body.password, adminPassword)) {
      return c.json({ error: 'Invalid password' }, 401);
    }

    const token = await signJWT({ sub: 'admin' }, jwtSecret);

    setCookie(c, 'admin_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/',
      maxAge: 24 * 60 * 60,
    });

    return c.json({ ok: true });
  });

  // POST /admin/logout
  app.post('/logout', (c) => {
    deleteCookie(c, 'admin_token', { path: '/' });
    return c.json({ ok: true });
  });

  // GET /admin/me
  app.get('/me', async (c) => {
    const token = getCookie(c, 'admin_token');
    if (!token) return c.json({ authenticated: false });

    const payload = await verifyJWT(token, jwtSecret);
    return c.json({ authenticated: !!payload });
  });

  return app;
}
