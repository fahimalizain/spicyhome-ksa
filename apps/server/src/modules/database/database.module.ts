import { Global, Module, OnModuleInit, Inject } from '@nestjs/common';
import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { applyMigrations, findMigrationsDir, seed } from '@spicyhome/db';
import * as fs from 'fs';
import * as path from 'path';

export const DRIZZLE = 'DRIZZLE';

function getDbPath(): string {
  const dbPath = process.env.SPICYHOME_DB || './data/spicyhome.db';
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dbPath;
}

function extractSqlite(db: BetterSQLite3Database<typeof schema>): Database.Database {
  const anyDb = db as any;
  if (anyDb && typeof anyDb.prepare === 'function' && typeof anyDb.exec === 'function') {
    return anyDb as Database.Database;
  }
  const keys = Object.getOwnPropertyNames(anyDb);
  for (const key of keys) {
    const val = anyDb[key];
    if (val && typeof val.prepare === 'function' && typeof val.exec === 'function') {
      return val as Database.Database;
    }
  }
  if (anyDb.session?.client && typeof anyDb.session.client.prepare === 'function') {
    return anyDb.session.client as Database.Database;
  }
  throw new Error('Cannot extract better-sqlite3 instance from drizzle');
}

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      useFactory: (): BetterSQLite3Database<typeof schema> => {
        const dbPath = getDbPath();
        const sqlite = new Database(dbPath);
        sqlite.pragma('journal_mode = WAL');
        sqlite.pragma('foreign_keys = ON');
        return drizzle(sqlite, { schema });
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule implements OnModuleInit {
  constructor(@Inject(DRIZZLE) private db: BetterSQLite3Database<typeof schema>) {}

  async onModuleInit(): Promise<void> {
    let rawDb: Database.Database;
    try {
      rawDb = extractSqlite(this.db);
    } catch {
      return;
    }

    try {
      const migrationsDir = findMigrationsDir();
      applyMigrations(rawDb, migrationsDir);
    } catch (err: any) {
      console.warn('Could not apply migrations, skipping:', err.message);
    }

    const userCount = rawDb
      .prepare('SELECT COUNT(*) as cnt FROM users')
      .get() as { cnt: number };

    if (userCount.cnt === 0) {
      seed(rawDb);
    }

    const dayCount = rawDb
      .prepare('SELECT COUNT(*) as cnt FROM day_openings')
      .get() as { cnt: number };

    if (dayCount.cnt === 0) {
      const now = Math.floor(Date.now() / 1000);
      const today = new Date().toISOString().slice(0, 10);
      rawDb
        .prepare(
          `INSERT INTO day_openings (business_date, status, opening_cash_halalas, opened_at, opened_by, created_at, updated_at)
           VALUES (?, 'open', 0, ?, 1, ?, ?)`,
        )
        .run(today, now, now, now);
    }
  }
}
