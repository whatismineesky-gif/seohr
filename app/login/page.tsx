import { LockKeyhole, ShieldCheck, Users } from "lucide-react";
import { redirect } from "next/navigation";

import { getChatGPTUser } from "../chatgpt-auth";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getChatGPTUser();
  if (user) redirect("/");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-5 py-10 text-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(99,102,241,0.32),transparent_34%),radial-gradient(circle_at_85%_75%,rgba(14,165,233,0.22),transparent_32%)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/70 to-transparent" />

      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-2xl shadow-indigo-950/40 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="hidden min-h-[610px] flex-col justify-between bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-950 p-12 text-white lg:flex">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <Users className="size-6" />
            </span>
            <div>
              <strong className="block tracking-[0.14em]">PEOPLE OS</strong>
              <span className="text-sm text-indigo-200">SEO Department</span>
            </div>
          </div>

          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-200">
              Human Resources
            </p>
            <h1 className="max-w-md text-4xl font-bold leading-tight">
              จัดการทีมและเงินเดือน
              <br />
              ในระบบเดียว
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-indigo-100/80">
              ข้อมูลพนักงาน การลงเวลา รายการเบิก ใบเตือน และเงินเดือน สำหรับทีม
              SEO
            </p>
          </div>

          <div className="flex items-center gap-3 text-sm text-indigo-100/75">
            <ShieldCheck className="size-5" />
            <span>ระบบจะตรวจสอบบัญชีและสิทธิ์ก่อนเข้าใช้งาน</span>
          </div>
        </div>

        <div className="flex min-h-[560px] items-center px-7 py-12 sm:px-12 lg:min-h-[610px]">
          <div className="w-full">
            <div className="mb-9 flex items-center gap-3 lg:hidden">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-indigo-600 text-white">
                <Users className="size-6" />
              </span>
              <div>
                <strong className="block tracking-[0.14em]">PEOPLE OS</strong>
                <span className="text-sm text-slate-500">SEO Department</span>
              </div>
            </div>

            <span className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
              <LockKeyhole className="size-6" />
            </span>
            <p className="text-sm font-semibold text-indigo-600">
              ยินดีต้อนรับกลับ
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              เข้าสู่ระบบ People OS
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-500">
              ใช้ชื่อผู้ใช้และรหัสผ่าน People OS ที่ได้รับจากผู้ดูแลระบบ
            </p>

            <LoginForm />

            <div className="mt-7 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-500">
              หากไม่สามารถเข้าสู่ระบบได้ กรุณาติดต่อ HR
              เพื่อตรวจสอบอีเมลและสิทธิ์การใช้งาน
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
