import { and, count, eq, gte, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { tentativaLogin } from "@/db/schema";

export const MAX_FALHAS = 5;
export const JANELA_MIN = 15;

/** true se o e-mail errou a senha MAX_FALHAS vezes nos últimos JANELA_MIN minutos. */
export async function loginBloqueado(db: Db, email: string, agora = new Date()) {
  const desde = new Date(agora.getTime() - JANELA_MIN * 60_000);
  const [r] = await db
    .select({ n: count() })
    .from(tentativaLogin)
    .where(and(eq(tentativaLogin.email, email), gte(tentativaLogin.criadoEm, desde)));
  return (r?.n ?? 0) >= MAX_FALHAS;
}

export async function registrarFalha(db: Db, email: string, agora = new Date()) {
  await db.insert(tentativaLogin).values({ email, criadoEm: agora });
  // faxina: falhas com mais de 1 dia não servem para nada
  await db.delete(tentativaLogin).where(lt(tentativaLogin.criadoEm, new Date(agora.getTime() - 86_400_000)));
}

export const limparFalhas = (db: Db, email: string) => db.delete(tentativaLogin).where(eq(tentativaLogin.email, email));
