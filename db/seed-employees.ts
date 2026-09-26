// Production employee records are migrated from the existing D1 database.
// Keep repository source free of personal and payroll data.
export type SeedEmployee = {
  id: string;
  sequence: number;
  nickname: string;
  team: string;
  position: string;
  employment: string;
  fullName: string;
  salary: number | null;
  bankAccount: string;
  bankName: string;
  accountName: string;
  startDate: string;
  endDate: string;
  aff: string;
  email: string;
  discordId: string;
  dynadot: string;
  referredBy: string;
  probation: string;
  status: string;
};

export const seedEmployees: SeedEmployee[] = [];
