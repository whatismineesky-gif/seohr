"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  Users,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchableEmployeeSelect } from "@/components/searchable-employee-select";

type Employee = {
  id: string;
  nickname: string;
  team: string;
  salary: number | null;
  status: string;
  startDate: string;
  endDate: string;
};
type Installment = {
  id: number;
  dueMonth: string;
  due_month?: string;
  amount: number;
  status: string;
  advanceId?: number;
};
type Advance = {
  id: number;
  employeeId: string;
  nickname: string;
  team: string;
  advanceType: string;
  repaymentType: string;
  description: string;
  totalAmount: number;
  monthlyAmount: number;
  startMonth: string;
  status: string;
  paidAmount: number;
  pendingAmount: number;
  installments: Installment[];
};
type PayrollData = {
  employee: Record<string, unknown>;
  settings: { targetWebsites: number; deductionPerWebsite: number };
  installments: Array<Record<string, unknown>>;
  warnings: Array<Record<string, unknown>>;
  payroll: Record<string, unknown> | null;
  performance: Record<string, unknown> | null;
  attendance: {
    plannedWorkingDays: number;
    workingDays: number;
    absence: number;
    meetingLeave: number;
    late: number;
    forcedLeaveDays: number;
    bonusLoss: number;
    attendanceBonus: number;
    attendanceDeduction: number;
    totalDeduction: number;
  };
};
type MonthlyPayrollRow = {
  employeeId: string;
  nickname: string;
  team: string;
  salary: number;
  completed: boolean;
  payrollId: number | null;
  baseSalary: number;
  websitesCompleted: number;
  targetWebsites: number;
  otherIncome: number;
  winlossAmount: number;
  installmentDeduction: number;
  warningDeduction: number;
  otherDeduction: number;
  netSalary: number;
  updatedAt: string | null;
  workingDays: number;
  attendanceBonusLoss: number;
  attendanceDeduction: number;
  employeeStatus: string;
  endDate: string;
  customIncomeItems: AdjustmentItem[];
  customDeductionItems: AdjustmentItem[];
};
type AdjustmentItem = { id?: string; name: string; amount: number };

const money = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});
const currentMonth = new Date().toISOString().slice(0, 7);

function adjustmentItems(
  value: unknown,
  fallbackAmount = 0,
  fallbackName = "รายการเพิ่มเติม",
): AdjustmentItem[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (Array.isArray(parsed)) {
      const items = parsed
        .map((item, index) => ({
          id: `saved-${index}`,
          name: String(item?.name ?? ""),
          amount: Number(item?.amount ?? 0),
        }))
        .filter((item) => item.name || item.amount > 0);
      if (items.length) return items;
    }
  } catch {
    /* รองรับข้อมูลเงินเดือนเดิมก่อนมีรายการแบบระบุชื่อ */
  }
  return fallbackAmount > 0
    ? [{ id: "legacy", name: fallbackName, amount: fallbackAmount }]
    : [];
}

function normalizedDate(value: string) {
  const thaiFormat = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return thaiFormat
    ? `${thaiFormat[3]}-${thaiFormat[2]}-${thaiFormat[1]}`
    : value;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );
}

function isInPayrollMonth(employee: Employee, payrollMonth: string) {
  const monthStart = `${payrollMonth}-01`;
  const [year, monthNumber] = payrollMonth.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(year, monthNumber, 1))
    .toISOString()
    .slice(0, 10);
  const startDate = normalizedDate(employee.startDate || "");
  const endDate = normalizedDate(employee.endDate || "");
  return (
    (!startDate || startDate < nextMonth) &&
    (employee.status !== "ลาออก" || Boolean(endDate && endDate >= monthStart))
  );
}

function statusLabel(status: string) {
  if (status === "deducted") return "ทำรายการหักแล้ว";
  if (status === "skipped") return "ไม่ได้ทำรายการ";
  return "รอดำเนินการ";
}

function statusTone(status: string) {
  if (status === "deducted")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "skipped")
    return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export function AdvancePanel({ employees }: { employees: Employee[] }) {
  const activeEmployees = useMemo(
    () => employees.filter((item) => item.status === "ยังทำงานอยู่"),
    [employees],
  );
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [repaymentType, setRepaymentType] = useState("installment");
  const [advanceEmployeeId, setAdvanceEmployeeId] = useState("");
  const [selected, setSelected] = useState<Advance | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null,
  );
  const [editing, setEditing] = useState<Advance | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Advance | null>(null);
  const advanceEmployees = useMemo(() => {
    const grouped = new Map<
      string,
      {
        employeeId: string;
        nickname: string;
        team: string;
        count: number;
        totalAmount: number;
        paidAmount: number;
        pendingAmount: number;
        items: Advance[];
      }
    >();
    for (const advance of advances) {
      const current = grouped.get(advance.employeeId) ?? {
        employeeId: advance.employeeId,
        nickname: advance.nickname,
        team: advance.team,
        count: 0,
        totalAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        items: [],
      };
      current.count += 1;
      current.totalAmount += advance.totalAmount;
      current.paidAmount += advance.paidAmount;
      current.pendingAmount += advance.pendingAmount;
      current.items.push(advance);
      grouped.set(advance.employeeId, current);
    }
    return Array.from(grouped.values());
  }, [advances]);
  const selectedEmployeeAdvances =
    advanceEmployees.find((item) => item.employeeId === selectedEmployeeId) ??
    null;

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/advances", { cache: "no-store" });
      const result = (await response.json()) as {
        advances?: Advance[];
        error?: string;
      };
      if (!response.ok || !result.advances)
        throw new Error(result.error || "โหลดข้อมูลไม่สำเร็จ");
      setAdvances(result.advances);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    try {
      const response = await fetch("/api/advances", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "บันทึกรายการไม่สำเร็จ");
      toast.success("สร้างตารางผ่อนเรียบร้อยแล้ว");
      formElement.reset();
      setAdvanceEmployeeId("");
      setRepaymentType("installment");
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "บันทึกรายการไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const response = await fetch("/api/advances", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          ...Object.fromEntries(new FormData(event.currentTarget).entries()),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "แก้ไขรายการไม่สำเร็จ");
      setEditing(null);
      await load();
      toast.success("แก้ไขรายการเรียบร้อยแล้ว");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "แก้ไขรายการไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const response = await fetch("/api/advances", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "ลบรายการไม่สำเร็จ");
      setDeleteTarget(null);
      setSelected(null);
      await load();
      toast.success("ลบรายการเบิกแล้ว");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ลบรายการไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Tabs defaultValue="records" className="space-y-5">
      <TabsList>
        <TabsTrigger value="records">
          <ReceiptText /> บันทึกรายการเบิก
        </TabsTrigger>
        <TabsTrigger value="employees">
          <Users /> พนักงานที่มีรายการเบิก
        </TabsTrigger>
      </TabsList>
      <TabsContent value="records">
        <div className="max-w-3xl">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">NEW DEDUCTION</p>
                <h2>บันทึกรายการเบิก</h2>
              </div>
              <Banknote className="text-indigo-600" />
            </div>
            <form onSubmit={submit} className="mt-5 grid gap-4">
              <label className="field-label">
                พนักงาน
                <SearchableEmployeeSelect
                  name="employeeId"
                  employees={activeEmployees}
                  value={advanceEmployeeId}
                  onChange={setAdvanceEmployeeId}
                  placeholder="ค้นหาพนักงาน"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="field-label">
                  ประเภท
                  <select name="advanceType" className="native-select">
                    <option value="advance">เงินเบิก</option>
                    <option value="installment_item">ผ่อนของ</option>
                  </select>
                </label>
                <label className="field-label">
                  รูปแบบคืน
                  <select
                    name="repaymentType"
                    className="native-select"
                    value={repaymentType}
                    onChange={(event) => setRepaymentType(event.target.value)}
                  >
                    <option value="full">คืนเต็มจำนวน</option>
                    <option value="installment">ผ่อนชำระ</option>
                  </select>
                </label>
                <label className="field-label">
                  ยอดเต็ม
                  <Input
                    name="totalAmount"
                    type="number"
                    min="1"
                    required
                    placeholder="0"
                  />
                </label>
                {repaymentType === "installment" && (
                  <label className="field-label">
                    ยอดผ่อนต่อเดือน
                    <Input
                      name="monthlyAmount"
                      type="number"
                      min="1"
                      required
                      placeholder="0"
                    />
                  </label>
                )}
                <label className="field-label">
                  เริ่มหักเดือน
                  <Input
                    name="startMonth"
                    type="month"
                    required
                    defaultValue={currentMonth}
                  />
                </label>
                <label className="field-label">
                  รายละเอียด
                  <Input name="description" placeholder="เช่น ค่าอุปกรณ์" />
                </label>
              </div>
              <Button type="submit" disabled={saving || !advanceEmployeeId}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                {saving ? "กำลังสร้างตาราง..." : "บันทึกและสร้างตารางผ่อน"}
              </Button>
            </form>
          </section>
        </div>
      </TabsContent>

      <TabsContent value="employees">
        <section className="panel overflow-hidden p-0">
          <div className="panel-heading px-6 pt-6">
            <div>
              <p className="section-kicker">EMPLOYEE ADVANCE SUMMARY</p>
              <h2>พนักงานที่มีรายการเบิก</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                รวมรายการเบิกและยอดคงเหลือแยกตามพนักงาน
              </p>
            </div>
            <Badge variant="outline">{advanceEmployees.length} คน</Badge>
          </div>
          <div className="mt-4 overflow-auto border-t">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>พนักงาน</TableHead>
                  <TableHead className="text-right">จำนวนรายการ</TableHead>
                  <TableHead className="text-right">ยอดเต็มรวม</TableHead>
                  <TableHead className="text-right">ชำระแล้ว</TableHead>
                  <TableHead className="text-right">คงเหลือ</TableHead>
                  <TableHead className="text-right">รายละเอียด</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-28 text-center">
                      <Loader2 className="mx-auto animate-spin text-indigo-600" />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && advanceEmployees.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-28 text-center text-muted-foreground"
                    >
                      ยังไม่มีพนักงานที่มีรายการเบิก
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  advanceEmployees.map((employee) => (
                    <TableRow key={employee.employeeId}>
                      <TableCell>
                        <strong>{employee.nickname}</strong>
                        <div className="text-xs text-muted-foreground">
                          {employee.employeeId} · {employee.team}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {employee.count} รายการ
                      </TableCell>
                      <TableCell className="text-right">
                        {money.format(employee.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right text-emerald-700">
                        {money.format(employee.paidAmount)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-rose-700">
                        {money.format(employee.pendingAmount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setSelectedEmployeeId(employee.employeeId)
                          }
                        >
                          <Eye /> ดูรายการ
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </TabsContent>

      <Dialog
        open={Boolean(selectedEmployeeAdvances)}
        onOpenChange={(open) => !open && setSelectedEmployeeId(null)}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              รายการเบิกทั้งหมด · {selectedEmployeeAdvances?.nickname}
            </DialogTitle>
            <DialogDescription>
              {selectedEmployeeAdvances?.employeeId} ·{" "}
              {selectedEmployeeAdvances?.team} · รวม{" "}
              {selectedEmployeeAdvances?.count ?? 0} รายการ
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ประเภท / รายละเอียด</TableHead>
                  <TableHead>เริ่มหัก</TableHead>
                  <TableHead className="text-right">ยอดเต็ม</TableHead>
                  <TableHead className="text-right">ชำระแล้ว</TableHead>
                  <TableHead className="text-right">คงเหลือ</TableHead>
                  <TableHead className="text-right">เพิ่มเติม</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedEmployeeAdvances?.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <strong>
                        {item.advanceType === "advance"
                          ? "เงินเบิก"
                          : "ผ่อนของ"}
                      </strong>
                      <div className="text-xs text-muted-foreground">
                        {item.description || "—"}
                      </div>
                    </TableCell>
                    <TableCell>{item.startMonth}</TableCell>
                    <TableCell className="text-right">
                      {money.format(item.totalAmount)}
                    </TableCell>
                    <TableCell className="text-right text-emerald-700">
                      {money.format(item.paidAmount)}
                    </TableCell>
                    <TableCell className="text-right text-rose-700">
                      {money.format(item.pendingAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="ดูตารางผ่อน"
                        title="ดูตารางผ่อน"
                        onClick={() => {
                          setSelected(item);
                          setSelectedEmployeeId(null);
                        }}
                      >
                        <Eye />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="แก้ไข"
                        title="แก้ไข"
                        onClick={() => {
                          setEditing(item);
                          setSelectedEmployeeId(null);
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-rose-600"
                        aria-label="ลบ"
                        title="ลบ"
                        onClick={() => {
                          setDeleteTarget(item);
                          setSelectedEmployeeId(null);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>ตารางผ่อน · {selected?.nickname}</DialogTitle>
            <DialogDescription>
              สถานะของแต่ละงวดจะอัปเดตจากหน้าคำนวณเงินเดือน
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>งวดเดือน</TableHead>
                  <TableHead>ยอดหัก</TableHead>
                  <TableHead>สถานะ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selected?.installments.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.dueMonth}</TableCell>
                    <TableCell>{money.format(item.amount)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusTone(item.status)}
                      >
                        {statusLabel(item.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>แก้ไขรายการเบิก</DialogTitle>
            <DialogDescription>
              ระบบจะสร้างตารางผ่อนใหม่จากข้อมูลที่แก้ไข
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <form className="grid gap-4" onSubmit={update}>
              <label className="field-label">
                พนักงาน
                <SearchableEmployeeSelect
                  name="employeeId"
                  employees={activeEmployees}
                  value={editing.employeeId}
                  onChange={(employeeId) =>
                    setEditing({ ...editing, employeeId })
                  }
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="field-label">
                  ประเภท
                  <select
                    name="advanceType"
                    className="native-select"
                    defaultValue={editing.advanceType}
                  >
                    <option value="advance">เงินเบิก</option>
                    <option value="installment_item">ผ่อนของ</option>
                  </select>
                </label>
                <label className="field-label">
                  รูปแบบคืน
                  <select
                    name="repaymentType"
                    className="native-select"
                    defaultValue={editing.repaymentType}
                  >
                    <option value="full">คืนเต็มจำนวน</option>
                    <option value="installment">ผ่อนชำระ</option>
                  </select>
                </label>
                <label className="field-label">
                  ยอดเต็ม
                  <Input
                    name="totalAmount"
                    type="number"
                    min="1"
                    required
                    defaultValue={editing.totalAmount}
                  />
                </label>
                <label className="field-label">
                  ยอดผ่อนต่อเดือน
                  <Input
                    name="monthlyAmount"
                    type="number"
                    min="1"
                    required
                    defaultValue={editing.monthlyAmount}
                  />
                </label>
                <label className="field-label">
                  เริ่มหักเดือน
                  <Input
                    name="startMonth"
                    type="month"
                    required
                    defaultValue={editing.startMonth}
                  />
                </label>
                <label className="field-label">
                  รายละเอียด
                  <Input
                    name="description"
                    defaultValue={editing.description}
                  />
                </label>
              </div>
              <Button disabled={saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}{" "}
                บันทึกการแก้ไข
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบรายการเบิกนี้?</AlertDialogTitle>
            <AlertDialogDescription>
              รายการและตารางผ่อนที่ยังไม่ถูกหักจะถูกลบถาวร
              รายการที่เคยหักเงินเดือนแล้วจะไม่สามารถลบได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={remove}
            >
              ลบรายการ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  );
}

export function PayrollPanel({ employees }: { employees: Employee[] }) {
  const [employeeId, setEmployeeId] = useState("");
  const [month, setMonth] = useState(currentMonth);
  const payrollEmployees = useMemo(
    () => employees.filter((item) => isInPayrollMonth(item, month)),
    [employees, month],
  );
  const [data, setData] = useState<PayrollData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pulled, setPulled] = useState(false);
  const [websites, setWebsites] = useState(0);
  const [incomeItems, setIncomeItems] = useState<AdjustmentItem[]>([]);
  const [winlossAmount, setWinlossAmount] = useState(0);
  const [deductionItems, setDeductionItems] = useState<AdjustmentItem[]>([]);
  const [settings, setSettings] = useState({
    targetWebsites: 0,
    deductionPerWebsite: 100,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [slipOpen, setSlipOpen] = useState(false);
  const [summaryRows, setSummaryRows] = useState<MonthlyPayrollRow[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  async function loadSettings() {
    try {
      const response = await fetch("/api/payroll?config=1", {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        settings?: PayrollData["settings"];
        error?: string;
      };
      if (!response.ok || !result.settings)
        throw new Error(result.error || "โหลด Config ไม่สำเร็จ");
      setSettings(result.settings);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "โหลด Config ไม่สำเร็จ",
      );
    }
  }

  async function loadSummary() {
    setSummaryLoading(true);
    try {
      const response = await fetch(`/api/payroll?summary=1&month=${month}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        rows?: MonthlyPayrollRow[];
        error?: string;
      };
      if (!response.ok || !result.rows)
        throw new Error(result.error || "โหลดสถานะเงินเดือนไม่สำเร็จ");
      setSummaryRows(result.rows);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "โหลดสถานะเงินเดือนไม่สำเร็จ",
      );
    } finally {
      setSummaryLoading(false);
    }
  }

  async function exportMonthlyPayroll() {
    if (!summaryRows.length) return toast.error("ไม่มีข้อมูลสำหรับ Export");
    try {
      const XLSX = await import("xlsx");
      const exportRows = summaryRows.map((item, index) => ({
        ลำดับ: index + 1,
        เดือน: month,
        รหัสพนักงาน: item.employeeId,
        ชื่อเล่น: item.nickname,
        ทีม: item.team,
        สถานะทำเงินเดือน: item.completed ? "ทำแล้ว" : "ยังไม่ได้ทำ",
        จำนวนเว็บ: item.completed ? item.websitesCompleted : "",
        เป้าหมายเว็บ: item.completed ? item.targetWebsites : "",
        รายได้หลัก: item.completed ? item.baseSalary : "",
        รายได้อื่น: item.completed ? item.otherIncome : "",
        "เงิน WINLOSS": item.completed ? item.winlossAmount : "",
        รายละเอียดรายการรับ: item.completed
          ? item.customIncomeItems
              .map((entry) => `${entry.name} ${entry.amount}`)
              .join(", ")
          : "",
        วันทำงาน: item.completed ? item.workingDays : "",
        เบี้ยขยัน: item.completed ? item.attendanceBonusLoss : "",
        หักตามเงื่อนไขลงเวลา: item.completed ? item.attendanceDeduction : "",
        "หักเงินเบิก/ผ่อนของ": item.completed ? item.installmentDeduction : "",
        หักใบเตือน: item.completed ? item.warningDeduction : "",
        รายการหักอื่น: item.completed ? item.otherDeduction : "",
        รวมรายการหัก: item.completed
          ? item.installmentDeduction +
            item.warningDeduction +
            item.attendanceDeduction +
            item.otherDeduction
          : "",
        รายละเอียดรายการหักเพิ่มเติม: item.completed
          ? item.customDeductionItems
              .map((entry) => `${entry.name} ${entry.amount}`)
              .join(", ")
          : "",
        เงินเดือนสุทธิ: item.completed ? item.netSalary : "",
      }));
      const sheet = XLSX.utils.json_to_sheet(exportRows);
      sheet["!cols"] = [
        8, 12, 14, 16, 10, 18, 12, 12, 14, 12, 14, 12, 18, 18, 18, 14, 14, 16,
        16,
      ].map((wch) => ({ wch }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "เงินเดือนรายเดือน");
      const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `payroll-${month}.xlsx`;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`เริ่มดาวน์โหลด payroll-${month}.xlsx แล้ว`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "สร้างไฟล์ Excel ไม่สำเร็จ",
      );
    }
  }

  async function load() {
    if (!employeeId) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/payroll?employeeId=${encodeURIComponent(employeeId)}&month=${month}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as PayrollData & {
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "โหลดข้อมูลไม่สำเร็จ");
      setData(result);
      setSettings(result.settings);
      const payroll = result.payroll;
      setWebsites(Number(payroll?.websites_completed ?? 0));
      setIncomeItems(
        adjustmentItems(
          payroll?.custom_income_items,
          Number(payroll?.other_income ?? 0),
          "รายได้อื่น",
        ),
      );
      setWinlossAmount(Number(payroll?.winloss_amount ?? 0));
      setDeductionItems(
        adjustmentItems(
          payroll?.custom_deduction_items,
          Number(payroll?.other_deduction ?? 0),
          "รายการหักอื่น",
        ),
      );
      setPulled(Boolean(payroll?.pulled_installments));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);
  useEffect(() => {
    if (employeeId) void load();
  }, [employeeId, month]);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/payroll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save_settings",
        ...Object.fromEntries(form.entries()),
      }),
    });
    const result = (await response.json()) as {
      settings?: PayrollData["settings"];
      error?: string;
    };
    if (!response.ok || !result.settings)
      return toast.error(result.error || "บันทึก Config ไม่สำเร็จ");
    setSettings(result.settings);
    setData((current) =>
      current ? { ...current, settings: result.settings! } : current,
    );
    toast.success("บันทึก Config เงินเดือนแล้ว");
  }

  async function savePayroll() {
    if (!employeeId || !data) return;
    setSaving(true);
    try {
      const response = await fetch("/api/payroll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save_payroll",
          employeeId,
          payrollMonth: month,
          websitesCompleted: websites,
          customIncomeItems: incomeItems,
          winlossAmount,
          customDeductionItems: deductionItems,
          pulledInstallments: pulled,
        }),
      });
      const result = (await response.json()) as PayrollData & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "บันทึกเงินเดือนไม่สำเร็จ");
      setData(result);
      toast.success(
        saved
          ? "บันทึกการแก้ไขเงินเดือนแล้ว"
          : "บันทึกเงินเดือนและสร้าง Slip แล้ว",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "บันทึกเงินเดือนไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removePayroll() {
    setSaving(true);
    try {
      const response = await fetch("/api/payroll", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId, payrollMonth: month }),
      });
      const result = (await response.json()) as PayrollData & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "ลบรายการเงินเดือนไม่สำเร็จ");
      setData(result);
      setConfirmDelete(false);
      toast.success("ลบรายการเงินเดือนแล้ว");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ลบรายการเงินเดือนไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  const baseSalary = Number(data?.employee.salary ?? 0);
  const target = settings.targetWebsites;
  const rate = settings.deductionPerWebsite;
  const calculatedBase = websites >= target ? baseSalary : websites * rate;
  const installmentDeduction = data?.payroll
    ? Number(data.payroll.installment_deduction ?? 0)
    : pulled
      ? (data?.installments.reduce(
          (sum, item) => sum + Number(item.amount ?? 0),
          0,
        ) ?? 0)
      : 0;
  const warningDeduction =
    data?.warnings.reduce((sum, item) => sum + Number(item.amount ?? 0), 0) ??
    0;
  const attendanceBonus = data?.attendance.attendanceBonus ?? 0;
  const attendanceDeduction = data?.attendance.attendanceDeduction ?? 0;
  const otherIncome = incomeItems.reduce(
    (sum, item) => sum + Math.max(0, Number(item.amount) || 0),
    0,
  );
  const otherDeduction = deductionItems.reduce(
    (sum, item) => sum + Math.max(0, Number(item.amount) || 0),
    0,
  );
  const isWinloss = String(data?.performance?.result_type ?? "") === "winloss";
  const net = Math.max(
    0,
    calculatedBase +
      otherIncome +
      (isWinloss ? winlossAmount : 0) +
      attendanceBonus -
      installmentDeduction -
      warningDeduction -
      attendanceDeduction -
      otherDeduction,
  );
  const saved = data?.payroll;
  const savedIncomeItems = adjustmentItems(
    saved?.custom_income_items,
    Number(saved?.other_income ?? 0),
    "รายได้อื่น",
  );
  const savedDeductionItems = adjustmentItems(
    saved?.custom_deduction_items,
    Number(saved?.other_deduction ?? 0),
    "รายการหักอื่น",
  );

  useEffect(() => {
    const nativePrint = window.print;
    window.print = () => {
      if (!saved || !data) return nativePrint.call(window);
      const incomeRows: [string, number][] = [
        ["รายได้หลัก", Number(saved.base_salary ?? 0)],
        ...savedIncomeItems.map(
          (item) => [item.name, item.amount] as [string, number],
        ),
        ...(Number(saved.winloss_amount ?? 0) > 0
          ? ([["เงิน WINLOSS", Number(saved.winloss_amount)]] as [
              string,
              number,
            ][])
          : []),
        ...(Number(saved.attendance_bonus_loss ?? 0) > 0
          ? ([["เบี้ยขยัน", Number(saved.attendance_bonus_loss)]] as [
              string,
              number,
            ][])
          : []),
      ];
      const deductionRows = (
        [
          ["เงินเบิก / ผ่อนของ", Number(saved.installment_deduction ?? 0)],
          ["ใบเตือน", Number(saved.warning_deduction ?? 0)],
          ["การลงเวลา", Number(saved.attendance_deduction ?? 0)],
          ...savedDeductionItems.map(
            (item) => [item.name, item.amount] as [string, number],
          ),
        ] as [string, number][]
      ).filter(([, amount]) => amount > 0);
      const formatAmount = (amount: number) =>
        new Intl.NumberFormat("th-TH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(amount);
      const rows = (items: [string, number][], tone: string) =>
        items.length
          ? items
              .map(
                ([name, amount]) =>
                  `<div class="row"><span>${escapeHtml(name)}</span><strong class="${tone}">${tone === "minus" ? "-" : "+"}${formatAmount(amount)}</strong></div>`,
              )
              .join("")
          : `<div class="empty">ไม่มีรายการ</div>`;
      const popup = window.open(
        "",
        "payroll-slip-print",
        "width=760,height=900",
      );
      if (!popup) return toast.error("กรุณาอนุญาต Pop-up เพื่อพิมพ์ Slip");
      popup.document
        .write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>Slip เงินเดือน ${escapeHtml(String(data.employee.nickname))} ${escapeHtml(String(saved.payroll_month))}</title><style>
        @page{size:A5 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;width:148mm;height:210mm;background:#eef1f7;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans Thai",Tahoma,sans-serif;color:#17213a;-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{position:relative;width:148mm;height:210mm;overflow:hidden;background:#fff;padding:0 11mm 8mm}.topbar{height:8mm;margin:0 -11mm;background:linear-gradient(90deg,#172347,#4659c4 70%,#14a58a)}.header{display:flex;justify-content:space-between;align-items:flex-start;padding:8mm 0 5mm;border-bottom:1px solid #dfe4ef}.brand{font-size:10px;font-weight:800;letter-spacing:2px;color:#4659c4}.title{margin:2px 0 0;font-size:23px;line-height:1.2}.period{text-align:right;font-size:11px;color:#667085}.period strong{display:block;margin-top:3px;font-size:15px;color:#172347}.employee{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:5mm 0;padding:4mm;border-radius:4mm;background:#f4f6fb}.label{font-size:9px;color:#778197}.value{margin-top:2px;font-size:12px;font-weight:700}.meta{text-align:right}.summary{display:grid;grid-template-columns:1fr 1fr;gap:4mm}.box{border:1px solid #e1e6f0;border-radius:4mm;overflow:hidden}.box-title{padding:3mm 4mm;font-size:11px;font-weight:800}.income-title{background:#eaf8f3;color:#08745f}.deduction-title{background:#fff0f2;color:#a52742}.rows{padding:1mm 4mm 2mm}.row{display:flex;justify-content:space-between;gap:8px;padding:2.2mm 0;border-bottom:1px dashed #e2e6ee;font-size:10px}.row:last-child{border-bottom:0}.row span{max-width:62%;overflow-wrap:anywhere}.row strong{white-space:nowrap}.plus{color:#08745f}.minus{color:#ba2748}.empty{padding:5mm 0;text-align:center;font-size:10px;color:#98a1b2}.totals{margin-top:5mm;border-radius:4mm;background:linear-gradient(135deg,#1b2a5a,#3447a5);padding:4.5mm 5mm;color:#fff}.total-line{display:flex;justify-content:space-between;font-size:10px;color:#dce2ff}.net{display:flex;justify-content:space-between;align-items:end;margin-top:3mm;padding-top:3mm;border-top:1px solid rgba(255,255,255,.22)}.net span{font-size:12px}.net strong{font-size:25px}.attendance{display:flex;justify-content:space-between;margin-top:4mm;padding:3mm 4mm;border-radius:3mm;background:#f6f7fb;font-size:9px;color:#616b7f}.footer{position:absolute;left:11mm;right:11mm;bottom:7mm;display:flex;justify-content:space-between;border-top:1px solid #e1e6ef;padding-top:3mm;font-size:8px;color:#8a93a3}.seal{font-weight:800;letter-spacing:1px;color:#3445a4}@media print{html,body{background:#fff}}
      </style></head><body><main class="sheet"><div class="topbar"></div><header class="header"><div><div class="brand">PEOPLE OS</div><h1 class="title">ใบแจ้งเงินเดือน</h1></div><div class="period">รอบเงินเดือน<strong>${escapeHtml(String(saved.payroll_month))}</strong></div></header><section class="employee"><div><div class="label">พนักงาน</div><div class="value">${escapeHtml(String(data.employee.nickname))}</div><div class="label" style="margin-top:4px">รหัส ${escapeHtml(String(data.employee.id))}</div></div><div class="meta"><div class="label">ทีม / แผนก</div><div class="value">${escapeHtml(String(data.employee.team))}</div><div class="label" style="margin-top:4px">วันทำงาน ${Number(saved.working_days ?? 0)} วัน</div></div></section><section class="summary"><div class="box"><div class="box-title income-title">รายการรับ</div><div class="rows">${rows(incomeRows as [string, number][], "plus")}</div></div><div class="box"><div class="box-title deduction-title">รายการหัก</div><div class="rows">${rows(deductionRows, "minus")}</div></div></section><section class="totals"><div class="total-line"><span>รวมรายได้</span><strong>${formatAmount(incomeRows.reduce((sum, [, amount]) => sum + Number(amount), 0))} บาท</strong></div><div class="total-line" style="margin-top:5px"><span>รวมรายการหัก</span><strong>${formatAmount(deductionRows.reduce((sum, [, amount]) => sum + amount, 0))} บาท</strong></div><div class="net"><span>ยอดรับสุทธิ</span><strong>${formatAmount(Number(saved.net_salary ?? 0))} บาท</strong></div></section><div class="attendance"><span>จำนวนเว็บไซต์ ${Number(saved.websites_completed ?? 0)} / เป้าหมาย ${Number(saved.target_websites ?? 0)}</span><span>จัดทำโดยฝ่ายทรัพยากรบุคคล</span></div><footer class="footer"><span>เอกสารนี้สร้างจากระบบ People OS</span><span class="seal">PAYROLL SLIP</span></footer></main><script>window.onload=()=>setTimeout(()=>window.print(),300);window.onafterprint=()=>window.close();<\/script></body></html>`);
      popup.document.close();
    };
    return () => {
      window.print = nativePrint;
    };
  }, [data, saved, savedIncomeItems, savedDeductionItems]);

  return (
    <Tabs defaultValue="payroll" className="space-y-5">
      <TabsList>
        <TabsTrigger value="payroll">
          <ReceiptText /> คำนวณเงินเดือน
        </TabsTrigger>
        <TabsTrigger value="summary" onClick={loadSummary}>
          <Users /> สถานะรายเดือน
        </TabsTrigger>
        <TabsTrigger value="config">
          <Settings2 /> Config
        </TabsTrigger>
      </TabsList>

      <TabsContent value="payroll" className="space-y-6">
        <section className="panel">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <label className="field-label">
              พนักงาน
              <SearchableEmployeeSelect
                employees={payrollEmployees}
                value={employeeId}
                onChange={setEmployeeId}
                placeholder="ค้นหาพนักงาน"
              />
            </label>
            <label className="field-label">
              เดือนเงินเดือน
              <Input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
              />
            </label>
            <Button
              variant="outline"
              onClick={load}
              disabled={!employeeId || loading}
            >
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}{" "}
              ดึงข้อมูลเดือนนี้
            </Button>
          </div>
        </section>

        {data && (
          <div className="grid gap-6 xl:grid-cols-[1fr_0.72fr]">
            <div className="space-y-6">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">PAYROLL INPUT</p>
                    <h2>คำนวณเงินเดือน · {String(data.employee.nickname)}</h2>
                  </div>
                  <Badge variant="outline">{month}</Badge>
                </div>
                <div className="mt-5">
                  <label className="field-label">
                    จำนวนเว็บที่ทำเดือนนี้
                    <Input
                      type="number"
                      min="0"
                      value={websites}
                      onChange={(event) =>
                        setWebsites(Number(event.target.value))
                      }
                    />
                  </label>
                </div>
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-emerald-950">
                          รายการรับเพิ่มเติม
                        </h3>
                        <p className="text-xs text-emerald-700">
                          ระบุชื่อและจำนวนเงินได้หลายรายการ
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setIncomeItems((items) => [
                            ...items,
                            { id: `income-${Date.now()}`, name: "", amount: 0 },
                          ])
                        }
                      >
                        <Plus /> เพิ่มรายการ
                      </Button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {incomeItems.length === 0 && (
                        <p className="rounded-lg border border-dashed bg-white p-3 text-center text-sm text-muted-foreground">
                          ยังไม่มีรายการรับเพิ่มเติม
                        </p>
                      )}
                      {incomeItems.map((item, index) => (
                        <div
                          key={item.id ?? index}
                          className="grid grid-cols-[1fr_8rem_auto] gap-2"
                        >
                          <Input
                            aria-label="ชื่อรายการรับ"
                            placeholder="เช่น ค่าคอมมิชชั่น"
                            value={item.name}
                            onChange={(event) =>
                              setIncomeItems((items) =>
                                items.map((current, itemIndex) =>
                                  itemIndex === index
                                    ? { ...current, name: event.target.value }
                                    : current,
                                ),
                              )
                            }
                          />
                          <Input
                            aria-label="จำนวนเงินรายการรับ"
                            type="number"
                            min="0"
                            placeholder="0"
                            value={item.amount || ""}
                            onChange={(event) =>
                              setIncomeItems((items) =>
                                items.map((current, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...current,
                                        amount: Number(event.target.value),
                                      }
                                    : current,
                                ),
                              )
                            }
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label="ลบรายการรับ"
                            onClick={() =>
                              setIncomeItems((items) =>
                                items.filter(
                                  (_, itemIndex) => itemIndex !== index,
                                ),
                              )
                            }
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex justify-between border-t border-emerald-200 pt-3 text-sm text-emerald-900">
                      <span>รวมรายการรับเพิ่มเติม</span>
                      <strong>{money.format(otherIncome)}</strong>
                    </div>
                  </section>
                  <section className="rounded-xl border border-rose-200 bg-rose-50/50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-rose-950">
                          รายการหักเพิ่มเติม
                        </h3>
                        <p className="text-xs text-rose-700">
                          ระบุชื่อและจำนวนเงินได้หลายรายการ
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setDeductionItems((items) => [
                            ...items,
                            {
                              id: `deduction-${Date.now()}`,
                              name: "",
                              amount: 0,
                            },
                          ])
                        }
                      >
                        <Plus /> เพิ่มรายการ
                      </Button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {deductionItems.length === 0 && (
                        <p className="rounded-lg border border-dashed bg-white p-3 text-center text-sm text-muted-foreground">
                          ยังไม่มีรายการหักเพิ่มเติม
                        </p>
                      )}
                      {deductionItems.map((item, index) => (
                        <div
                          key={item.id ?? index}
                          className="grid grid-cols-[1fr_8rem_auto] gap-2"
                        >
                          <Input
                            aria-label="ชื่อรายการหัก"
                            placeholder="เช่น ค่าอุปกรณ์"
                            value={item.name}
                            onChange={(event) =>
                              setDeductionItems((items) =>
                                items.map((current, itemIndex) =>
                                  itemIndex === index
                                    ? { ...current, name: event.target.value }
                                    : current,
                                ),
                              )
                            }
                          />
                          <Input
                            aria-label="จำนวนเงินรายการหัก"
                            type="number"
                            min="0"
                            placeholder="0"
                            value={item.amount || ""}
                            onChange={(event) =>
                              setDeductionItems((items) =>
                                items.map((current, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...current,
                                        amount: Number(event.target.value),
                                      }
                                    : current,
                                ),
                              )
                            }
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label="ลบรายการหัก"
                            onClick={() =>
                              setDeductionItems((items) =>
                                items.filter(
                                  (_, itemIndex) => itemIndex !== index,
                                ),
                              )
                            }
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex justify-between border-t border-rose-200 pt-3 text-sm text-rose-900">
                      <span>รวมรายการหักเพิ่มเติม</span>
                      <strong>{money.format(otherDeduction)}</strong>
                    </div>
                  </section>
                </div>
                <div className="mt-4 rounded-xl border bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-sm text-muted-foreground">
                        สถานะ WINLOSS
                      </span>
                      <div className="mt-1">
                        {isWinloss ? (
                          <Badge className="bg-emerald-600">ได้ WINLOSS</Badge>
                        ) : (
                          <Badge variant="secondary">ไม่ได้ WINLOSS</Badge>
                        )}
                      </div>
                    </div>
                    {isWinloss && (
                      <label className="field-label w-full sm:w-56">
                        จำนวนเงิน WINLOSS (ไม่บังคับ)
                        <Input
                          type="number"
                          min="0"
                          value={winlossAmount}
                          onChange={(event) =>
                            setWinlossAmount(Number(event.target.value))
                          }
                          placeholder="0"
                        />
                      </label>
                    )}
                  </div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant={pulled ? "default" : "outline"}
                    disabled={Boolean(data.payroll)}
                    onClick={() => setPulled(true)}
                  >
                    <WalletCards /> ดึงรายการหัก ({data.installments.length}{" "}
                    งวด)
                  </Button>
                  <Button
                    type="button"
                    variant={!pulled ? "secondary" : "outline"}
                    disabled={Boolean(data.payroll)}
                    onClick={() => setPulled(false)}
                  >
                    <AlertTriangle /> ไม่ดึงรายการหักเดือนนี้
                  </Button>
                </div>
                {pulled && (
                  <div className="mt-4 overflow-hidden rounded-xl border">
                    <div className="flex items-center justify-between bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                      <strong>รายการหักที่ดึงมา</strong>
                      <strong>{money.format(installmentDeduction)}</strong>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ประเภท</TableHead>
                          <TableHead>รายละเอียด</TableHead>
                          <TableHead>งวดเดือน</TableHead>
                          <TableHead className="text-right">ยอดหัก</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.installments.length === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={4}
                              className="h-20 text-center text-muted-foreground"
                            >
                              ไม่มีรายการหักในเดือนนี้
                            </TableCell>
                          </TableRow>
                        )}
                        {data.installments.map((item) => (
                          <TableRow key={Number(item.id)}>
                            <TableCell>
                              {String(item.advance_type) === "advance"
                                ? "เงินเบิก"
                                : "ผ่อนของ"}
                            </TableCell>
                            <TableCell>
                              {String(item.description || "—")}
                            </TableCell>
                            <TableCell>{String(item.due_month)}</TableCell>
                            <TableCell className="text-right font-medium">
                              {money.format(Number(item.amount))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <div className="mt-4 rounded-xl border bg-slate-50 p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span>ใบเตือนเดือนนี้</span>
                    <strong>
                      {data.warnings.length} ใบ ·{" "}
                      {money.format(warningDeduction)}
                    </strong>
                  </div>
                  {data.warnings.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {data.warnings.map((item) => (
                        <Badge
                          key={Number(item.id)}
                          variant={
                            String(item.subject) === "ใบแดง"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {String(item.subject)}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 px-0"
                    onClick={load}
                  >
                    <RefreshCw /> ดึงข้อมูลใบเตือนอีกครั้ง
                  </Button>
                </div>
                <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>ข้อมูลลงเวลาประจำเดือน</strong>
                    <span>
                      วันทำงาน {data.attendance.workingDays}/
                      {data.attendance.plannedWorkingDays} วัน
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <span>หยุดงาน {data.attendance.absence} ครั้ง</span>
                    <span>ลาประชุม {data.attendance.meetingLeave} ครั้ง</span>
                    <span>มาสาย {data.attendance.late} ครั้ง</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
                    <span className="text-emerald-700">
                      เบี้ยขยันที่ได้รับ {money.format(attendanceBonus)}
                    </span>
                    <span className="text-rose-700">
                      หักตามเงื่อนไข {money.format(attendanceDeduction)}
                    </span>
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">CALCULATION</p>
                    <h2>สรุปยอดก่อนบันทึก</h2>
                  </div>
                  <ReceiptText className="text-indigo-600" />
                </div>
                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span>
                      {websites >= target
                        ? "เงินเดือนพื้นฐาน (ทำถึงเป้า)"
                        : `รายได้ตามจำนวนเว็บ (${websites} × ${money.format(rate)})`}
                    </span>
                    <strong>{money.format(calculatedBase)}</strong>
                  </div>
                  {incomeItems
                    .filter((item) => item.name && item.amount > 0)
                    .map((item, index) => (
                      <div
                        key={`income-summary-${index}`}
                        className="flex justify-between text-emerald-700"
                      >
                        <span>{item.name}</span>
                        <strong>+ {money.format(item.amount)}</strong>
                      </div>
                    ))}
                  {isWinloss && (
                    <div className="flex justify-between text-emerald-700">
                      <span>เงิน WINLOSS</span>
                      <strong>+ {money.format(winlossAmount)}</strong>
                    </div>
                  )}
                  <div className="flex justify-between text-rose-700">
                    <span>รายการเบิก/ผ่อนของ</span>
                    <strong>- {money.format(installmentDeduction)}</strong>
                  </div>
                  <div className="flex justify-between text-rose-700">
                    <span>รายการหักจากใบเตือน</span>
                    <strong>- {money.format(warningDeduction)}</strong>
                  </div>
                  <div className="flex justify-between text-emerald-700">
                    <span>เบี้ยขยัน</span>
                    <strong>+ {money.format(attendanceBonus)}</strong>
                  </div>
                  <div className="flex justify-between text-rose-700">
                    <span>รายการหักจากการลงเวลา</span>
                    <strong>- {money.format(attendanceDeduction)}</strong>
                  </div>
                  {deductionItems
                    .filter((item) => item.name && item.amount > 0)
                    .map((item, index) => (
                      <div
                        key={`deduction-summary-${index}`}
                        className="flex justify-between text-rose-700"
                      >
                        <span>{item.name}</span>
                        <strong>- {money.format(item.amount)}</strong>
                      </div>
                    ))}
                  <div className="flex justify-between border-t pt-4 text-lg">
                    <strong>เงินเดือนสุทธิ</strong>
                    <strong className="text-indigo-700">
                      {money.format(net)}
                    </strong>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button
                    className="min-w-48 flex-1"
                    onClick={savePayroll}
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 className="animate-spin" />
                    ) : saved ? (
                      <Pencil />
                    ) : (
                      <Save />
                    )}
                    {saving
                      ? "กำลังบันทึก..."
                      : saved
                        ? "บันทึกการแก้ไข"
                        : "บันทึกและสร้าง Slip"}
                  </Button>
                  {saved && (
                    <Button variant="outline" onClick={() => setSlipOpen(true)}>
                      <Eye /> ดู Slip
                    </Button>
                  )}
                  {saved && (
                    <Button
                      variant="destructive"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 /> ลบ
                    </Button>
                  )}
                </div>
              </section>
            </div>

            <aside className="space-y-6">
              {saved && (
                <section className="panel print-slip">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="section-kicker">PEOPLE OS</p>
                      <h2 className="text-xl font-semibold">Slip เงินเดือน</h2>
                      <p className="text-sm text-muted-foreground">
                        ประจำเดือน {String(saved.payroll_month)}
                      </p>
                    </div>
                    <CheckCircle2 className="text-emerald-600" />
                  </div>
                  <div className="my-5 border-y py-4">
                    <strong>{String(data.employee.nickname)}</strong>
                    <p className="text-sm text-muted-foreground">
                      {String(data.employee.team)} · {String(data.employee.id)}
                    </p>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>วันทำงาน</span>
                      <span>{Number(saved.working_days ?? 0)} วัน</span>
                    </div>
                    <div className="flex justify-between">
                      <span>รายได้หลัก</span>
                      <span>{money.format(Number(saved.base_salary))}</span>
                    </div>
                    {savedIncomeItems.map((item, index) => (
                      <div
                        key={`saved-income-${index}`}
                        className="flex justify-between text-emerald-700"
                      >
                        <span>{item.name}</span>
                        <span>{money.format(item.amount)}</span>
                      </div>
                    ))}
                    {Number(saved.winloss_amount ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <span>เงิน WINLOSS</span>
                        <span>
                          {money.format(Number(saved.winloss_amount))}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-emerald-700">
                      <span>เบี้ยขยัน</span>
                      <span>
                        {money.format(Number(saved.attendance_bonus_loss ?? 0))}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>รวมรายการหัก</span>
                      <span>
                        {money.format(
                          Number(saved.installment_deduction) +
                            Number(saved.warning_deduction) +
                            Number(saved.attendance_deduction ?? 0) +
                            Number(saved.other_deduction),
                        )}
                      </span>
                    </div>
                    <div className="mt-3 flex justify-between border-t pt-3 text-lg">
                      <strong>รับสุทธิ</strong>
                      <strong>{money.format(Number(saved.net_salary))}</strong>
                    </div>
                  </div>
                  <Button
                    className="mt-5 w-full print:hidden"
                    onClick={() => setSlipOpen(true)}
                  >
                    <Eye /> เปิดดู Slip
                  </Button>
                </section>
              )}
            </aside>
          </div>
        )}

        {!data && (
          <section className="panel flex min-h-64 flex-col items-center justify-center text-center">
            <FileText className="mb-3 size-10 text-slate-300" />
            <h2 className="font-semibold">เลือกพนักงานเพื่อเริ่มคำนวณ</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              ระบบจะดึงเงินเดือน รายการผ่อน และใบเตือนของเดือนที่เลือก
            </p>
          </section>
        )}
      </TabsContent>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบรายการเงินเดือนเดือนนี้?</AlertDialogTitle>
            <AlertDialogDescription>
              Slip จะถูกลบ และรายการผ่อนที่ผูกกับ Slip นี้จะกลับเป็น
              “รอดำเนินการ”
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={removePayroll}
            >
              ลบรายการ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={slipOpen} onOpenChange={setSlipOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader className="print:hidden">
            <DialogTitle>Slip เงินเดือน</DialogTitle>
            <DialogDescription>
              ตรวจสอบรายละเอียดก่อนพิมพ์ Slip
            </DialogDescription>
          </DialogHeader>
          {saved && data && (
            <section
              id="payroll-slip"
              className="rounded-2xl border bg-white p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="section-kicker">PEOPLE OS</p>
                  <h2 className="text-xl font-semibold">Slip เงินเดือน</h2>
                  <p className="text-sm text-muted-foreground">
                    ประจำเดือน {String(saved.payroll_month)}
                  </p>
                </div>
                <CheckCircle2 className="text-emerald-600" />
              </div>
              <div className="my-5 border-y py-4">
                <strong>{String(data.employee.nickname)}</strong>
                <p className="text-sm text-muted-foreground">
                  {String(data.employee.team)} · {String(data.employee.id)}
                </p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>วันทำงาน</span>
                  <span>{Number(saved.working_days ?? 0)} วัน</span>
                </div>
                <div className="flex justify-between">
                  <span>รายได้หลัก</span>
                  <span>{money.format(Number(saved.base_salary))}</span>
                </div>
                <div className="flex justify-between">
                  <span>รายได้อื่น</span>
                  <span>{money.format(Number(saved.other_income))}</span>
                </div>
                {Number(saved.winloss_amount ?? 0) > 0 && (
                  <div className="flex justify-between">
                    <span>เงิน WINLOSS</span>
                    <span>{money.format(Number(saved.winloss_amount))}</span>
                  </div>
                )}
                <div className="flex justify-between text-emerald-700">
                  <span>เบี้ยขยัน</span>
                  <span>
                    {money.format(Number(saved.attendance_bonus_loss ?? 0))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>หักรายการเบิก/ผ่อน</span>
                  <span>
                    {money.format(Number(saved.installment_deduction))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>หักใบเตือน</span>
                  <span>{money.format(Number(saved.warning_deduction))}</span>
                </div>
                <div className="flex justify-between">
                  <span>หักจากการลงเวลา</span>
                  <span>
                    {money.format(Number(saved.attendance_deduction ?? 0))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>หักอื่น</span>
                  <span>{money.format(Number(saved.other_deduction))}</span>
                </div>
                <div className="mt-3 flex justify-between border-t pt-3 text-lg">
                  <strong>รับสุทธิ</strong>
                  <strong>{money.format(Number(saved.net_salary))}</strong>
                </div>
              </div>
            </section>
          )}
          <Button
            className="w-full print:hidden"
            onClick={() => window.print()}
          >
            <Printer /> พิมพ์ Slip
          </Button>
        </DialogContent>
      </Dialog>

      <TabsContent value="summary" className="space-y-5">
        <section className="panel">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <label className="field-label min-w-52">
              เดือนเงินเดือน
              <Input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
              />
            </label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={loadSummary}
                disabled={summaryLoading}
              >
                {summaryLoading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RefreshCw />
                )}{" "}
                โหลดข้อมูล
              </Button>
              <Button
                onClick={exportMonthlyPayroll}
                disabled={summaryLoading || !summaryRows.length}
              >
                <Download /> Export Excel
              </Button>
            </div>
          </div>
        </section>
        <div className="grid gap-4 sm:grid-cols-3">
          <section className="summary-card">
            <Users className="text-indigo-600" />
            <div>
              <p className="text-sm text-muted-foreground">พนักงานทั้งหมด</p>
              <strong className="text-2xl">{summaryRows.length} คน</strong>
            </div>
          </section>
          <section className="summary-card">
            <CheckCircle2 className="text-emerald-600" />
            <div>
              <p className="text-sm text-muted-foreground">ทำเงินเดือนแล้ว</p>
              <strong className="text-2xl">
                {summaryRows.filter((item) => item.completed).length} คน
              </strong>
            </div>
          </section>
          <section className="summary-card">
            <AlertTriangle className="text-amber-500" />
            <div>
              <p className="text-sm text-muted-foreground">ยังไม่ได้ทำ</p>
              <strong className="text-2xl">
                {summaryRows.filter((item) => !item.completed).length} คน
              </strong>
            </div>
          </section>
        </div>
        <section className="panel overflow-hidden p-0">
          <div className="panel-heading px-6 pt-6">
            <div>
              <p className="section-kicker">MONTHLY PAYROLL STATUS</p>
              <h2>สถานะการทำเงินเดือน · {month}</h2>
            </div>
            <FileSpreadsheet className="text-indigo-600" />
          </div>
          <div className="mt-4 overflow-auto border-t">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>พนักงาน</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="text-right">วันทำงาน</TableHead>
                  <TableHead className="text-right">รายได้หลัก</TableHead>
                  <TableHead className="text-right">รายได้อื่น</TableHead>
                  <TableHead className="text-right">WINLOSS</TableHead>
                  <TableHead className="text-right">หักเบิก/ผ่อน</TableHead>
                  <TableHead className="text-right">หักใบเตือน</TableHead>
                  <TableHead className="text-right">เบี้ยขยัน</TableHead>
                  <TableHead className="text-right">หักลงเวลา</TableHead>
                  <TableHead className="text-right">หักอื่น</TableHead>
                  <TableHead className="text-right">รับสุทธิ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaryLoading && (
                  <TableRow>
                    <TableCell colSpan={12} className="h-32 text-center">
                      <Loader2 className="mx-auto animate-spin text-indigo-600" />
                    </TableCell>
                  </TableRow>
                )}
                {!summaryLoading && !summaryRows.length && (
                  <TableRow>
                    <TableCell
                      colSpan={12}
                      className="h-32 text-center text-muted-foreground"
                    >
                      กด “โหลดข้อมูล” เพื่อดูสถานะรายเดือน
                    </TableCell>
                  </TableRow>
                )}
                {!summaryLoading &&
                  summaryRows.map((item) => (
                    <TableRow key={item.employeeId}>
                      <TableCell>
                        <strong>{item.nickname}</strong>
                        <div className="text-xs text-muted-foreground">
                          {item.employeeId} · {item.team}
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.completed ? (
                          <Badge className="bg-emerald-600">ทำแล้ว</Badge>
                        ) : (
                          <Badge variant="secondary">ยังไม่ได้ทำ</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.completed ? `${item.workingDays} วัน` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.completed ? money.format(item.baseSalary) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.completed ? money.format(item.otherIncome) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.completed
                          ? money.format(item.winlossAmount)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right text-rose-700">
                        {item.completed
                          ? money.format(item.installmentDeduction)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right text-rose-700">
                        {item.completed
                          ? money.format(item.warningDeduction)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right text-emerald-700">
                        {item.completed
                          ? money.format(item.attendanceBonusLoss)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right text-rose-700">
                        {item.completed
                          ? money.format(item.attendanceDeduction)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right text-rose-700">
                        {item.completed
                          ? money.format(item.otherDeduction)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {item.completed ? money.format(item.netSalary) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </TabsContent>

      <TabsContent value="config" className="space-y-5">
        <section className="rounded-xl border border-violet-200 bg-violet-50 p-5">
          <div className="flex gap-3">
            <Settings2 className="mt-0.5 size-5 text-violet-700" />
            <div>
              <h3 className="font-semibold text-violet-950">
                Config การคำนวณเงินเดือน
              </h3>
              <p className="mt-1 text-sm text-violet-800">
                ทำถึงเป้าใช้ฐานเงินเดือนตามข้อมูลพนักงาน
                หากทำไม่ถึงเป้าจะจ่ายตามจำนวนเว็บคูณราคาต่อเว็บ
              </p>
            </div>
          </div>
        </section>
        <section className="panel max-w-2xl">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">PAYROLL CONFIG</p>
              <h2>ตั้งค่าเป้าหมายเว็บไซต์</h2>
            </div>
            <Settings2 className="text-slate-500" />
          </div>
          <form
            className="mt-5 grid gap-4 sm:grid-cols-2"
            onSubmit={saveSettings}
          >
            <label className="field-label">
              จำนวนเว็บเป้าหมายต่อเดือน
              <Input
                name="targetWebsites"
                type="number"
                min="0"
                value={settings.targetWebsites}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    targetWebsites: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label className="field-label">
              ราคาต่อเว็บเมื่อทำไม่ถึงเป้า
              <Input
                name="deductionPerWebsite"
                type="number"
                min="1"
                value={settings.deductionPerWebsite}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    deductionPerWebsite: Number(event.target.value),
                  }))
                }
              />
            </label>
            <Button type="submit" className="sm:col-span-2">
              <Save /> บันทึก Config
            </Button>
          </form>
        </section>
      </TabsContent>
    </Tabs>
  );
}
