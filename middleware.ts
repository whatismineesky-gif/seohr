import { NextResponse } from 'next/server';
import { migrationMaintenance } from './lib/migration-maintenance';
export const runtime = 'nodejs';
export function middleware(request: Request) {
  return migrationMaintenance(request, process.env.MAINTENANCE_MODE === '1') ?? NextResponse.next();
}
