export function migrationMaintenance(request: Request, enabled: boolean): Response | null {
  if (!enabled) return null;
  const path = new URL(request.url).pathname;
  const headers = { 'cache-control': 'no-store', 'retry-after': '60' };
  if (request.method === 'GET' && path === '/api/migration-status') {
    return Response.json({ maintenance: true }, { headers });
  }
  if (['GET', 'HEAD'].includes(request.method) &&
    (path.startsWith('/_next/static/') || path.startsWith('/assets/') || path === '/favicon.ico')) return null;
  const message = 'ระบบกำลังย้ายฐานข้อมูล กรุณารอสักครู่แล้วลองใหม่ ข้อมูลเดิมยังอยู่ครบ';
  if (request.method !== 'GET' || path.startsWith('/api/') || !request.headers.get('accept')?.includes('text/html')) {
    return Response.json({ error: message, maintenance: true }, { status: 503, headers });
  }
  return new Response(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>กำลังปรับปรุงระบบ</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f7fb;font-family:system-ui,sans-serif;color:#252b47"><main style="max-width:540px;margin:24px;padding:32px;border:1px solid #f0d481;border-radius:20px;background:#fffbea;text-align:center"><h1 style="font-size:26px">กำลังย้ายฐานข้อมูล</h1><p style="line-height:1.8">พักการใช้งานชั่วคราวเพื่อย้ายข้อมูลล่าสุดให้ครบถ้วน<br>กรุณาลองใหม่หลังแจ้งว่าอัปเดตเสร็จแล้ว</p><button onclick="location.reload()" style="padding:12px 24px;border:0;border-radius:10px;background:#353b86;color:white;font-size:16px;cursor:pointer">ตรวจอีกครั้ง</button></main></body></html>`, {
    status: 503, headers: { ...headers, 'content-type': 'text/html; charset=utf-8' },
  });
}
