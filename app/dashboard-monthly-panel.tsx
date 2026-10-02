"use client";
import { useEffect, useState } from "react";
import { ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { previousBangkokMonth } from "@/lib/dashboard-month";
import type { DashboardSection } from "@/db/dashboard";

type Overview = { month: string; scope: string; sections: DashboardSection[]; followups: { label: string; count: number; unit: string; menu: string }[] };
const numbers = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 });
export function DashboardMonthlyPanel({ onNavigate }: { onNavigate: (menu: string) => void }) {
  const [month, setMonth] = useState(() => previousBangkokMonth());
  const [state, setState] = useState<{ data?: Overview; error?: string; loading: boolean }>({ loading: true });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/dashboard?month=${encodeURIComponent(month)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { const data = await response.json() as Overview & { error?: string }; if (!response.ok) throw new Error(data.error || "โหลดข้อมูลไม่สำเร็จ"); return data as Overview; })
      .then(data => setState({ data, loading: false }))
      .catch(error => { if (!controller.signal.aborted) setState({ error: error.message, loading: false }); });
    return () => controller.abort();
  }, [month, refresh]);
  const label = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${month}-01T00:00:00+07:00`));
  const loading = state.loading || state.data?.month !== month && !state.error;
  return <section className="space-y-4" aria-label="ภาพรวมรายเดือน">
    <div className="panel flex flex-wrap items-center justify-between gap-4">
      <div><p className="section-kicker">MONTHLY OVERVIEW</p><h2 className="text-lg font-semibold">ภาพรวม {label}</h2><p className="mt-1 text-sm text-muted-foreground">{state.data?.scope ?? "เริ่มต้นที่เดือนก่อนหน้า"} · ตัวเลขรายเดือนอ้างอิงเดือนที่เลือก</p></div>
      <div className="flex flex-wrap items-center gap-2"><label htmlFor="dashboard-month" className="text-sm">เลือกเดือน</label><input id="dashboard-month" aria-label="เดือนภาพรวม" type="month" value={month} onChange={event => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) { setState({ loading: true }); setMonth(event.target.value); } }} className="rounded-lg border bg-background px-3 py-2 text-sm"/><Button variant="outline" size="icon" aria-label="รีเฟรชภาพรวมรายเดือน" onClick={() => { setState({ loading: true }); setRefresh(value => value + 1); }}><RefreshCw className={loading ? "animate-spin" : ""}/></Button></div>
    </div>
    {loading ? <div className="panel text-sm text-muted-foreground" role="status">กำลังโหลดภาพรวมรายเดือน…</div> : state.error ? <div className="panel text-red-600" role="alert">{state.error}</div> : state.data && <>
      <div className="panel"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">รายการที่ต้องติดตามในเดือนนี้</h2><span className="text-xs text-muted-foreground">หน่วยคน-วัน = พนักงานหนึ่งคนในหนึ่งวัน</span></div>{state.data.followups.length ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{state.data.followups.map(item => <button key={item.label} onClick={() => onNavigate(item.menu)} className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-sm transition hover:bg-amber-100"><span>{item.label}<strong className="mt-1 block text-amber-800">{numbers.format(item.count)} {item.unit}</strong></span><ChevronRight className="size-4 shrink-0"/></button>)}</div> : <p className="text-sm text-muted-foreground">ไม่พบรายการค้างจากข้อมูลและสิทธิ์ที่ตรวจสอบได้</p>}</div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{state.data.sections.map(section => <article key={section.title} className="panel min-w-0"><div className="mb-4 flex items-center justify-between gap-2"><h3 className="font-semibold">{section.title}</h3><Button variant="ghost" size="sm" aria-label={`เปิด${section.title}`} onClick={() => onNavigate(section.menu)}><ChevronRight/></Button></div>{section.recorded === 0 && <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">ยังไม่บันทึกข้อมูลในเดือนนี้</p>}<dl className="grid grid-cols-2 gap-4">{section.metrics.map(item => <div key={item.label}><dt className="text-xs text-muted-foreground">{item.label}</dt><dd className={`mt-1 text-xl font-semibold ${item.tone === "green" ? "text-emerald-600" : item.tone === "amber" ? "text-amber-600" : item.tone === "red" ? "text-red-600" : ""}`}>{numbers.format(item.value)} <span className="text-xs font-normal text-muted-foreground">{item.unit}</span></dd></div>)}</dl>{section.teams && section.teams.length > 0 && <div className="mt-4 max-h-40 space-y-2 overflow-y-auto border-t pt-3" aria-label="ยอดส่งงานตามทีม">{section.teams.map(team => <div key={team.name} className="flex justify-between text-xs"><span>{team.name}</span><strong>{numbers.format(team.count)} เว็บ</strong></div>)}</div>}</article>)}</div>
      <p className="text-xs text-muted-foreground">ผลตรวจนับจากรายการที่ยืนยันแล้ว ส่วนยังไม่ตรวจนับตามวันทำงานและสถานะที่ตั้งค่าไว้จนถึงวันนี้ · สรุปใบเตือนอ้างอิงผลยอดฝากรายเดือน · ยอดเงินเดือนรวมเฉพาะรายการที่บันทึกแล้ว</p>
    </>}
  </section>;
}
