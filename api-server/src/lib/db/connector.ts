import knex, { Knex } from "knex";

const dbInstances = new Map<string, Knex>();

export function getPgDb(dbUrl: string): Knex {
  if (!dbUrl) {
    throw new Error("Database URL is required for getPgDb");
  }

  const existing = dbInstances.get(dbUrl);
  if (existing) return existing;

  const knexConfig: Knex.Config = {
    client: "pg",
    connection: dbUrl,
    pool: {
      min: 0,
      max: 5,
      afterCreate: (
        conn: any,
        done: (err: Error | null, connection?: any) => void,
      ): void => {
        // Force every connection to use UTC so timestamp fields stay consistent.
        conn
          .query("SET TIME ZONE 'UTC'")
          .then(() => done(null, conn))
          .catch((err: Error) => done(err, conn));
      },
    },
    debug: process.env.KNEX_DEBUG === "true",
  };

  const db = knex(knexConfig);
  dbInstances.set(dbUrl, db);
  return db;
}

export async function closeDb(dbUrl: string): Promise<void> {
  const db = dbInstances.get(dbUrl);
  if (db) {
    await db.destroy();
    dbInstances.delete(dbUrl);
  }
}

export async function closeAll(): Promise<void> {
  const closers = Array.from(dbInstances.values()).map((db) => db.destroy());
  await Promise.allSettled(closers);
  dbInstances.clear();
}
