import { getChatGPTUser } from "@/app/chatgpt-auth";

export async function requireApiUser(
  request: Request,
): Promise<Response | null> {
  if (await getChatGPTUser()) return null;

  const hostname = new URL(request.url).hostname;
  if (["localhost", "127.0.0.1", "terminal.local"].includes(hostname))
    return null;

  return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
}
