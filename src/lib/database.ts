import { Pool } from "pg";

type GlobalDatabaseState = typeof globalThis & {
  __arsenalParadeDbPool?: Pool | null;
  __arsenalParadeDbInitPromise?: Promise<void> | null;
};

const runtimeState = globalThis as GlobalDatabaseState;

export function hasDatabaseConnection() {
  return Boolean(process.env.DATABASE_URL);
}

function getPool() {
  if (!hasDatabaseConnection()) {
    return null;
  }

  if (runtimeState.__arsenalParadeDbPool) {
    return runtimeState.__arsenalParadeDbPool;
  }

  runtimeState.__arsenalParadeDbPool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  return runtimeState.__arsenalParadeDbPool;
}

async function ensureDatabaseInitialized() {
  const pool = getPool();

  if (!pool) {
    return;
  }

  if (!runtimeState.__arsenalParadeDbInitPromise) {
    runtimeState.__arsenalParadeDbInitPromise = pool
      .query(`
        create table if not exists app_state (
          key text primary key,
          value jsonb not null,
          updated_at timestamptz not null default now()
        )
      `)
      .then(() => undefined);
  }

  await runtimeState.__arsenalParadeDbInitPromise;
}

export async function readDatabaseState<T>(key: string) {
  const pool = getPool();

  if (!pool) {
    return null;
  }

  await ensureDatabaseInitialized();
  const result = await pool.query<{ value: T }>("select value from app_state where key = $1 limit 1", [key]);
  return result.rows[0]?.value ?? null;
}

export async function writeDatabaseState(key: string, value: unknown) {
  const pool = getPool();

  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }

  await ensureDatabaseInitialized();
  await pool.query(
    `
      insert into app_state (key, value, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (key)
      do update set value = excluded.value, updated_at = now()
    `,
    [key, JSON.stringify(value)]
  );
}
