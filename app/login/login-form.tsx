"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

export default function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: data.get("username"), password: data.get("password") }) });
    if (response.ok) window.location.href = "/";
    else { const result = await response.json().catch(() => ({})) as { error?: string }; setError(result.error ?? "เข้าสู่ระบบไม่สำเร็จ"); setLoading(false); }
  }
  return <form className="mt-8 space-y-4" onSubmit={submit}>
    <label className="block text-sm font-medium text-slate-700">ชื่อผู้ใช้<input name="username" required autoComplete="username" className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label>
    <label className="block text-sm font-medium text-slate-700">รหัสผ่าน<input name="password" type="password" required autoComplete="current-password" className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label>
    {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
    <button disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-base font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:opacity-60">
      {loading ? <Loader2 className="size-5 animate-spin" /> : <>เข้าสู่ระบบ <ArrowRight className="size-5" /></>}
    </button>
  </form>;
}
