// Compatibility for the application's existing prepare/bind/first/all/batch API.
// SQL is tokenized so user values and quoted literals are never rewritten.
export type SqlClient = {
  connect(): Promise<void>;
  query(text: string, values?: unknown[]): Promise<{
    rows: Record<string, unknown>[];
    rowCount: number | null;
    command?: string;
    fields?: { name: string; dataTypeID?: number }[];
  }>;
  end(): Promise<void>;
};

type Token = { text: string; kind: 'word' | 'literal' | 'symbol' };
const utcText = "to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')";
const identityTables = new Set([
  'd1_migrations', 'hr_attendance_bonus_tiers', 'hr_attendance_rules',
  'hr_attendance_audit_logs', 'hr_attendance_records', 'hr_daily_work_review_logs',
  'hr_daily_work_reviews', 'hr_employee_advances', 'hr_advance_installments',
  'hr_employee_checkins', 'hr_employee_daily_work_target_logs',
  'hr_integration_api_keys', 'hr_checkin_config', 'hr_daily_work_status_config',
  'hr_monthly_deposit_results', 'hr_notifications', 'hr_payroll_records',
  'hr_system_announcements', 'hr_warning_records',
  'hr_work_submission_backfill_grants', 'hr_work_submissions', 'hr_payroll_settings',
]);

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\s+|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|[a-zA-Z_][\w$]*(?:\.[a-zA-Z_][\w$]*)*|\d+(?:\.\d+)?|<>|!=|<=|>=|\|\||::|./gy;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sql))) {
    const text = match[0];
    if (/^\s|^--|^\/\*/.test(text)) continue;
    const kind = text.startsWith("'") ? 'literal' : /^[\w"`]/.test(text) ? 'word' : 'symbol';
    tokens.push({ text: text.startsWith('`') ? '"' + text.slice(1, -1).replace(/``/g, '""') + '"' : text, kind });
  }
  return tokens;
}

export function postgresQuery(sql: string, bindings: unknown[] = [], lastInsertedId?: number) {
  const tokens = tokenize(sql);
  while (tokens.at(-1)?.text === ';') tokens.pop();
  if (tokens.some(token => token.text === ';')) throw new Error('Multiple SQL statements are not supported');
  const upper = (index: number) => tokens[index]?.kind === 'literal' ? '' : tokens[index]?.text.toUpperCase();
  const ignored = upper(0) === 'INSERT' && upper(1) === 'OR' && upper(2) === 'IGNORE';
  if (ignored) tokens.splice(1, 2);
  const insert = upper(0) === 'INSERT' && upper(1) === 'INTO';
  const table = insert ? tokens[2].text.replace(/^"|"$/g, '') : '';
  const explicitReturning = tokens.some(token => token.kind === 'word' && token.text.toUpperCase() === 'RETURNING');
  const values = [...bindings];
  let position = 0;
  const output: string[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.kind === 'word' && upper(index) === 'CURRENT_TIMESTAMP') {
      output.push('(' + utcText + ')');
    } else if (token.kind === 'word' && upper(index) === 'STRFTIME') {
      const call = tokens.slice(index, index + 6).map(t => t.text).join(' ');
      if (call !== "strftime ( '%Y-%m-%dT%H:%M:%fZ' , 'now' )") throw new Error('Unsupported SQLite date expression');
      output.push("to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')");
      index += 5;
    } else if (token.kind === 'word' && upper(index) === 'LAST_INSERT_ROWID') {
      if (tokens[index + 1]?.text !== '(' || tokens[index + 2]?.text !== ')' || lastInsertedId === undefined) throw new Error('last_insert_rowid requires an atomic batch');
      values.push(lastInsertedId);
      output.push('$' + values.length);
      index += 2;
    } else if (token.text === '?') {
      position++;
      output.push('$' + position + (upper(index + 1) === 'IS' ? '::text' : ''));
    } else if (token.kind === 'word' && upper(index) === 'COLLATE') {
      if (upper(index + 1) !== 'NOCASE' || !['=', '<>', '!='].includes(output.at(-2) ?? '')) throw new Error('Unsupported SQLite collation');
      const right = output.pop()!, operator = output.pop()!, left = output.pop()!;
      output.push(`lower(${left}::text) ${operator} lower(${right}::text)`);
      index++;
    } else if (token.kind === 'word' && upper(index) === 'GLOB') {
      if (tokens[index + 1]?.text !== "'??/??/????'") throw new Error('Unsupported SQLite GLOB expression');
      output.push("LIKE '__/__/____'");
      index++;
    } else if (token.kind === 'word' && upper(index) === 'LIKE') {
      output.push('ILIKE');
    } else {
      output.push(token.text);
    }
  }
  if (position !== bindings.length) throw new Error('SQL parameter count does not match bindings');
  if (ignored) {
    if (explicitReturning) throw new Error('INSERT OR IGNORE with RETURNING is not supported');
    // PostgreSQL requires a WHERE clause to disambiguate INSERT ... SELECT ... ON CONFLICT.
    output.push('ON CONFLICT DO NOTHING');
  }
  const addedReturning = insert && identityTables.has(table) && !explicitReturning;
  if (addedReturning) output.push('RETURNING id');
  return { text: output.join(' '), values, addedReturning, insert };
}

function normalize(rows: Record<string, unknown>[], fields: { name: string; dataTypeID?: number }[] = []) {
  for (const row of rows) for (const field of fields) {
    const value = row[field.name];
    if (value instanceof Date) row[field.name] = value.toISOString().replace('T', ' ').replace(/\.000Z$/, '');
    if (field.dataTypeID === 20 && typeof value === 'string') {
      const number = Number(value);
      if (!Number.isSafeInteger(number)) throw new Error('Database integer exceeds JavaScript safe range');
      row[field.name] = number;
    }
  }
  return rows;
}

class Statement {
  constructor(readonly database: PostgresDatabase, readonly sql: string, readonly values: unknown[] = []) {}
  bind(...values: unknown[]) { return new Statement(this.database, this.sql, values); }
  async all<T = Record<string, unknown>>() { return this.database.execute<T>(this); }
  async run<T = Record<string, unknown>>() { return this.database.execute<T>(this); }
  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const result = await this.all<Record<string, unknown>>();
    const row = result.results[0];
    if (!row) return null;
    if (column !== undefined && !(column in row)) throw new Error('Unknown result column');
    return (column === undefined ? row : row[column]) as T;
  }
  async raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]> {
    const result = await this.all<Record<string, unknown>>();
    const rows = result.results.map(row => Object.values(row));
    if (options?.columnNames && result.results[0]) rows.unshift(Object.keys(result.results[0]));
    return rows as T[];
  }
}

export class PostgresDatabase {
  constructor(private readonly clientFactory: () => SqlClient) {}
  prepare(sql: string) { return new Statement(this, sql); }
  async execute<T>(statement: Statement) { return (await this.batch<T>([statement]))[0]; }
  async batch<T = Record<string, unknown>>(statements: Statement[]) {
    if (!statements.length) return [];
    if (statements.some(statement => !(statement instanceof Statement))) throw new Error('Mixed database batch is not supported');
    const client = this.clientFactory();
    try {
      await client.connect();
      await client.query('BEGIN');
      await client.query("SET LOCAL TIME ZONE 'UTC'");
      const results = [];
      let lastInsertedId = 0;
      for (const statement of statements) {
        const query = postgresQuery(statement.sql, statement.values, lastInsertedId);
        const result = await client.query(query.text, query.values);
        const rows = normalize(result.rows, result.fields);
        if (query.insert && typeof rows[0]?.id === 'number') lastInsertedId = rows[0].id;
        results.push({ success: true as const, results: (query.addedReturning ? [] : rows) as T[], meta: {
          changes: result.command === 'SELECT' ? 0 : result.rowCount ?? 0,
          last_row_id: lastInsertedId, changed_db: result.command !== 'SELECT', duration: 0,
          size_after: 0, rows_read: rows.length, rows_written: result.command === 'SELECT' ? 0 : result.rowCount ?? 0,
        } });
      }
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      await client.end().catch(() => {});
    }
  }
}
