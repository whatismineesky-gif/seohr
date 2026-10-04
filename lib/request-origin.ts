// Trust one configured HTTPS origin, never a client-supplied forwarded header.
export function sameApplicationOrigin(request: Request) {
  const expected = process.env.APP_ORIGIN;
  if (!expected) return false;
  try {
    const origin = new URL(expected);
    return origin.protocol === 'https:' && origin.origin === expected && request.headers.get('origin') === expected;
  } catch { return false; }
}
