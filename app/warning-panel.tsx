"use client";

import { ChangeEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, FileSpreadsheet, Loader2, Save, Settings2, ShieldAlert, Trash2, Trophy, Upload } from "lucide-react";
import { toast } from "sonner";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Config = { tenureMonth: number; mid: number; min: number };
type ResultRow = {
  employeeId: string; nickname: string; team: string; tenureMonth: number; depositCount: number;
  mid: number; min: number; resultType: string; tenureQuarter: number; quarterMonth: number; saved: boolean;
};
type QuarterRow = {
  employeeId: string; nickname: string; team: string; tenureQuarter: number; depositTotal: number;
  minTotal: number; yellowCount: number; redCount: number; recordedMonths: number;
  months: Array<{ tenureMonth: number; resultMonth: string; depositCount: number | null;
    mid: number; min: number; resultType: string | null }>;
};
type WarningData = { month: string; configs: Config[]; rows: ResultRow[]; quarterSummary: QuarterRow[]; savedRecordCount: number };

const currentMonth = new Date().toISOString().slice(0, 7);
const number = new Intl.NumberFormat("th-TH");

function calculateResult(deposit: number, mid: number, min: number) {
  if (deposit > mid) return "winloss";
  if (deposit > min) return "yellow";
  return "red";
}

function resultBadge(result: string) {
  if (result === "winloss") return <Badge className="bg-emerald-600"><Trophy /> WINLOSS</Badge>;
  if (result === "yellow") return <Badge className="bg-amber-400 text-amber-950"><AlertTriangle /> ใบเหลือง</Badge>;
  return <Badge variant="destructive"><ShieldAlert /> ใบแดง</Badge>;
}

function depositColor(result: string | null) {
  if (result === "winloss") return "bg-emerald-50 text-emerald-700";
  if (result === "yellow") return "bg-amber-50 text-amber-700";
  if (result === "red") return "bg-rose-50 text-rose-700";
  return "bg-slate-50 text-slate-500";
}

function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("th-TH", { month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
}

function normalize(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "").toLowerCase();
}

const quarterColumnWidths = [200, 160, 160, 160, 120, 120, 160, 180];

function QuarterColumns({ quarter }: { quarter: number }) {
  return <TableRow className="bg-slate-50">
    <TableHead scope="col">พนักงาน</TableHead>
    {[1, 2, 3].map((slot) => <TableHead scope="col" key={slot} className="text-center">เดือนที่ {slot}<span className="block text-xs font-normal">อายุงานเดือนที่ {(quarter - 1) * 3 + slot}</span></TableHead>)}
    <TableHead scope="col" className="text-right">ฝากรวม</TableHead><TableHead scope="col" className="text-right">MIN รวม</TableHead>
    <TableHead scope="col">ใบเหลือง / ใบแดง</TableHead><TableHead scope="col">ผลรวม</TableHead>
  </TableRow>;
}

function QuarterSection({ quarter, count, children }: { quarter: number; count: number; children: ReactNode }) {
  const headerScroll = useRef<HTMLDivElement>(null);
  const bodyScroll = useRef<HTMLDivElement>(null);
  function syncScroll(source: HTMLDivElement, target: HTMLDivElement | null) {
    if (target && target.scrollLeft !== source.scrollLeft) target.scrollLeft = source.scrollLeft;
  }
  const columns = <colgroup>{quarterColumnWidths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>;
  return <Collapsible defaultOpen={false} asChild>
    <section className="panel group/quarter relative min-w-0 p-0! [contain:inline-size]">
      {/* Keep the sticky block outside horizontal scroll containers so it follows page scrolling. */}
      <div className="sticky top-[4.25rem] z-10 rounded-t-[.95rem] bg-white shadow-sm">
        <div className="panel-heading px-6 py-5">
          <div><p className="section-kicker">TENURE QUARTER {quarter}</p><h2>ไตรมาส {quarter}</h2>
            <p className="mt-1 text-sm text-muted-foreground">อายุงานเดือนที่ {(quarter - 1) * 3 + 1}–{quarter * 3} · {count} คน</p>
          </div>
          <CollapsibleTrigger asChild><Button variant="outline" className="group shrink-0" aria-label={`ยุบหรือขยายไตรมาส ${quarter}`}><span className="group-data-[state=open]:hidden">ขยาย</span><span className="hidden group-data-[state=open]:inline">ยุบ</span><ChevronDown className="transition-transform group-data-[state=open]:rotate-180" /></Button></CollapsibleTrigger>
        </div>
        <div ref={headerScroll} onScroll={(event) => syncScroll(event.currentTarget, bodyScroll.current)} className="overflow-x-auto border-t group-data-[state=closed]/quarter:hidden" aria-hidden="true">
          <table className="w-full min-w-[1260px] table-fixed text-sm">{columns}<TableHeader><QuarterColumns quarter={quarter} /></TableHeader></table>
        </div>
      </div>
      <CollapsibleContent>
        <div ref={bodyScroll} onScroll={(event) => syncScroll(event.currentTarget, headerScroll.current)} className="overflow-x-auto rounded-b-[.95rem]">
          <table className="w-full min-w-[1260px] table-fixed text-sm" aria-label={`ยอดฝากไตรมาส ${quarter}`}>
            {columns}<TableHeader className="sr-only"><QuarterColumns quarter={quarter} /></TableHeader>{children}
          </table>
        </div>
      </CollapsibleContent>
    </section>
  </Collapsible>;
}

export function WarningPanel({ canEdit }: { canEdit: boolean }) {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<WarningData | null>(null);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [configs, setConfigs] = useState<Config[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ResultRow | null>(null);
  const [deleteMonthTarget, setDeleteMonthTarget] = useState<{ month: string; count: number } | null>(null);
  const quarterGroups = useMemo(() => {
    const groups = new Map<number, QuarterRow[]>();
    for (const item of data?.quarterSummary ?? []) {
      const group = groups.get(item.tenureQuarter) ?? [];
      group.push(item);
      groups.set(item.tenureQuarter, group);
    }
    return [...groups.entries()].sort(([left], [right]) => right - left);
  }, [data?.quarterSummary]);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/warnings?month=${month}`, { cache: "no-store" });
      const result = await response.json() as WarningData & { error?: string };
      if (!response.ok) throw new Error(result.error || "โหลดข้อมูลใบเตือนไม่สำเร็จ");
      setData(result);
      setConfigs(result.configs);
      setRows(result.rows.filter((item) => item.saved));
    } catch (error) { toast.error(error instanceof Error ? error.message : "โหลดข้อมูลใบเตือนไม่สำเร็จ"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [month]);

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !data) return;
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const imported = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const employeeKey = Object.keys(imported[0] ?? {}).find((key) => ["รหัสพนักงาน", "employeeid", "employee_id", "id"].includes(normalize(key)));
      const depositKey = Object.keys(imported[0] ?? {}).find((key) => ["จำนวนฝาก", "deposit", "depositcount", "ยอดฝาก"].includes(normalize(key)));
      if (!employeeKey || !depositKey) throw new Error("ไฟล์ต้องมีคอลัมน์ รหัสพนักงาน และ จำนวนฝาก");
      const master = new Map(data.rows.map((item) => [normalize(item.employeeId), item]));
      const next = new Map(rows.map((item) => [item.employeeId, item]));
      const missing: string[] = [];
      for (const item of imported) {
        const rawId = String(item[employeeKey] ?? "").trim();
        const employee = master.get(normalize(rawId));
        if (!employee) { if (rawId) missing.push(rawId); continue; }
        const depositCount = Math.max(0, Math.round(Number(item[depositKey] ?? 0) || 0));
        next.set(employee.employeeId, { ...employee, depositCount, resultType: calculateResult(depositCount, employee.mid, employee.min), saved: false });
      }
      setRows([...next.values()]);
      toast.success(`นำเข้าสำเร็จ ${next.size} รายการ`, missing.length ? { description: `ไม่พบรหัสพนักงาน ${missing.length} รายการ` } : undefined);
    } catch (error) { toast.error(error instanceof Error ? error.message : "อ่านไฟล์ไม่สำเร็จ"); }
    finally { event.target.value = ""; }
  }

  function updateDeposit(employeeId: string, depositCount: number) {
    setRows((current) => current.map((item) => item.employeeId === employeeId
      ? { ...item, depositCount, resultType: calculateResult(depositCount, item.mid, item.min), saved: false }
      : item));
  }

  async function saveRows() {
    if (!rows.length) return toast.error("กรุณา Import ข้อมูลก่อนบันทึก");
    setSaving(true);
    try {
      const response = await fetch("/api/warnings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save_rows", month, rows: rows.map((item) => ({ employeeId: item.employeeId, depositCount: item.depositCount })) }) });
      const result = await response.json() as WarningData & { error?: string };
      if (!response.ok) throw new Error(result.error || "บันทึกข้อมูลไม่สำเร็จ");
      setData(result); setConfigs(result.configs); setRows(result.rows.filter((item) => item.saved));
      toast.success("บันทึกผล WINLOSS / ใบเหลือง / ใบแดงแล้ว");
    } catch (error) { toast.error(error instanceof Error ? error.message : "บันทึกข้อมูลไม่สำเร็จ"); }
    finally { setSaving(false); }
  }

  async function saveOne(item: ResultRow) {
    setSaving(true);
    try {
      const response = await fetch("/api/warnings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save_rows", month, rows: [{ employeeId: item.employeeId, depositCount: item.depositCount }] }) });
      const result = await response.json() as WarningData & { error?: string };
      if (!response.ok) throw new Error(result.error || "บันทึกรายการไม่สำเร็จ");
      setData(result); setRows(result.rows.filter((row) => row.saved)); toast.success("บันทึกการแก้ไขแล้ว");
    } catch (error) { toast.error(error instanceof Error ? error.message : "บันทึกรายการไม่สำเร็จ"); }
    finally { setSaving(false); }
  }

  async function removeOne() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const response = await fetch("/api/warnings", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ month, employeeId: deleteTarget.employeeId }) });
      const result = await response.json() as WarningData & { error?: string };
      if (!response.ok) throw new Error(result.error || "ลบรายการไม่สำเร็จ");
      setData(result); setRows(result.rows.filter((row) => row.saved)); setDeleteTarget(null); toast.success("ลบรายการใบเตือนแล้ว");
    } catch (error) { toast.error(error instanceof Error ? error.message : "ลบรายการไม่สำเร็จ"); }
    finally { setSaving(false); }
  }

  async function removeMonth() {
    if (!deleteMonthTarget || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/warnings", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete_month", month: deleteMonthTarget.month }) });
      const result = await response.json() as WarningData & { error?: string };
      if (!response.ok) throw new Error(result.error || "ลบข้อมูลทั้งเดือนไม่สำเร็จ");
      setData(result); setConfigs(result.configs); setRows(result.rows.filter((row) => row.saved)); setDeleteMonthTarget(null);
      toast.success(`ลบข้อมูลเดือน ${monthLabel(result.month)} ทั้งหมดแล้ว`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "ลบข้อมูลทั้งเดือนไม่สำเร็จ"); }
    finally { setSaving(false); }
  }

  async function saveConfig() {
    setSaving(true);
    try {
      const response = await fetch("/api/warnings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save_config", month, configs }) });
      const result = await response.json() as WarningData & { error?: string };
      if (!response.ok) throw new Error(result.error || "บันทึก Config ไม่สำเร็จ");
      setData(result); setConfigs(result.configs); setRows(result.rows.filter((item) => item.saved));
      toast.success("บันทึก Config ใบเตือนแล้ว");
    } catch (error) { toast.error(error instanceof Error ? error.message : "บันทึก Config ไม่สำเร็จ"); }
    finally { setSaving(false); }
  }

  const counts = useMemo(() => ({
    winloss: rows.filter((item) => item.resultType === "winloss").length,
    yellow: rows.filter((item) => item.resultType === "yellow").length,
    red: rows.filter((item) => item.resultType === "red").length,
  }), [rows]);

  if (loading && !data) return <section className="panel flex min-h-72 items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /> กำลังโหลดข้อมูลใบเตือน...</section>;

  return (
    <Tabs defaultValue="records" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList><TabsTrigger value="records"><FileSpreadsheet /> บันทึกประจำเดือน</TabsTrigger><TabsTrigger value="quarter"><Trophy /> รวมฝากรายไตรมาส</TabsTrigger><TabsTrigger value="config"><Settings2 /> Config</TabsTrigger></TabsList>
        <div className="flex flex-wrap items-center gap-3">
          {!canEdit && <Badge variant="outline">ดูข้อมูลอย่างเดียว</Badge>}
          <label className="field-label min-w-48">เดือนประเมิน<Input type="month" disabled={saving || Boolean(deleteMonthTarget)} value={month} onChange={(event) => setMonth(event.target.value)} /></label>
        </div>
      </div>

      <TabsContent value="records" className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3"><section className="summary-card"><CheckCircle2 className="text-emerald-600" /><div><p className="text-sm text-muted-foreground">WINLOSS</p><strong className="text-2xl">{counts.winloss} คน</strong></div></section><section className="summary-card"><AlertTriangle className="text-amber-500" /><div><p className="text-sm text-muted-foreground">ใบเหลือง</p><strong className="text-2xl">{counts.yellow} คน</strong></div></section><section className="summary-card"><ShieldAlert className="text-rose-600" /><div><p className="text-sm text-muted-foreground">ใบแดง</p><strong className="text-2xl">{counts.red} คน</strong></div></section></div>
        {canEdit && <section className="panel">
          <div className="panel-heading"><div><p className="section-kicker">IMPORT MONTHLY DEPOSIT</p><h2>นำเข้าจำนวนฝากของพนักงาน</h2><p className="mt-1 text-sm text-muted-foreground">รองรับ Excel หรือ CSV โดยใช้คอลัมน์ “รหัสพนักงาน” และ “จำนวนฝาก”</p></div><label><input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={importFile} /><Button asChild><span><Upload /> Import File</span></Button></label></div>
        </section>}
        <section className="panel overflow-hidden p-0">
          <div className="panel-heading px-6 pt-6"><div><p className="section-kicker">REVIEW BEFORE SAVE</p><h2>{canEdit ? "ตรวจสอบและแก้ไขยอดฝาก" : "ข้อมูลผลประเมินประจำเดือน"}</h2></div>{canEdit && <div className="flex flex-wrap gap-2"><Button variant="destructive" onClick={() => setDeleteMonthTarget({ month, count: data?.savedRecordCount ?? 0 })} disabled={saving || loading || data?.month !== month || !data?.savedRecordCount}><Trash2 /> ลบข้อมูลทั้งเดือน</Button><Button onClick={saveRows} disabled={saving || loading || !rows.length}>{saving ? <Loader2 className="animate-spin" /> : <Save />} บันทึกข้อมูล</Button></div>}</div>
          <div className="mt-4 overflow-auto border-t"><Table><TableHeader><TableRow className="bg-slate-50"><TableHead>รหัส</TableHead><TableHead>พนักงาน</TableHead><TableHead>อายุงาน</TableHead><TableHead>จำนวนฝาก</TableHead><TableHead>MID / MIN</TableHead><TableHead>ผล</TableHead><TableHead className="text-right">จัดการ</TableHead></TableRow></TableHeader><TableBody>
            {!rows.length && <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">ยังไม่มีข้อมูล กรุณา Import File</TableCell></TableRow>}
            {rows.map((item) => <TableRow key={item.employeeId}><TableCell>{item.employeeId}</TableCell><TableCell><strong>{item.nickname}</strong><div className="text-xs text-muted-foreground">{item.team}</div></TableCell><TableCell>{item.tenureMonth} เดือน<div className="text-xs text-muted-foreground">ไตรมาส {item.tenureQuarter} · เดือนที่ {item.quarterMonth}</div></TableCell><TableCell><Input className="w-28" type="number" min="0" value={item.depositCount} disabled={!canEdit} onChange={(event) => updateDeposit(item.employeeId, Math.max(0, Number(event.target.value)))} /></TableCell><TableCell>MID {number.format(item.mid)}<div className="text-xs text-muted-foreground">MIN {number.format(item.min)}</div></TableCell><TableCell>{resultBadge(item.resultType)}</TableCell><TableCell className="text-right">{canEdit ? <><Button size="sm" variant="outline" onClick={() => saveOne(item)} disabled={saving}><Save /> บันทึก</Button><Button size="icon" variant="ghost" className="text-rose-600" aria-label="ลบ" onClick={() => setDeleteTarget(item)}><Trash2 /></Button></> : "—"}</TableCell></TableRow>)}
          </TableBody></Table></div>
        </section>
      </TabsContent>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>ลบผลประเมินของพนักงาน?</AlertDialogTitle><AlertDialogDescription>ผล WINLOSS / ใบเหลือง / ใบแดงของ {deleteTarget?.nickname} ในเดือน {month} จะถูกลบออกจากข้อมูลเงินเดือนด้วย</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>ยกเลิก</AlertDialogCancel><AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={removeOne}>ลบรายการ</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

      <AlertDialog open={Boolean(deleteMonthTarget)} onOpenChange={(open) => !open && !saving && setDeleteMonthTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>ลบข้อมูลยอดฝากทั้งเดือน?</AlertDialogTitle>
          <AlertDialogDescription>ลบยอดฝากและผล WINLOSS / ใบเหลือง / ใบแดงของเดือน {deleteMonthTarget ? monthLabel(deleteMonthTarget.month) : ""} ทั้งหมด {number.format(deleteMonthTarget?.count ?? 0)} รายการ รวมพนักงานที่ลาออกแล้ว และใบเตือนที่สร้างจากยอดฝากในเดือนนี้ ข้อมูลดังกล่าวจะหายจากสรุปรายไตรมาสและข้อมูลที่ใช้คำนวณเงินเดือน การลบนี้กู้คืนผ่านระบบไม่ได้</AlertDialogDescription>
        </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>ยกเลิก</AlertDialogCancel>
          <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" disabled={saving} onClick={(event) => { event.preventDefault(); void removeMonth(); }}>{saving ? <Loader2 className="animate-spin" /> : <Trash2 />} ยืนยันลบทั้งเดือน</AlertDialogAction>
        </AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      <TabsContent value="quarter" className="space-y-5">
        <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 text-sm text-indigo-900">
          <p className="mb-2 font-medium">พนักงานแต่ละคนแสดงเฉพาะไตรมาสล่าสุดตามอายุงาน ณ เดือนประเมิน ({monthLabel(month)}) แม้ยังไม่บันทึกยอดฝาก</p>
          ไตรมาสนับตามอายุงาน: เดือนที่ 1–3 เป็นไตรมาส 1, เดือนที่ 4–6 เป็นไตรมาส 2 และเริ่มนับใบเหลือง/ใบแดงใหม่ทุกไตรมาส
          <p className="mt-2">MIN รวม = MIN ทั้ง 3 เดือนของไตรมาส · สีเขียว: ผ่าน/WINLOSS · สีเหลือง: ใบเหลือง · สีแดง: ใบแดง · —: ยังไม่บันทึก</p>
        </section>
        {!quarterGroups.length && <section className="panel py-12 text-center text-muted-foreground">ยังไม่มีข้อมูลรายไตรมาส</section>}
        {quarterGroups.map(([quarter, items]) => (
          <QuarterSection key={`${month}-${quarter}`} quarter={quarter} count={items.length}>
              <TableBody>{items.map((item) => <TableRow key={item.employeeId}>
                <TableCell><strong>{item.nickname}</strong><div className="text-xs text-muted-foreground">{item.employeeId} · {item.team}</div></TableCell>
                {item.months.map((detail) => <TableCell key={detail.tenureMonth} className="text-center">
                  <div className="mb-1 text-xs text-muted-foreground">{monthLabel(detail.resultMonth)}</div>
                  <span className={`inline-block min-w-16 rounded-md px-3 py-1 font-semibold ${depositColor(detail.resultType)}`}>
                    {detail.depositCount === null ? "—" : number.format(detail.depositCount)}
                  </span>
                  <div className="mt-1 text-xs text-muted-foreground">MIN {number.format(detail.min)}</div>
                  <div className="mt-1 text-xs">{detail.resultType === "winloss" ? "ผ่าน / WINLOSS" : detail.resultType === "yellow" ? "ใบเหลือง" : detail.resultType === "red" ? "ใบแดง" : "ยังไม่บันทึก"}</div>
                </TableCell>)}
                <TableCell className="text-right"><span className={`rounded-md px-3 py-1 font-semibold ${depositColor(item.recordedMonths < 3 ? null : item.depositTotal > item.minTotal ? "winloss" : "red")}`}>{number.format(item.depositTotal)}</span></TableCell>
                <TableCell className="text-right font-medium">{number.format(item.minTotal)}</TableCell>
                <TableCell>{item.yellowCount} / {item.redCount}</TableCell>
                <TableCell>{item.recordedMonths < 3 ? <Badge variant="outline">บันทึก {item.recordedMonths}/3 เดือน</Badge>
                  : item.depositTotal > item.minTotal ? <Badge className="bg-emerald-600">ผ่าน MIN รวม</Badge> : <Badge variant="destructive">ไม่ผ่าน MIN รวม</Badge>}</TableCell>
              </TableRow>)}</TableBody>
          </QuarterSection>
        ))}
      </TabsContent>

      <TabsContent value="config" className="space-y-5">
        <section className="rounded-xl border border-violet-200 bg-violet-50 p-5 text-sm text-violet-900">เกณฑ์คำนวณ: มากกว่า MID = WINLOSS, มากกว่า MIN แต่ไม่เกิน MID = ใบเหลือง, น้อยกว่าหรือเท่ากับ MIN = ใบแดง</section>
        <section className="panel overflow-hidden p-0"><div className="panel-heading px-6 pt-6"><div><p className="section-kicker">WARNING CONFIG</p><h2>เกณฑ์ตามอายุงาน</h2></div>{canEdit && <Button onClick={saveConfig} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />} บันทึก Config</Button>}</div><div className="mt-4 overflow-auto border-t"><Table><TableHeader><TableRow className="bg-slate-50"><TableHead>อายุงาน (เดือน)</TableHead><TableHead>MID</TableHead><TableHead>MIN</TableHead></TableRow></TableHeader><TableBody>
          {configs.map((item, index) => <TableRow key={item.tenureMonth}><TableCell className="font-medium">{item.tenureMonth}</TableCell><TableCell><Input type="number" min="0" value={item.mid} disabled={!canEdit} onChange={(event) => setConfigs((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, mid: Number(event.target.value) } : row))} /></TableCell><TableCell><Input type="number" min="0" value={item.min} disabled={!canEdit} onChange={(event) => setConfigs((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, min: Number(event.target.value) } : row))} /></TableCell></TableRow>)}
        </TableBody></Table></div></section>
      </TabsContent>
    </Tabs>
  );
}
