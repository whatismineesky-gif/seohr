export function defaultEmployeeId(employees: readonly { id: string }[], linkedEmployeeId: string | null | undefined) {
  return linkedEmployeeId && employees.some((employee) => employee.id === linkedEmployeeId) ? linkedEmployeeId : "";
}

export function selectedEmployeeId(employees: readonly { id: string }[], linkedEmployeeId: string | null | undefined, requestedId?: string) {
  return defaultEmployeeId(employees, requestedId) || defaultEmployeeId(employees, linkedEmployeeId);
}
