import { NextRequest, NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureAttendanceSetup, type AuthUser } from "@/db/attendance";
import { getAccessData, saveAccessUser } from "@/db/access";

async function resolveUser(request: NextRequest): Promise<AuthUser | null> {
  const authenticated = await getChatGPTUser();
  if (authenticated) return { userId: authenticated.userId, email: authenticated.email, displayName: authenticated.displayName };
  if (["localhost", "127.0.0.1", "terminal.local"].includes(request.nextUrl.hostname)) return { userId: "local-qa", email: "qa@local.test", displayName: "Local HR" };
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await resolveUser(request);
  if (!auth) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  try { return NextResponse.json(await getAccessData(auth)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "โหลดสิทธิ์ไม่สำเร็จ" }, { status: 400 }); }
}

export async function POST(request: NextRequest) {
  const auth = await resolveUser(request);
  if (!auth) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  try {
    const currentUser = await ensureAttendanceSetup(auth);
    return NextResponse.json(await saveAccessUser(currentUser, await request.json() as Record<string, unknown>));
  } catch (error) {
    const message = error instanceof Error ? error.message : "บันทึกสิทธิ์ไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: message.includes("เฉพาะ HR") ? 403 : 400 });
  }
}
