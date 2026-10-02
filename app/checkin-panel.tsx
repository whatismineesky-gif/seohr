"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  Save,
  Send,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Config = {
  systemEnabled: boolean;
  otherMeetingStart: string;
  staffMeetingStart: string;
  meetingLateAfter: string;
  meetingAnswersOpen: boolean;
  workEndStart: string;
  workEndDeadline: string;
};

type CheckinSession = {
  id: number;
  employeeId: string;
  workDate: string;
  meetingStartedAt: string | null;
  meetingLate: boolean;
  meetingEndedAt: string | null;
  meetingAnswer: string;
  workEndedAt: string | null;
};

type CheckinData = {
  currentUser: {
    displayName: string;
    role: "employee" | "hr" | "audit";
    employeeId: string | null;
  };
  employee: {
    id: string;
    nickname: string;
    team: string;
    position: string;
    status: string;
  } | null;
  serverNow: { date: string; time: string; iso: string };
  config: Config;
  todaySession: CheckinSession | null;
  checkoutSession: CheckinSession | null;
  checkoutWorkDate: string;
  history: CheckinSession[];
  availability: {
    meetingStart: string;
    meetingCanStart: boolean;
    meetingWouldBeLate: boolean;
    meetingCanEnd: boolean;
    workEndAvailable: boolean;
    workCanEnd: boolean;
  };
};

function thaiDate(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function thaiTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function StatusIcon({ done }: { done: boolean }) {
  return done ? (
    <CheckCircle2 className="size-5 text-emerald-600" />
  ) : (
    <Clock3 className="size-5 text-slate-400" />
  );
}

export function CheckinPanel() {
  const [data, setData] = useState<CheckinData | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/checkin", { cache: "no-store" });
      const result = (await response.json()) as CheckinData & { error?: string };
      if (!response.ok) throw new Error(result.error || "โหลดข้อมูลเช็คชื่อไม่สำเร็จ");
      setData(result);
      setConfig(result.config);
      setAnswer(result.todaySession?.meetingAnswer ?? "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "โหลดข้อมูลเช็คชื่อไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Initial remote data synchronization for this client-only panel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function submit(nextAction: string, extra: Record<string, unknown> = {}) {
    setAction(nextAction);
    try {
      const response = await fetch("/api/checkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: nextAction, ...extra }),
      });
      const result = (await response.json()) as { error?: string; late?: boolean };
      if (!response.ok) throw new Error(result.error || "บันทึกข้อมูลไม่สำเร็จ");
      if (nextAction === "meeting_start")
        toast.success(result.late ? "บันทึกเข้าประชุมแล้ว (สาย)" : "บันทึกเข้าประชุมแล้ว");
      else if (nextAction === "meeting_end") toast.success("ส่งคำตอบและบันทึกเลิกประชุมแล้ว");
      else if (nextAction === "work_end") toast.success("บันทึกเวลาเลิกงานแล้ว");
      else toast.success("บันทึก Config แล้ว");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "บันทึกข้อมูลไม่สำเร็จ");
    } finally {
      setAction("");
    }
  }

  if (loading && !data)
    return (
      <section className="panel flex min-h-64 items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" />
      </section>
    );
  if (!data || !config) return null;

  const today = data.todaySession;
  const checkout = data.checkoutSession;
  const isHr = data.currentUser.role === "hr";

  return (
    <Tabs defaultValue="checkin" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="checkin"><CalendarCheck /> เช็คชื่อ</TabsTrigger>
          {isHr && <TabsTrigger value="config"><Settings2 /> Config</TabsTrigger>}
        </TabsList>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} /> อัปเดตเวลา
        </Button>
      </div>

      <TabsContent value="checkin" className="space-y-5">
        {!config.systemEnabled && (
          <section className="panel flex items-start gap-3 border-amber-200 bg-amber-50">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div>
              <h3 className="font-semibold text-amber-900">ระบบเช็คชื่อยังไม่เปิดใช้งาน</h3>
              <p className="mt-1 text-sm text-amber-800">
                หน้านี้อยู่ระหว่างการพัฒนาเพื่อรออนุมัติ ผู้ใช้งานยังไม่ต้องเช็คชื่อในระบบตอนนี้
              </p>
            </div>
          </section>
        )}
        <section className="panel overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-800 text-white">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.22em] text-indigo-200">TODAY CHECK-IN</p>
              <h2 className="mt-2 text-2xl font-bold">
                {data.employee ? `${data.employee.nickname} · ${data.employee.team}` : data.currentUser.displayName}
              </h2>
              <p className="mt-1 text-sm text-indigo-200">
                {data.employee ? `${data.employee.position} · รหัส ${data.employee.id}` : "บัญชีนี้ยังไม่ได้เชื่อมกับข้อมูลพนักงาน"}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-6 py-4 text-right backdrop-blur">
              <p className="text-sm text-indigo-200">เวลาประเทศไทย</p>
              <strong className="text-3xl tabular-nums">{data.serverNow.time}</strong>
              <p className="mt-1 text-xs text-indigo-200">{thaiDate(data.serverNow.date)}</p>
            </div>
          </div>
        </section>

        {!data.employee && (
          <section className="panel flex items-start gap-3 border-amber-200 bg-amber-50">
            <AlertTriangle className="mt-0.5 size-5 text-amber-600" />
            <div><h3 className="font-semibold text-amber-900">ยังไม่สามารถเช็คชื่อได้</h3><p className="mt-1 text-sm text-amber-800">ให้ HR เชื่อม User นี้กับข้อมูลพนักงานในเมนูสิทธิ์ผู้ใช้งานก่อน</p></div>
          </section>
        )}

        <div className="grid gap-5 xl:grid-cols-3">
          <section className="panel flex flex-col">
            <div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><LogIn /></span><div><p className="section-kicker">STEP 1</p><h2>เข้าประชุม</h2></div></div><StatusIcon done={Boolean(today?.meetingStartedAt)} /></div>
            <div className="mt-5 flex-1 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              <p>ตำแหน่งนี้เริ่มกดได้ <strong className="text-slate-900">{data.availability.meetingStart} น.</strong></p>
              <p className="mt-1">หลัง <strong className="text-rose-600">{config.meetingLateAfter} น.</strong> ระบบบันทึก “มาสาย” อัตโนมัติ</p>
              {today?.meetingStartedAt && <p className="mt-3 font-medium text-emerald-700">บันทึกแล้ว {thaiTime(today.meetingStartedAt)} น. {today.meetingLate ? "· สาย" : "· ตรงเวลา"}</p>}
            </div>
            <Button className="mt-4 w-full" disabled={!data.availability.meetingCanStart || Boolean(action)} onClick={() => void submit("meeting_start")}>
              {action === "meeting_start" ? <Loader2 className="animate-spin" /> : <LogIn />} {today?.meetingStartedAt ? "เข้าประชุมแล้ว" : data.availability.meetingWouldBeLate ? "เข้าประชุม (บันทึกว่าสาย)" : "เข้าประชุม"}
            </Button>
          </section>

          <section className="panel flex flex-col">
            <div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Send /></span><div><p className="section-kicker">STEP 2</p><h2>เลิกประชุม</h2></div></div><StatusIcon done={Boolean(today?.meetingEndedAt)} /></div>
            <div className="mt-5 flex-1">
              <div className="mb-3 flex items-center justify-between text-sm"><span className="text-slate-600">สถานะรับคำตอบ</span><Badge className={config.meetingAnswersOpen ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}>{config.meetingAnswersOpen ? "เปิดรับ" : "ปิดรับ"}</Badge></div>
              <textarea className="min-h-28 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50" placeholder="กรอกคำตอบหรือสรุปหลังประชุม..." value={answer} maxLength={2000} disabled={!data.availability.meetingCanEnd || Boolean(today?.meetingEndedAt)} onChange={(event) => setAnswer(event.target.value)} />
              {today?.meetingEndedAt && <p className="mt-2 text-sm font-medium text-emerald-700">ส่งแล้ว {thaiTime(today.meetingEndedAt)} น.</p>}
            </div>
            <Button className="mt-4 w-full" disabled={!data.availability.meetingCanEnd || !answer.trim() || Boolean(action)} onClick={() => void submit("meeting_end", { answer })}>
              {action === "meeting_end" ? <Loader2 className="animate-spin" /> : <Send />} {today?.meetingEndedAt ? "ส่งคำตอบแล้ว" : "ส่งคำตอบและเลิกประชุม"}
            </Button>
          </section>

          <section className="panel flex flex-col">
            <div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-violet-50 text-violet-700"><LogOut /></span><div><p className="section-kicker">STEP 3</p><h2>เลิกงาน</h2></div></div><StatusIcon done={Boolean(checkout?.workEndedAt)} /></div>
            <div className="mt-5 flex-1 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              <p>สำหรับวันทำงาน <strong className="text-slate-900">{thaiDate(data.checkoutWorkDate)}</strong></p>
              <p className="mt-1">กดได้วันถัดไปเวลา <strong className="text-slate-900">{config.workEndStart}–{config.workEndDeadline} น.</strong></p>
              {checkout?.workEndedAt && <p className="mt-3 font-medium text-emerald-700">บันทึกแล้ว {thaiTime(checkout.workEndedAt)} น.</p>}
            </div>
            <Button className="mt-4 w-full" disabled={!data.availability.workCanEnd || Boolean(action)} onClick={() => void submit("work_end")}>
              {action === "work_end" ? <Loader2 className="animate-spin" /> : <LogOut />} {checkout?.workEndedAt ? "เลิกงานแล้ว" : data.availability.workEndAvailable ? "เลิกงาน" : "ยังไม่ถึงเวลาเลิกงาน"}
            </Button>
          </section>
        </div>

        <section className="panel overflow-hidden p-0">
          <div className="panel-heading px-6 pt-6"><div><p className="section-kicker">CHECK-IN HISTORY</p><h2>ประวัติเช็คชื่อ</h2><p className="mt-1 text-sm text-muted-foreground">แสดงย้อนหลังสูงสุด 31 วันทำงาน</p></div><Clock3 className="text-indigo-600" /></div>
          <div className="mt-4 overflow-x-auto border-t"><Table><TableHeader><TableRow className="bg-slate-50"><TableHead>วันทำงาน</TableHead><TableHead>เข้าประชุม</TableHead><TableHead>สถานะ</TableHead><TableHead>เลิกประชุม</TableHead><TableHead>เลิกงาน</TableHead><TableHead>คำตอบ</TableHead></TableRow></TableHeader><TableBody>
            {data.history.length ? data.history.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{thaiDate(item.workDate)}</TableCell><TableCell>{thaiTime(item.meetingStartedAt)}</TableCell><TableCell>{item.meetingStartedAt ? <Badge className={item.meetingLate ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}>{item.meetingLate ? "สาย" : "ตรงเวลา"}</Badge> : "-"}</TableCell><TableCell>{thaiTime(item.meetingEndedAt)}</TableCell><TableCell>{thaiTime(item.workEndedAt)}</TableCell><TableCell className="max-w-80 whitespace-normal text-sm text-slate-600">{item.meetingAnswer || "-"}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">ยังไม่มีประวัติเช็คชื่อ</TableCell></TableRow>}
          </TableBody></Table></div>
        </section>
      </TabsContent>

      {isHr && <TabsContent value="config" className="space-y-5">
        <section className="panel">
          <div className="panel-heading"><div><p className="section-kicker">CHECK-IN CONFIG</p><h2>ตั้งค่าเวลาเช็คชื่อ</h2><p className="mt-1 text-sm text-muted-foreground">เวลาในระบบทั้งหมดอ้างอิงเขตเวลา Asia/Bangkok</p></div><Settings2 className="text-indigo-600" /></div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            <label className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:col-span-2 xl:col-span-3"><span><strong className="block text-sm text-amber-900">เปิดใช้งานระบบเช็คชื่อ</strong><small className="text-amber-700">เปิดเมื่อได้รับอนุมัติให้เริ่มใช้งานจริงแล้วเท่านั้น</small></span><input type="checkbox" className="size-5 accent-indigo-600" checked={config.systemEnabled} onChange={(event) => setConfig({ ...config, systemEnabled: event.target.checked })} /></label>
            <label className="field-label">พนักงานตำแหน่งอื่นเริ่มเข้าประชุม<Input type="time" value={config.otherMeetingStart} onChange={(event) => setConfig({ ...config, otherMeetingStart: event.target.value })} /></label>
            <label className="field-label">ตำแหน่ง Staff เริ่มเข้าประชุม<Input type="time" value={config.staffMeetingStart} onChange={(event) => setConfig({ ...config, staffMeetingStart: event.target.value })} /></label>
            <label className="field-label">เวลาตัดเป็นมาสาย<Input type="time" value={config.meetingLateAfter} onChange={(event) => setConfig({ ...config, meetingLateAfter: event.target.value })} /></label>
            <label className="field-label">เริ่มกดเลิกงาน (วันถัดไป)<Input type="time" value={config.workEndStart} onChange={(event) => setConfig({ ...config, workEndStart: event.target.value })} /></label>
            <label className="field-label">สิ้นสุดการกดเลิกงาน<Input type="time" value={config.workEndDeadline} onChange={(event) => setConfig({ ...config, workEndDeadline: event.target.value })} /></label>
            <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3"><span><strong className="block text-sm">เปิดรับคำตอบหลังประชุม</strong><small className="text-slate-500">ปิดแล้วพนักงานจะส่งคำตอบไม่ได้</small></span><input type="checkbox" className="size-5 accent-indigo-600" checked={config.meetingAnswersOpen} onChange={(event) => setConfig({ ...config, meetingAnswersOpen: event.target.checked })} /></label>
          </div>
          <Button className="mt-6" disabled={action === "save_config"} onClick={() => void submit("save_config", config)}>{action === "save_config" ? <Loader2 className="animate-spin" /> : <Save />} บันทึก Config</Button>
        </section>
      </TabsContent>}
    </Tabs>
  );
}
