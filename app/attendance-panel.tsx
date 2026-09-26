"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  Clock3,
  History,
  Loader2,
  Pencil,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { SearchableEmployeeSelect } from "@/components/searchable-employee-select";

type Role = "employee" | "hr" | "audit";
type EventType = "absence" | "meeting_leave" | "late";
type ActionType = "lose_bonus" | "deduct_money" | "force_leave" | "limit";

type AttendanceData = {
  currentUser: {
    userId: string;
    email: string;
    displayName: string;
    role: Role;
    employeeId: string | null;
  };
  month: string;
  selectedEmployeeId: string | null;
  employees: Array<{
    id: string;
    nickname: string;
    team: string;
    email: string;
    status: string;
    endDate: string;
  }>;
  records: Array<{
    id: number;
    employeeId: string;
    nickname: string;
    team: string;
    recordDate: string;
    recordType: EventType;
    reason: string;
    recorderEmail: string;
    recorderRole: Role;
  }>;
  auditLogs: Array<{
    id: number;
    attendanceRecordId: number;
    employeeId: string;
    employeeNickname: string;
    action: "edit" | "delete";
    previousRecordDate: string;
    previousRecordType: EventType;
    previousReason: string;
    newRecordDate: string | null;
    newRecordType: EventType | null;
    newReason: string | null;
    actorEmail: string;
    actorDisplayName: string;
    actorRole: Role;
    createdAt: string;
  }>;
  rules: Rule[];
  summary: {
    plannedWorkingDays: number;
    workingDays: number;
    absence: number;
    meetingLeave: number;
    late: number;
    absenceRemaining: number;
    meetingLeaveRemaining: number;
    lateRemainingBeforeForceLeave: number;
    forcedLeaveDays: number;
    bonusLoss: number;
    attendanceBonus: number;
    absenceDeduction: number;
    totalDeduction: number;
  };
  users: Array<{
    email: string;
    display_name: string;
    role: Role;
    employee_id: string | null;
    nickname: string | null;
  }>;
};

type Rule = {
  id: number;
  code: string;
  name: string;
  eventType: EventType;
  triggerFrom: number;
  actionType: ActionType;
  actionValue: number;
  period: string;
  active: boolean;
  builtIn: boolean;
};

const eventLabels: Record<EventType, string> = {
  absence: "หยุดงาน",
  meeting_leave: "ลาประชุม",
  late: "มาสาย",
};

const actionLabels: Record<ActionType, string> = {
  lose_bonus: "ไม่ได้รับเบี้ยขยัน (บาท)",
  deduct_money: "หักเงินต่อครั้ง (บาท)",
  force_leave: "บังคับหยุดต่อครั้ง (วัน)",
  limit: "จำนวนครั้งสูงสุดต่อเดือน",
};

const roleLabels: Record<Role, string> = {
  employee: "พนักงาน",
  hr: "HR",
  audit: "Audit",
};
const money = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});

function formatAuditDateTime(value: string) {
  const parsed = new Date(
    value.includes("T") ? value : `${value.replace(" ", "T")}Z`,
  );
  return parsed.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatCard({
  label,
  value,
  note,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Clock3;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            {value}
          </p>
          <p className="mt-2 text-xs text-slate-500">{note}</p>
        </div>
        <span className={`grid size-10 place-items-center rounded-xl ${tone}`}>
          <Icon className="size-5" />
        </span>
      </div>
    </div>
  );
}

function RuleEditor({ rule, onSaved }: { rule: Rule; onSaved: () => void }) {
  const [draft, setDraft] = useState(rule);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save_rule", ...draft }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "บันทึกเงื่อนไขไม่สำเร็จ");
      toast.success("บันทึกเงื่อนไขแล้ว");
      onSaved();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "บันทึกเงื่อนไขไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {rule.builtIn ? "เงื่อนไขหลัก" : "เงื่อนไขเพิ่มเติม"}
            </Badge>
            <code className="text-xs text-slate-400">{rule.code}</code>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          เปิดใช้งาน
          <Switch
            checked={draft.active}
            onCheckedChange={(active) => setDraft({ ...draft, active })}
          />
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr_1fr_120px_130px_auto] lg:items-end">
        <label className="field-label">
          ชื่อเงื่อนไข
          <Input
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
        </label>
        <label className="field-label">
          เหตุการณ์
          <select
            className="native-select"
            value={draft.eventType}
            onChange={(event) =>
              setDraft({ ...draft, eventType: event.target.value as EventType })
            }
          >
            {Object.entries(eventLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          ผลลัพธ์
          <select
            className="native-select"
            value={draft.actionType}
            onChange={(event) =>
              setDraft({
                ...draft,
                actionType: event.target.value as ActionType,
              })
            }
          >
            {Object.entries(actionLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          เริ่มครั้งที่
          <Input
            type="number"
            min={1}
            value={draft.triggerFrom}
            onChange={(event) =>
              setDraft({ ...draft, triggerFrom: Number(event.target.value) })
            }
          />
        </label>
        <label className="field-label">
          ค่าเงื่อนไข
          <Input
            type="number"
            min={0}
            value={draft.actionValue}
            onChange={(event) =>
              setDraft({ ...draft, actionValue: Number(event.target.value) })
            }
          />
        </label>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}บันทึก
        </Button>
      </div>
    </div>
  );
}

export function AttendancePanel() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);
  const [data, setData] = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recordDate, setRecordDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [recordType, setRecordType] = useState<EventType>("absence");
  const [reason, setReason] = useState("");
  const [newRule, setNewRule] = useState({
    name: "",
    eventType: "absence" as EventType,
    actionType: "deduct_money" as ActionType,
    triggerFrom: 1,
    actionValue: 0,
  });
  const [userForm, setUserForm] = useState({
    email: "",
    role: "employee" as Role,
    employeeId: "",
  });
  const [editingRecord, setEditingRecord] = useState<
    AttendanceData["records"][number] | null
  >(null);
  const [deleteRecord, setDeleteRecord] = useState<
    AttendanceData["records"][number] | null
  >(null);

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ month });
      if (selectedEmployeeId) params.set("employeeId", selectedEmployeeId);
      const response = await fetch(`/api/attendance?${params}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as AttendanceData & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "โหลดข้อมูลลงเวลาไม่สำเร็จ");
      setData(result);
      if (!selectedEmployeeId && result.selectedEmployeeId)
        setSelectedEmployeeId(result.selectedEmployeeId);
      if (
        result.currentUser.role === "employee" &&
        result.currentUser.employeeId
      )
        setSelectedEmployeeId(result.currentUser.employeeId);
    } catch (error) {
      toast.error("โหลดข้อมูลลงเวลาไม่สำเร็จ", {
        description: error instanceof Error ? error.message : "กรุณาลองใหม่",
      });
    } finally {
      setLoading(false);
    }
  }, [month, selectedEmployeeId]);

  useEffect(() => {
    const task = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(task);
  }, [loadData]);

  const allowedTypes = useMemo<EventType[]>(() => {
    if (data?.currentUser.role === "employee")
      return ["absence", "meeting_leave"];
    if (data?.currentUser.role === "audit") return ["absence"];
    return ["late", "absence", "meeting_leave"];
  }, [data?.currentUser.role]);

  const effectiveRecordType = allowedTypes.includes(recordType)
    ? recordType
    : allowedTypes[0];

  async function post(body: Record<string, unknown>, success: string) {
    setSaving(true);
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "บันทึกไม่สำเร็จ");
      toast.success(success);
      await loadData();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submitRecord(event: FormEvent) {
    event.preventDefault();
    const employeeId =
      data?.currentUser.role === "employee"
        ? data.currentUser.employeeId
        : selectedEmployeeId;
    const ok = await post(
      {
        action: "record",
        employeeId,
        recordDate,
        recordType: effectiveRecordType,
        reason,
      },
      "บันทึกเวลางานเรียบร้อยแล้ว",
    );
    if (ok) setReason("");
  }

  async function saveRecordEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingRecord) return;
    setSaving(true);
    try {
      const response = await fetch("/api/attendance", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editingRecord),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "แก้ไขรายการไม่สำเร็จ");
      setEditingRecord(null);
      await loadData();
      toast.success("แก้ไขประวัติการลงเวลาแล้ว");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "แก้ไขรายการไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeRecord() {
    if (!deleteRecord) return;
    setSaving(true);
    try {
      const response = await fetch("/api/attendance", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: deleteRecord.id }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "ลบรายการไม่สำเร็จ");
      setDeleteRecord(null);
      await loadData();
      toast.success("ลบประวัติการลงเวลาแล้ว");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ลบรายการไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function submitNewRule(event: FormEvent) {
    event.preventDefault();
    const ok = await post(
      { action: "save_rule", ...newRule, active: true },
      "เพิ่มเงื่อนไขใหม่แล้ว",
    );
    if (ok)
      setNewRule({
        name: "",
        eventType: "absence",
        actionType: "deduct_money",
        triggerFrom: 1,
        actionValue: 0,
      });
  }

  async function submitUser(event: FormEvent) {
    event.preventDefault();
    const ok = await post(
      { action: "save_user", ...userForm },
      "บันทึกสิทธิ์ผู้ใช้แล้ว",
    );
    if (ok) setUserForm({ email: "", role: "employee", employeeId: "" });
  }

  if (loading && !data) {
    return (
      <div className="grid min-h-64 place-items-center rounded-2xl border border-slate-200 bg-white">
        <Loader2 className="size-8 animate-spin text-violet-600" />
      </div>
    );
  }
  if (!data) return null;

  const selectedEmployee = data.employees.find(
    (employee) => employee.id === selectedEmployeeId,
  );
  const visibleRecords = data.records.filter(
    (record) => record.employeeId === selectedEmployeeId,
  );
  const visibleAuditLogs = data.auditLogs.filter(
    (log) => log.employeeId === selectedEmployeeId,
  );
  const [calendarYear, calendarMonth] = month.split("-").map(Number);
  const daysInMonth = new Date(
    Date.UTC(calendarYear, calendarMonth, 0),
  ).getUTCDate();
  const canRecord =
    data.currentUser.role !== "employee" ||
    Boolean(data.currentUser.employeeId);

  return (
    <Tabs defaultValue="attendance" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="attendance">
            <CalendarCheck2 /> ลงเวลาและสรุป
          </TabsTrigger>
          <TabsTrigger value="daily">
            <CalendarDays /> สรุปรายเดือน
          </TabsTrigger>
          {data.currentUser.role === "hr" && (
            <TabsTrigger value="rules">
              <Settings2 /> ตั้งค่าเงื่อนไข
            </TabsTrigger>
          )}
          {data.currentUser.role === "hr" && (
            <TabsTrigger value="users">
              <UserCog /> สิทธิ์ผู้ใช้
            </TabsTrigger>
          )}
        </TabsList>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-violet-200 bg-violet-50 text-violet-700"
          >
            <ShieldCheck /> {roleLabels[data.currentUser.role]}
          </Badge>
          <Input
            className="w-40"
            type="month"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
              setRecordDate(`${event.target.value}-01`);
            }}
          />
        </div>
      </div>

      <TabsContent value="attendance" className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">
                สรุปประจำเดือน
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">
                {selectedEmployee
                  ? `${selectedEmployee.nickname} · ${selectedEmployee.team}`
                  : "ยังไม่ได้เชื่อมบัญชีกับพนักงาน"}
              </h2>
            </div>
            {data.currentUser.role !== "employee" && (
              <label className="field-label min-w-64">
                เลือกพนักงาน
                <Popover
                  open={employeePickerOpen}
                  onOpenChange={setEmployeePickerOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={employeePickerOpen}
                      className="h-10 w-full justify-between bg-white font-normal"
                    >
                      {selectedEmployee
                        ? `${selectedEmployee.id} · ${selectedEmployee.nickname} (${selectedEmployee.team})`
                        : "ค้นหาหรือเลือกพนักงาน"}
                      <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[var(--radix-popover-trigger-width)] p-0"
                    align="start"
                  >
                    <Command>
                      <CommandInput placeholder="ค้นหารหัส ชื่อ หรือทีม..." />
                      <CommandList>
                        <CommandEmpty>ไม่พบพนักงาน</CommandEmpty>
                        <CommandGroup>
                          {data.employees.map((employee) => (
                            <CommandItem
                              key={employee.id}
                              value={`${employee.id} ${employee.nickname} ${employee.team}`}
                              onSelect={() => {
                                setSelectedEmployeeId(employee.id);
                                setEmployeePickerOpen(false);
                              }}
                            >
                              <Check
                                className={`size-4 ${selectedEmployeeId === employee.id ? "opacity-100" : "opacity-0"}`}
                              />
                              <span className="min-w-0">
                                <strong className="block truncate">
                                  {employee.id} · {employee.nickname}
                                </strong>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {employee.team}
                                  {employee.status === "ลาออก"
                                    ? " · ลาออกในเดือนนี้"
                                    : ""}
                                </span>
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </label>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="วันทำงาน"
            value={`${data.summary.workingDays} วัน`}
            note={`จากวันทำงานตามปฏิทิน ${data.summary.plannedWorkingDays} วัน`}
            icon={CalendarCheck2}
            tone="bg-emerald-50 text-emerald-700"
          />
          <StatCard
            label="หยุดงาน"
            value={`${data.summary.absence} ครั้ง`}
            note={`คงเหลือ ${data.summary.absenceRemaining} ครั้ง`}
            icon={CalendarClock}
            tone="bg-rose-50 text-rose-700"
          />
          <StatCard
            label="ลาประชุม"
            value={`${data.summary.meetingLeave} ครั้ง`}
            note={`คงเหลือ ${data.summary.meetingLeaveRemaining} ครั้ง`}
            icon={CheckCircle2}
            tone="bg-amber-50 text-amber-700"
          />
          <StatCard
            label="มาสาย"
            value={`${data.summary.late} ครั้ง`}
            note={`อีก ${data.summary.lateRemainingBeforeForceLeave} ครั้งถึงเกณฑ์บังคับหยุด`}
            icon={Clock3}
            tone="bg-violet-50 text-violet-700"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
          <form
            onSubmit={submitRecord}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-5">
              <h3 className="font-semibold text-slate-950">
                บันทึกข้อมูลการลงเวลา
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                ทุกการบันทึกต้องมีเหตุผล เพื่อให้ตรวจสอบย้อนหลังได้
              </p>
            </div>
            {!canRecord && (
              <div className="mb-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                บัญชีนี้ยังไม่เชื่อมกับรหัสพนักงาน กรุณาให้ HR
                กำหนดในแท็บสิทธิ์ผู้ใช้
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field-label">
                วันที่
                <Input
                  type="date"
                  value={recordDate}
                  onChange={(event) => setRecordDate(event.target.value)}
                  required
                />
              </label>
              <label className="field-label">
                ประเภท
                <select
                  className="native-select"
                  value={effectiveRecordType}
                  onChange={(event) =>
                    setRecordType(event.target.value as EventType)
                  }
                >
                  {allowedTypes.map((type) => (
                    <option key={type} value={type}>
                      {eventLabels[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label sm:col-span-2">
                เหตุผล<span className="text-rose-600"> *</span>
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="ระบุเหตุผลหรือรายละเอียดที่เกี่ยวข้อง"
                  required
                />
              </label>
            </div>
            <Button
              className="mt-5"
              type="submit"
              disabled={saving || !canRecord}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {saving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
            </Button>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
            <p className="text-sm text-slate-400">ผลกระทบเดือนนี้</p>
            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="text-slate-300">บังคับหยุด</span>
                <strong className="text-xl">
                  {data.summary.forcedLeaveDays} วัน
                </strong>
              </div>
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="text-slate-300">เบี้ยขยันที่ได้รับ</span>
                <strong className="text-xl text-emerald-300">
                  {money.format(data.summary.attendanceBonus)}
                </strong>
              </div>
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="text-slate-300">หักเงินตามเงื่อนไข</span>
                <strong className="text-xl text-rose-300">
                  {money.format(data.summary.absenceDeduction)}
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium">รวมผลกระทบทางการเงิน</span>
                <strong className="text-2xl">
                  {money.format(data.summary.totalDeduction)}
                </strong>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="font-semibold text-slate-950">ประวัติการลงเวลา</h3>
            <p className="mt-1 text-sm text-slate-500">
              แสดงรายการของพนักงานที่เลือกในเดือนนี้
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>วันที่</TableHead>
                <TableHead>ประเภท</TableHead>
                <TableHead>เหตุผล</TableHead>
                <TableHead>ผู้บันทึก</TableHead>
                <TableHead className="text-right">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRecords.length ? (
                visibleRecords.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">
                      {new Date(
                        `${record.recordDate}T00:00:00`,
                      ).toLocaleDateString("th-TH", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {eventLabels[record.recordType]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md whitespace-normal">
                      {record.reason}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{record.recorderEmail}</span>
                      <span className="ml-2 text-xs text-slate-400">
                        {roleLabels[record.recorderRole]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {(data.currentUser.role === "hr" ||
                        data.currentUser.email.toLowerCase() ===
                          record.recorderEmail.toLowerCase()) && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="แก้ไข"
                            onClick={() => setEditingRecord(record)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-rose-600"
                            aria-label="ลบ"
                            onClick={() => setDeleteRecord(record)}
                          >
                            <Trash2 />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-28 text-center text-slate-500"
                  >
                    ยังไม่มีรายการในเดือนนี้
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="border-t border-slate-200 bg-slate-50/70 px-5 py-4">
            <div className="flex items-center gap-2">
              <History className="size-5 text-violet-600" />
              <h3 className="font-semibold text-slate-950">
                ประวัติการแก้ไขและลบ
              </h3>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              บันทึกชื่อผู้ดำเนินการ วันที่
              และเวลาทุกครั้งที่ข้อมูลถูกแก้ไขหรือลบ
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>พนักงาน</TableHead>
                <TableHead>รายการเดิม</TableHead>
                <TableHead>การดำเนินการ</TableHead>
                <TableHead>รายละเอียด</TableHead>
                <TableHead>ผู้แก้ไข / ลบ</TableHead>
                <TableHead>วันที่และเวลา</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleAuditLogs.length ? (
                visibleAuditLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <strong>{log.employeeNickname}</strong>
                      <div className="text-xs text-slate-400">
                        {log.employeeId}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {new Date(
                          `${log.previousRecordDate}T00:00:00`,
                        ).toLocaleDateString("th-TH", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      <div className="mt-1 text-xs text-slate-500">
                        {eventLabels[log.previousRecordType]} ·{" "}
                        {log.previousReason}
                      </div>
                    </TableCell>
                    <TableCell>
                      {log.action === "edit" ? (
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                          แก้ไขข้อมูล
                        </Badge>
                      ) : (
                        <Badge variant="destructive">ลบข้อมูล</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-sm whitespace-normal">
                      {log.action === "edit" &&
                      log.newRecordDate &&
                      log.newRecordType ? (
                        <>
                          <span className="text-xs text-slate-400">
                            เปลี่ยนเป็น
                          </span>
                          <div className="font-medium">
                            {new Date(
                              `${log.newRecordDate}T00:00:00`,
                            ).toLocaleDateString("th-TH", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}{" "}
                            · {eventLabels[log.newRecordType]}
                          </div>
                          <div className="text-xs text-slate-500">
                            {log.newReason}
                          </div>
                        </>
                      ) : (
                        <span className="text-sm text-rose-600">
                          ลบรายการออกจากประวัติแล้ว
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <strong>{log.actorDisplayName}</strong>
                      <div className="text-xs text-slate-500">
                        {log.actorEmail} · {roleLabels[log.actorRole]}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatAuditDateTime(log.createdAt)} น.
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-24 text-center text-slate-500"
                  >
                    ยังไม่มีประวัติการแก้ไขหรือลบในเดือนนี้
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="daily" className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <p className="text-sm font-medium text-slate-500">
              MONTHLY ATTENDANCE MATRIX
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              สรุปการลงเวลาพนักงานทั้งเดือน
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              แถวเป็นรายชื่อพนักงาน คอลัมน์เป็นวันที่
              เลื่อนตารางไปทางขวาเพื่อดูวันถัดไป
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <Badge className="bg-emerald-600">ทำงาน</Badge>
            <Badge variant="destructive">ขาด</Badge>
            <Badge className="bg-amber-500 text-amber-950">ลา</Badge>
            <Badge className="bg-violet-600">สาย</Badge>
          </div>
        </section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="font-semibold">ตารางประจำเดือน {month}</h3>
            <p className="mt-1 text-sm text-slate-500">
              ทุกวันของเดือนเป็นวันทำงาน หากไม่มีรายการขาด / ลา / สาย จะแสดง
              “ทำงาน”
            </p>
          </div>
          <div className="max-h-[68vh] overflow-auto">
            <table className="w-max min-w-full border-collapse text-xs">
              <thead className="sticky top-0 z-20 bg-slate-100">
                <tr>
                  <th className="sticky left-0 z-30 min-w-44 border-b border-r bg-slate-100 px-3 py-3 text-left">
                    พนักงาน
                  </th>
                  {Array.from({ length: daysInMonth }, (_, index) => {
                    const day = index + 1;
                    const date = `${month}-${String(day).padStart(2, "0")}`;
                    return (
                      <th
                        key={day}
                        className="min-w-16 border-b border-r px-2 py-2 text-center"
                      >
                        <span className="block text-sm">{day}</span>
                        <span className="text-[11px] font-normal text-slate-500">
                          {new Date(`${date}T00:00:00Z`).toLocaleDateString(
                            "th-TH",
                            { weekday: "short", timeZone: "UTC" },
                          )}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {(data.currentUser.role === "employee"
                  ? data.employees.filter(
                      (employee) => employee.id === data.currentUser.employeeId,
                    )
                  : data.employees
                ).map((employee) => (
                  <tr key={employee.id} className="hover:bg-slate-50">
                    <td className="sticky left-0 z-10 border-b border-r bg-white px-3 py-2">
                      <strong className="block text-sm">
                        {employee.nickname}
                      </strong>
                      <span className="text-[11px] text-slate-500">
                        {employee.id} · {employee.team}
                      </span>
                      {employee.status === "ลาออก" && (
                        <span className="mt-1 block text-[11px] font-medium text-rose-600">
                          ลาออกในเดือนนี้
                        </span>
                      )}
                    </td>
                    {Array.from({ length: daysInMonth }, (_, index) => {
                      const day = index + 1;
                      const date = `${month}-${String(day).padStart(2, "0")}`;
                      const records = data.records.filter(
                        (record) =>
                          record.employeeId === employee.id &&
                          record.recordDate === date,
                      );
                      const labels = records.map((record) =>
                        record.recordType === "absence"
                          ? "ขาด"
                          : record.recordType === "meeting_leave"
                            ? "ลา"
                            : "สาย",
                      );
                      return (
                        <td
                          key={date}
                          title={records
                            .map(
                              (record) =>
                                `${eventLabels[record.recordType]}: ${record.reason}`,
                            )
                            .join("\n")}
                          className="border-b border-r px-1 py-2 text-center"
                        >
                          {labels.length ? (
                            <div className="flex flex-col gap-1">
                              {labels.map((label, labelIndex) => (
                                <span
                                  key={`${label}-${labelIndex}`}
                                  className={`rounded-md px-1 py-1 font-medium ${label === "ขาด" ? "bg-rose-100 text-rose-700" : label === "ลา" ? "bg-amber-100 text-amber-800" : "bg-violet-100 text-violet-700"}`}
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="inline-block rounded-md bg-emerald-50 px-1.5 py-1 text-emerald-700">
                              ทำงาน
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </TabsContent>
      <Dialog
        open={Boolean(editingRecord)}
        onOpenChange={(open) => !open && setEditingRecord(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>แก้ไขประวัติการลงเวลา</DialogTitle>
            <DialogDescription>
              เมื่อบันทึก ระบบจะคำนวณวันทำงานและผลกระทบเงินเดือนใหม่ทันที
            </DialogDescription>
          </DialogHeader>
          {editingRecord && (
            <form className="grid gap-4" onSubmit={saveRecordEdit}>
              <label className="field-label">
                วันที่
                <Input
                  type="date"
                  value={editingRecord.recordDate}
                  onChange={(event) =>
                    setEditingRecord({
                      ...editingRecord,
                      recordDate: event.target.value,
                    })
                  }
                />
              </label>
              <label className="field-label">
                ประเภท
                <select
                  className="native-select"
                  value={editingRecord.recordType}
                  onChange={(event) =>
                    setEditingRecord({
                      ...editingRecord,
                      recordType: event.target.value as EventType,
                    })
                  }
                >
                  {Object.entries(eventLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                เหตุผล
                <Textarea
                  value={editingRecord.reason}
                  onChange={(event) =>
                    setEditingRecord({
                      ...editingRecord,
                      reason: event.target.value,
                    })
                  }
                  required
                />
              </label>
              <Button disabled={saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}{" "}
                บันทึกการแก้ไข
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(deleteRecord)}
        onOpenChange={(open) => !open && setDeleteRecord(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบประวัติการลงเวลานี้?</AlertDialogTitle>
            <AlertDialogDescription>
              วันทำงาน เบี้ยขยัน และรายการหักของเดือนนั้นจะถูกคำนวณใหม่หลังลบ
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={removeRecord}
            >
              ลบรายการ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {data.currentUser.role === "hr" && (
        <TabsContent value="rules" className="space-y-4">
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
            <div className="flex gap-3">
              <Settings2 className="mt-0.5 size-5 text-violet-700" />
              <div>
                <h3 className="font-semibold text-violet-950">
                  Config เงื่อนไขการลงเวลา
                </h3>
                <p className="mt-1 text-sm text-violet-800">
                  เฉพาะ HR เท่านั้นที่ปรับ เปิด–ปิด หรือเพิ่มเงื่อนไขได้
                  ทุกค่าคำนวณเป็นรายเดือน
                </p>
              </div>
            </div>
          </div>
          {data.rules.map((rule) => (
            <RuleEditor
              key={rule.id}
              rule={rule}
              onSaved={() => void loadData()}
            />
          ))}
          <form
            onSubmit={submitNewRule}
            className="rounded-2xl border border-dashed border-slate-300 bg-white p-5"
          >
            <div className="mb-4 flex items-center gap-2">
              <Plus className="size-5 text-violet-600" />
              <h3 className="font-semibold">เพิ่มเงื่อนไขใหม่</h3>
            </div>
            <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr_1fr_120px_130px_auto] lg:items-end">
              <label className="field-label">
                ชื่อเงื่อนไข
                <Input
                  required
                  value={newRule.name}
                  onChange={(event) =>
                    setNewRule({ ...newRule, name: event.target.value })
                  }
                  placeholder="เช่น มาสายครั้งที่ 6 หักเพิ่ม"
                />
              </label>
              <label className="field-label">
                เหตุการณ์
                <select
                  className="native-select"
                  value={newRule.eventType}
                  onChange={(event) =>
                    setNewRule({
                      ...newRule,
                      eventType: event.target.value as EventType,
                    })
                  }
                >
                  {Object.entries(eventLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                ผลลัพธ์
                <select
                  className="native-select"
                  value={newRule.actionType}
                  onChange={(event) =>
                    setNewRule({
                      ...newRule,
                      actionType: event.target.value as ActionType,
                    })
                  }
                >
                  {Object.entries(actionLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                เริ่มครั้งที่
                <Input
                  type="number"
                  min={1}
                  value={newRule.triggerFrom}
                  onChange={(event) =>
                    setNewRule({
                      ...newRule,
                      triggerFrom: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label className="field-label">
                ค่าเงื่อนไข
                <Input
                  type="number"
                  min={0}
                  value={newRule.actionValue}
                  onChange={(event) =>
                    setNewRule({
                      ...newRule,
                      actionValue: Number(event.target.value),
                    })
                  }
                />
              </label>
              <Button type="submit" disabled={saving}>
                <Plus />
                เพิ่ม
              </Button>
            </div>
          </form>
        </TabsContent>
      )}

      {data.currentUser.role === "hr" && (
        <TabsContent value="users" className="space-y-4">
          <form
            onSubmit={submitUser}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-5">
              <h3 className="font-semibold text-slate-950">
                กำหนดสิทธิ์จากอีเมลบัญชี
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                เชื่อมบัญชีผู้ใช้กับพนักงาน และกำหนดบทบาท HR / Audit / พนักงาน
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-[1.3fr_.7fr_1.2fr_auto] md:items-end">
              <label className="field-label">
                อีเมล
                <Input
                  type="email"
                  required
                  value={userForm.email}
                  onChange={(event) =>
                    setUserForm({ ...userForm, email: event.target.value })
                  }
                  placeholder="name@company.com"
                />
              </label>
              <label className="field-label">
                บทบาท
                <select
                  className="native-select"
                  value={userForm.role}
                  onChange={(event) =>
                    setUserForm({
                      ...userForm,
                      role: event.target.value as Role,
                    })
                  }
                >
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                เชื่อมกับพนักงาน
                <SearchableEmployeeSelect
                  employees={data.employees}
                  value={userForm.employeeId}
                  emptyLabel="ไม่เชื่อมพนักงาน"
                  onChange={(employeeId) =>
                    setUserForm({ ...userForm, employeeId })
                  }
                />
              </label>
              <Button type="submit" disabled={saving}>
                <Save />
                บันทึกสิทธิ์
              </Button>
            </div>
          </form>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>บัญชี</TableHead>
                  <TableHead>บทบาท</TableHead>
                  <TableHead>พนักงานที่เชื่อม</TableHead>
                  <TableHead className="text-right">แก้ไข</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.users.map((user) => (
                  <TableRow key={user.email}>
                    <TableCell>
                      <div className="font-medium">
                        {user.display_name || user.email}
                      </div>
                      <div className="text-xs text-slate-500">{user.email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{roleLabels[user.role]}</Badge>
                    </TableCell>
                    <TableCell>{user.nickname || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setUserForm({
                            email: user.email,
                            role: user.role,
                            employeeId: user.employee_id || "",
                          })
                        }
                      >
                        <Pencil />
                        แก้ไข
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      )}
    </Tabs>
  );
}
