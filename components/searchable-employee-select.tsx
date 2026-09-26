"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, UserRoundSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type EmployeeOption = { id: string; nickname: string; team: string; status?: string; email?: string };

export function SearchableEmployeeSelect({ employees, value, onChange, name, placeholder = "ค้นหาหรือเลือกพนักงาน", emptyLabel, disabled, className }: {
  employees: EmployeeOption[];
  value: string;
  onChange: (employeeId: string) => void;
  name?: string;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = employees.find((employee) => employee.id === value);
  return <>
    {name && <input type="hidden" name={name} value={value} />}
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className={cn("h-10 w-full justify-between bg-white px-3 font-normal", className)}>
          <span className="min-w-0 truncate">{selected ? `${selected.id} · ${selected.nickname} · ${selected.team}` : emptyLabel || placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="ค้นหารหัส ชื่อ หรือทีม..." />
          <CommandList>
            <CommandEmpty><div className="flex flex-col items-center gap-2 py-2 text-muted-foreground"><UserRoundSearch className="size-5" />ไม่พบพนักงาน</div></CommandEmpty>
            <CommandGroup>
              {emptyLabel && <CommandItem value="ไม่เชื่อมพนักงาน none" onSelect={() => { onChange(""); setOpen(false); }}><Check className={cn("size-4", value ? "opacity-0" : "opacity-100")} /><span>{emptyLabel}</span></CommandItem>}
              {employees.map((employee) => <CommandItem key={employee.id} value={`${employee.id} ${employee.nickname} ${employee.team} ${employee.email || ""}`} onSelect={() => { onChange(employee.id); setOpen(false); }}>
                <Check className={cn("size-4", value === employee.id ? "opacity-100" : "opacity-0")} />
                <span className="min-w-0"><strong className="block truncate">{employee.id} · {employee.nickname}</strong><span className="block truncate text-xs text-muted-foreground">{employee.team}{employee.status === "ลาออก" ? " · ลาออกในรอบเดือน" : ""}</span></span>
              </CommandItem>)}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  </>;
}
