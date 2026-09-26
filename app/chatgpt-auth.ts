import { getSessionUser, type SessionUser } from "./session-auth";

export type ChatGPTUser = SessionUser;

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  return getSessionUser();
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  const { redirect } = await import("next/navigation");
  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  void returnTo;
  return "/login";
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  void returnTo;
  return "/login";
}
