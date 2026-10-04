import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { migrationMaintenance } from './lib/migration-maintenance';

export function middleware(request: Request) {
  return migrationMaintenance(request, env.MAINTENANCE_MODE === '1') ?? NextResponse.next();
}
