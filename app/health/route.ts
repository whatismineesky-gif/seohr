export const dynamic = 'force-dynamic';
export async function GET() {
  return Response.json({ ok: true, runtime: 'node' }, { headers: { 'cache-control': 'no-store' } });
}
