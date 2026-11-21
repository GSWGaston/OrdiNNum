import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleLite } from "drizzle-orm/pglite";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

function criar(): Db {
  const url = process.env.DATABASE_URL;
  if (url) return drizzlePg({ connection: url, schema, casing: "snake_case" });
  // shortcut: sem DATABASE_URL usa PGlite (Postgres embutido em arquivo, um processo só); produção usa Neon/Supabase.
  return drizzleLite({
    client: new PGlite(process.env.PGLITE_DIR ?? "./.pglite"),
    schema,
    casing: "snake_case",
  }) as unknown as Db;
}

// Abre só no primeiro uso: o build importa este módulo em vários workers e o PGlite não aceita abrir o mesmo diretório em paralelo.
const g = globalThis as unknown as { __db?: Db };
export const db = new Proxy({} as Db, {
  get(_, k) {
    const real = (g.__db ??= criar());
    const v = Reflect.get(real, k);
    return typeof v === "function" ? v.bind(real) : v;
  },
});
