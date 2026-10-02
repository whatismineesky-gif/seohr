"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  History,
  Loader2,
  Save,
  Search,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableEmployeeSelect } from "@/components/searchable-employee-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ReviewStatus = "complete" | "incomplete" | "none";

type WorkAuditRow = {
  id: string;
  nickname: string;
  team: string;
  position: string;
  reviewId: number | null;
  reviewed: boolean;
  targetCount: number;
  targetPending: boolean;
  submittedCount: number;
  missingCount: number;
  resultStatus: ReviewStatus;
  reason: string;
  reviewedBy: string;
  updatedAt: string;
};

type WorkAuditData = {
  reviewDate: string;
  canReview: boolean;
  canConfigure: boolean;
  config: null | {
    month: string;
    targetPerDay: number;
    updatedBy: string;
    updatedAt: string;
  };
  configs: Array<{
    month: string;
    targetPerDay: number;
    updatedBy: string;
    updatedAt: string;
  }>;
  summary: {
    total: number;
    complete: number;
    incomplete: number;
    none: number;
    unreviewed: number;
  };
  dayConfirmed: boolean;
  targetEmployees: Array<{ id: string; nickname: string; team: string }>;
  employeeTargetConfigs: Array<{
    employeeId: string; nickname: string; team: string; effectiveDate: string;
    targetPerDay: number | null; updatedBy: string; updatedAt: string;
  }>;
  employeeTargetHistory: Array<{
    id: number; employeeId: string; nickname: string; effectiveDate: string;
    previousTarget: number | null; newTarget: number | null; actorName: string; createdAt: string;
  }>;
  rows: WorkAuditRow[];
  history: Array<{
    id: number;
    reviewId: number;
    employeeId: string;
    nickname: string;
    team: string;
    previousStatus: ReviewStatus | null;
    previousSubmittedCount: number | null;
    previousTargetCount: number | null;
    newTargetCount: number | null;
    previousReason: string;
    newStatus: ReviewStatus;
    newSubmittedCount: number;
    newReason: string;
    changeReason: string;
    actorName: string;
    createdAt: string;
  }>;
};

type DraftRow = {
  submittedCount: number;
  reason: string;
  changeReason: string;
};

function bangkokDateValue() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function resultFor(submitted: number, target: number): ReviewStatus {
  if (submitted <= 0) return "none";
  if (submitted < target) return "incomplete";
  return "complete";
}

function reasonFor(status: ReviewStatus, target: number, submitted: number) {
  if (status === "none") return "ไม่ส่งงาน";
  if (status === "incomplete")
    return `ส่งงานไม่ครบ — เว็บไม่เสร็จ ${Math.max(0, target - submitted)} เว็บ`;
  return "";
}

function statusBadge(status: ReviewStatus) {
  if (status === "complete")
    return <Badge className="bg-emerald-600">ส่งครบ</Badge>;
  if (status === "none") return <Badge variant="destructive">ไม่ส่งงาน</Badge>;
  return <Badge className="bg-amber-500 text-amber-950">ส่งไม่ครบ</Badge>;
}

function formatDateTime(value: string) {
  if (!value) return "—";
  return new Date(
    value.includes("T") ? value : `${value.replace(" ", "T")}Z`,
  ).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function WorkAuditPanel({ mode }: { mode: "review" | "config" }) {
  const [reviewDate, setReviewDate] = useState(() => bangkokDateValue());
  const [data, setData] = useState<WorkAuditData | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("all");
  const [resultStatus, setResultStatus] = useState<ReviewStatus | "all">("all");
  const [configMonth, setConfigMonth] = useState(() =>
    bangkokDateValue().slice(0, 7),
  );
  const [configTarget, setConfigTarget] = useState(1);
  const [targetEmployeeId, setTargetEmployeeId] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(() => bangkokDateValue());
  const [employeeTarget, setEmployeeTarget] = useState(1);
  const [useSharedTarget, setUseSharedTarget] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/work-audit?date=${reviewDate}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as WorkAuditData & { error?: string };
      if (!response.ok) throw new Error(result.error || "โหลดข้อมูลไม่สำเร็จ");
      setData(result);
      setDrafts(
        Object.fromEntries(
          result.rows.map((row) => [
            row.id,
            {
              submittedCount: row.submittedCount,
              reason: row.reason,
              changeReason: "",
            },
          ]),
        ),
      );
      if (result.config) {
        setConfigMonth(result.config.month);
        setConfigTarget(result.config.targetPerDay);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "โหลดข้อมูลตรวจส่งงานไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  }, [reviewDate]);

  useEffect(() => {
    const task = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(task);
  }, [loadData]);

  useEffect(() => {
    if (mode !== "review") return;
    const refreshTargets = () => void loadData();
    window.addEventListener("work-audit-targets-updated", refreshTargets);
    return () => window.removeEventListener("work-audit-targets-updated", refreshTargets);
  }, [loadData, mode]);

  const teams = useMemo(
    () =>
      Array.from(new Set((data?.rows ?? []).map((row) => row.team))).sort(
        (left, right) => left.localeCompare(right, "th", { numeric: true }),
      ),
    [data?.rows],
  );
  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (data?.rows ?? []).filter(
      (row) =>
        (team === "all" || row.team === team) &&
        (resultStatus === "all" ||
          resultFor(
            drafts[row.id]?.submittedCount ?? row.targetCount,
            row.targetCount,
          ) === resultStatus) &&
        (!keyword ||
          `${row.id} ${row.nickname} ${row.team}`.toLowerCase().includes(keyword)),
    );
  }, [data?.rows, drafts, search, team, resultStatus]);

  function setSubmitted(row: WorkAuditRow, value: number) {
    const submittedCount = Math.max(0, Math.round(Number(value) || 0));
    const status = resultFor(submittedCount, row.targetCount);
    setDrafts((current) => ({
      ...current,
      [row.id]: {
        ...(current[row.id] ?? { changeReason: "" }),
        submittedCount,
        reason: reasonFor(status, row.targetCount, submittedCount),
      },
    }));
  }

  function isChanged(row: WorkAuditRow) {
    const draft = drafts[row.id];
    if (!draft) return false;
    const status = resultFor(draft.submittedCount, row.targetCount);
    const reason = status === "complete" ? "" : draft.reason.trim();
    return (
      row.targetPending ||
      row.submittedCount !== draft.submittedCount ||
      row.resultStatus !== status ||
      row.reason !== reason
    );
  }

  async function confirmDay() {
    if (!data?.config) return toast.error("กรุณาตั้งค่าเป้าหมายของเดือนนี้ก่อน");
    const missingChangeReason = data.rows.find(
      (row) =>
        row.reviewed && isChanged(row) &&
        !(row.targetPending && drafts[row.id]?.submittedCount === row.submittedCount && drafts[row.id]?.reason === row.reason) &&
        !drafts[row.id]?.changeReason.trim(),
    );
    if (missingChangeReason)
      return toast.error(`กรุณาระบุเหตุผลการแก้ไขของ ${missingChangeReason.nickname}`);
    setSaving(true);
    try {
      const response = await fetch("/api/work-audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "confirm_day",
          reviewDate,
          rows: data.rows.map((row) => ({
            employeeId: row.id,
            submittedCount: drafts[row.id]?.submittedCount ?? row.targetCount,
            reason: drafts[row.id]?.reason ?? "",
            changeReason: drafts[row.id]?.changeReason ?? "",
          })),
        }),
      });
      const result = (await response.json()) as { changed?: number; error?: string };
      if (!response.ok) throw new Error(result.error || "บันทึกไม่สำเร็จ");
      toast.success("ยืนยันผลตรวจส่งงานเรียบร้อยแล้ว", {
        description: `บันทึกหรือแก้ไข ${result.changed ?? 0} รายการ`,
      });
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function saveConfig() {
    setSaving(true);
    try {
      const response = await fetch("/api/work-audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save_config",
          month: configMonth,
          targetPerDay: configTarget,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "บันทึก Config ไม่สำเร็จ");
      toast.success("บันทึกเป้าหมายส่งงานรายวันแล้ว");
      setReviewDate(`${configMonth}-01`);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function saveEmployeeTarget() {
    if (!targetEmployeeId) return toast.error("กรุณาเลือกพนักงาน");
    if (!effectiveDate) return toast.error("กรุณาระบุวันที่เริ่มใช้");
    if (!useSharedTarget && (!Number.isSafeInteger(employeeTarget) || employeeTarget < 1))
      return toast.error("เป้าหมายเฉพาะต้องเป็นจำนวนเต็มอย่างน้อย 1 เว็บ");
    setSaving(true);
    try {
      const response = await fetch("/api/work-audit", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save_employee_target", employeeId: targetEmployeeId,
          effectiveDate, targetPerDay: useSharedTarget ? null : employeeTarget }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "บันทึกเป้าหมายเฉพาะไม่สำเร็จ");
      toast.success(useSharedTarget ? "ตั้งให้กลับไปใช้ค่ากลางแล้ว" : "บันทึกเป้าหมายเฉพาะแล้ว");
      window.dispatchEvent(new Event("work-audit-targets-updated"));
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  }

  if (loading && !data) {
    return (
      <div className="grid min-h-64 place-items-center rounded-2xl border bg-white">
        <Loader2 className="animate-spin text-indigo-600" />
      </div>
    );
  }
  if (!data) return null;

  if (mode === "config") {
    return (
      <div className="space-y-5">
        <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
          <div className="flex gap-3">
            <Settings2 className="mt-0.5 size-5 text-violet-700" />
            <div>
              <h2 className="font-semibold text-violet-950">
                Config เป้าหมายส่งงานรายวัน
              </h2>
              <p className="mt-1 text-sm text-violet-800">
                กำหนดค่ากลางต่อเดือน แล้วตั้งเฉพาะพนักงานที่ส่งต่างจากค่ากลาง คนที่ไม่ได้กำหนดใช้ค่ากลางอัตโนมัติ
              </p>
            </div>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-[220px_220px_auto] sm:items-end">
            <label className="field-label">
              เดือน
              <Input
                type="month"
                value={configMonth}
                onChange={(event) => {
                  const month = event.target.value;
                  setConfigMonth(month);
                  const existing = data.configs.find((item) => item.month === month);
                  setConfigTarget(existing?.targetPerDay ?? 1);
                }}
              />
            </label>
            <label className="field-label">
              เป้าหมายกลางต่อวัน
              <Input
                type="number"
                min={1}
                value={configTarget}
                onChange={(event) => setConfigTarget(Number(event.target.value))}
              />
            </label>
            <Button onClick={() => void saveConfig()} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              บันทึก Config
            </Button>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">เป้าหมายเฉพาะพนักงาน</h3>
          <p className="mt-1 text-sm text-slate-500">เพิ่มเฉพาะคนที่ต่างจากค่ากลาง มีผลตั้งแต่วันที่เลือกจนกว่าจะเปลี่ยนค่า ระบบปรับผลตรวจที่บันทึกแล้วและรายการหักที่เกี่ยวข้อง โดยคงจำนวนเว็บที่ส่งจริงและเก็บประวัติ</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="field-label">
              พนักงาน
              <SearchableEmployeeSelect employees={data.targetEmployees ?? []} value={targetEmployeeId} onChange={setTargetEmployeeId} disabled={saving} />
            </div>
            <label className="field-label">
              วันที่เริ่มใช้
              <Input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} disabled={saving} />
            </label>
            <label className="field-label">
              รูปแบบเป้าหมาย
              <select className="native-select w-full" value={useSharedTarget ? "shared" : "custom"} onChange={(event) => setUseSharedTarget(event.target.value === "shared")} disabled={saving}>
                <option value="custom">กำหนดเฉพาะคน</option>
                <option value="shared">กลับไปใช้ค่ากลาง</option>
              </select>
            </label>
            <label className="field-label">
              เป้าหมายเฉพาะ (เว็บ/วัน)
              <Input type="number" min={1} step={1} value={employeeTarget} onChange={(event) => setEmployeeTarget(Number(event.target.value))} disabled={saving || useSharedTarget} />
            </label>
          </div>
          <Button className="mt-4" onClick={() => void saveEmployeeTarget()} disabled={saving || !targetEmployeeId}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} บันทึกเป้าหมายพนักงาน
          </Button>
          <div className="mt-5 overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader><TableRow><TableHead>พนักงาน</TableHead><TableHead>เริ่มใช้</TableHead><TableHead>เป้าหมาย</TableHead><TableHead>แก้ไขโดย</TableHead><TableHead>วันเวลา</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {(data.employeeTargetConfigs ?? []).map((item) => (
                  <TableRow key={`${item.employeeId}-${item.effectiveDate}`}>
                    <TableCell><strong>{item.nickname}</strong><span className="block text-xs text-slate-500">{item.employeeId} · {item.team}</span></TableCell>
                    <TableCell>{item.effectiveDate}</TableCell>
                    <TableCell>{item.targetPerDay === null ? "ใช้ค่ากลาง" : `${item.targetPerDay} เว็บ/วัน`}</TableCell>
                    <TableCell>{item.updatedBy}</TableCell><TableCell>{formatDateTime(item.updatedAt)}</TableCell>
                    <TableCell><Button variant="outline" size="sm" disabled={saving} onClick={() => {
                      setTargetEmployeeId(item.employeeId); setEffectiveDate(item.effectiveDate);
                      setUseSharedTarget(item.targetPerDay === null); setEmployeeTarget(item.targetPerDay ?? 1);
                    }}>แก้ไข</Button></TableCell>
                  </TableRow>
                ))}
                {!data.employeeTargetConfigs?.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-slate-500">ยังไม่มีเป้าหมายเฉพาะ พนักงานทุกคนใช้ค่ากลาง</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium">ประวัติการเปลี่ยนเป้าหมายเฉพาะ</summary>
            <div className="mt-3 overflow-x-auto"><Table>
              <TableHeader><TableRow><TableHead>พนักงาน</TableHead><TableHead>เริ่มใช้</TableHead><TableHead>ค่าเดิม → ค่าใหม่</TableHead><TableHead>ผู้แก้ไข</TableHead><TableHead>วันเวลา</TableHead></TableRow></TableHeader>
              <TableBody>
                {(data.employeeTargetHistory ?? []).map((item) => <TableRow key={item.id}>
                  <TableCell>{item.employeeId} · {item.nickname}</TableCell><TableCell>{item.effectiveDate}</TableCell>
                  <TableCell>{item.previousTarget === null ? "ค่ากลาง" : `${item.previousTarget} เว็บ`} → {item.newTarget === null ? "ค่ากลาง" : `${item.newTarget} เว็บ`}</TableCell>
                  <TableCell>{item.actorName}</TableCell><TableCell>{formatDateTime(item.createdAt)}</TableCell>
                </TableRow>)}
                {!data.employeeTargetHistory?.length && <TableRow><TableCell colSpan={5} className="py-6 text-center text-slate-500">ยังไม่มีประวัติ</TableCell></TableRow>}
              </TableBody>
            </Table></div>
          </details>
        </section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>เดือน</TableHead>
                <TableHead>เป้าหมายต่อวัน</TableHead>
                <TableHead>แก้ไขล่าสุดโดย</TableHead>
                <TableHead>วันเวลา</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.configs.map((config) => (
                <TableRow
                  key={config.month}
                  className="cursor-pointer"
                  onClick={() => {
                    setConfigMonth(config.month);
                    setConfigTarget(config.targetPerDay);
                  }}
                >
                  <TableCell className="font-medium">{config.month}</TableCell>
                  <TableCell>{config.targetPerDay} เว็บ</TableCell>
                  <TableCell>{config.updatedBy || "—"}</TableCell>
                  <TableCell>{formatDateTime(config.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </div>
    );
  }

  return (
    <Tabs defaultValue="review" className="space-y-5">
      <TabsList>
        <TabsTrigger value="review"><ClipboardCheck /> ตรวจงาน</TabsTrigger>
        <TabsTrigger value="history"><History /> ประวัติการแก้ไข</TabsTrigger>
      </TabsList>
      <TabsContent value="review" className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">DAILY WORK AUDIT</p>
              <h2 className="mt-1 text-xl font-semibold">ตรวจการส่งงานรายวัน</h2>
              <p className="mt-1 text-sm text-slate-500">
                ระบบตั้งค่าเริ่มต้นเป็นส่งครบ แก้ไขเฉพาะพนักงานที่ส่งไม่ครบหรือไม่ส่งงาน
              </p>
            </div>
            <label className="field-label w-full sm:w-52">
              วันที่ตรวจ
              <Input
                type="date"
                value={reviewDate}
                onChange={(event) => setReviewDate(event.target.value)}
              />
            </label>
          </div>
          {!data.config ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <AlertTriangle className="mr-2 inline size-4" />
              ยังไม่ได้ตั้งค่าเป้าหมายส่งงานของเดือน {reviewDate.slice(0, 7)}
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge variant="outline">เป้าหมาย {data.config.targetPerDay} เว็บ/วัน</Badge>
              <Badge className="bg-emerald-600">ส่งครบ {data.summary.complete}</Badge>
              <Badge className="bg-amber-500 text-amber-950">ไม่ครบ {data.summary.incomplete}</Badge>
              <Badge variant="destructive">ไม่ส่ง {data.summary.none}</Badge>
              <Badge variant="outline">รอยืนยัน {data.summary.unreviewed}</Badge>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
            <label className="relative min-w-64 flex-1">
              <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ค้นหารหัส ชื่อ หรือทีม"
              />
            </label>
            <select
              className="native-select w-full sm:w-44"
              aria-label="กรองทีม"
              value={team}
              onChange={(event) => setTeam(event.target.value)}
            >
              <option value="all">ทุกทีม</option>
              {teams.map((teamName) => <option key={teamName}>{teamName}</option>)}
            </select>
            <select
              className="native-select w-full sm:w-44"
              aria-label="กรองผลตรวจ"
              value={resultStatus}
              onChange={(event) =>
                setResultStatus(event.target.value as ReviewStatus | "all")
              }
            >
              <option value="all">ผลตรวจทั้งหมด</option>
              <option value="complete">ส่งครบ</option>
              <option value="incomplete">ส่งไม่ครบ</option>
              <option value="none">ไม่ส่งงาน</option>
            </select>
          </div>
          <div className="max-h-[62vh] overflow-auto">
            {data.rows.some((row) => row.targetPending) && (
              <p className="border-b border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                เป้าหมายเฉพาะเปลี่ยนจากผลตรวจเดิม กดยืนยันผลตรวจทั้งวันเพื่อบันทึกผลใหม่และปรับรายการหักที่เกี่ยวข้อง
              </p>
            )}
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50">
                <TableRow>
                  <TableHead>พนักงาน</TableHead>
                  <TableHead className="text-center">เป้าหมาย</TableHead>
                  <TableHead className="min-w-36">ส่งจริง</TableHead>
                  <TableHead>ผลตรวจ</TableHead>
                  <TableHead className="min-w-64">เหตุผล</TableHead>
                  <TableHead className="min-w-56">เหตุผลการแก้ไข</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => {
                  const draft = drafts[row.id] ?? {
                    submittedCount: row.targetCount,
                    reason: "",
                    changeReason: "",
                  };
                  const status = resultFor(draft.submittedCount, row.targetCount);
                  const changed = isChanged(row);
                  return (
                    <TableRow key={row.id} className={changed ? "bg-amber-50/60" : ""}>
                      <TableCell>
                        <strong className="block">{row.nickname}</strong>
                        <span className="text-xs text-slate-500">
                          {row.id} · {row.team} · {row.position}
                        </span>
                        {row.reviewed && (
                          <span className="mt-1 block text-[11px] text-slate-400">
                            ตรวจแล้วโดย {row.reviewedBy || "—"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-semibold">
                        {row.targetCount}
                        {row.targetPending && <span className="block text-xs font-normal text-amber-700">รอยืนยันเป้าหมายใหม่</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button type="button" size="sm" variant="outline" onClick={() => setSubmitted(row, row.targetCount)}>
                            ครบ
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => setSubmitted(row, 0)}>
                            0
                          </Button>
                          <Input
                            className="w-20"
                            type="number"
                            min={0}
                            value={draft.submittedCount}
                            onChange={(event) => setSubmitted(row, Number(event.target.value))}
                          />
                        </div>
                      </TableCell>
                      <TableCell>{statusBadge(status)}</TableCell>
                      <TableCell>
                        {status === "complete" ? (
                          <span className="text-sm text-emerald-700">ส่งครบตามเป้าหมาย</span>
                        ) : (
                          <Input
                            value={draft.reason}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [row.id]: { ...draft, reason: event.target.value },
                              }))
                            }
                            placeholder="ระบุเหตุผล"
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {row.reviewed && changed ? (
                          <Input
                            value={draft.changeReason}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [row.id]: { ...draft, changeReason: event.target.value },
                              }))
                            }
                            placeholder="จำเป็นต้องระบุ"
                          />
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!filteredRows.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-slate-500">
                      ไม่พบพนักงานตามเงื่อนไขที่เลือก
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4">
            <p className="text-sm text-slate-500">
              แสดง {filteredRows.length} จาก {data.rows.length} คน
            </p>
            <Button
              onClick={() => void confirmDay()}
              disabled={saving || !data.config || !data.rows.length}
            >
              {saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              ยืนยันผลตรวจทั้งวัน
            </Button>
          </div>
        </section>
      </TabsContent>

      <TabsContent value="history">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b p-5">
            <h2 className="font-semibold">ประวัติการตรวจและแก้ไข {reviewDate}</h2>
            <p className="mt-1 text-sm text-slate-500">
              เก็บสถานะเดิม สถานะใหม่ เหตุผล ผู้ดำเนินการ และวันเวลา
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>พนักงาน</TableHead>
                <TableHead>เปลี่ยนแปลง</TableHead>
                <TableHead>เหตุผลผลตรวจ</TableHead>
                <TableHead>เหตุผลการแก้ไข</TableHead>
                <TableHead>ผู้ดำเนินการ</TableHead>
                <TableHead>วันเวลา</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.history.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <strong>{item.nickname}</strong>
                    <span className="block text-xs text-slate-500">{item.employeeId} · {item.team}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-500">
                      {item.previousStatus ? `${item.previousSubmittedCount ?? 0} เว็บ` : "ตรวจครั้งแรก"}
                    </span>
                    <span className="block font-medium">→ {item.newSubmittedCount} เว็บ</span>
                    {item.newTargetCount !== null && <span className="block text-xs text-slate-500">เป้าหมาย {item.previousTargetCount ?? "—"} → {item.newTargetCount} เว็บ</span>}
                  </TableCell>
                  <TableCell>{item.newReason || "ส่งครบ"}</TableCell>
                  <TableCell>{item.changeReason || "—"}</TableCell>
                  <TableCell>{item.actorName}</TableCell>
                  <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                </TableRow>
              ))}
              {!data.history.length && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-slate-500">ยังไม่มีประวัติในวันที่เลือก</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      </TabsContent>
    </Tabs>
  );
}

export function WorkAuditOverview({
  canOpenAttendance,
  onOpenAttendance,
}: {
  canOpenAttendance: boolean;
  onOpenAttendance: () => void;
}) {
  const [date, setDate] = useState(() => bangkokDateValue());
  const [data, setData] = useState<WorkAuditData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const task = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/work-audit?date=${date}&mode=summary`, { cache: "no-store" })
        .then(async (response) => {
          const result = (await response.json()) as WorkAuditData & { error?: string };
          if (!response.ok) throw new Error(result.error || "โหลดข้อมูลไม่สำเร็จ");
          if (active) setData(result);
        })
        .catch((error) =>
          toast.error(error instanceof Error ? error.message : "โหลดผลตรวจงานไม่สำเร็จ"),
        )
        .finally(() => active && setLoading(false));
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(task);
    };
  }, [date]);

  return (
    <section className="panel">
      <div className="panel-heading flex-wrap gap-4">
        <div>
          <p className="section-kicker">DAILY WORK EXCEPTIONS</p>
          <h2>พนักงานที่ส่งงานไม่ครบ</h2>
          <p className="mt-1 text-sm text-slate-500">แสดงผู้ส่งไม่ครบหรือไม่ส่งงาน พร้อมเหตุผล</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="field-label">
            เลือกวันที่
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          {canOpenAttendance && (
            <Button variant="outline" onClick={onOpenAttendance}>
              <ClipboardCheck /> ไปหน้าตรวจงาน
            </Button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="grid min-h-32 place-items-center"><Loader2 className="animate-spin text-indigo-600" /></div>
      ) : !data?.config ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          ยังไม่ได้ตั้งค่าเป้าหมายส่งงานของเดือนนี้
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge className="bg-emerald-600">ส่งครบ {data.summary.complete}</Badge>
            <Badge className="bg-amber-500 text-amber-950">ไม่ครบ {data.summary.incomplete}</Badge>
            <Badge variant="destructive">ไม่ส่ง {data.summary.none}</Badge>
            <Badge variant="outline">รอตรวจ {data.summary.unreviewed}</Badge>
          </div>
          {!data.dayConfirmed && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Audit ยังยืนยันผลตรวจของวันที่เลือกไม่ครบ
            </div>
          )}
          {data.rows.length ? (
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader><TableRow><TableHead>พนักงาน</TableHead><TableHead>ทีม</TableHead><TableHead>เป้าหมาย</TableHead><TableHead>ส่งจริง</TableHead><TableHead>ขาด</TableHead><TableHead>สถานะ</TableHead><TableHead>เหตุผล</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell><strong>{row.nickname}</strong><span className="block text-xs text-slate-500">{row.id}</span></TableCell>
                      <TableCell>{row.team}</TableCell>
                      <TableCell>{row.targetCount}</TableCell>
                      <TableCell>{row.submittedCount}</TableCell>
                      <TableCell>{row.missingCount}</TableCell>
                      <TableCell>{statusBadge(row.resultStatus)}</TableCell>
                      <TableCell>{row.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : data.dayConfirmed ? (
            <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-8 text-center text-sm text-emerald-700">
              พนักงานทุกคนส่งงานครบตามเป้าหมาย
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
