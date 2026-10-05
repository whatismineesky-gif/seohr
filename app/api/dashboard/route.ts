export async function GET() {
  return Response.json({ error: "หน้าภาพรวมปิดใช้งานแล้ว" }, { status: 410, headers: { "cache-control": "no-store" } });
}
