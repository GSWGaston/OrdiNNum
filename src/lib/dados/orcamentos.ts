import { and, desc, eq, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { orcamentoCategoria } from "@/db/schema";
import { categoriaDoUsuario, ErroDados } from "./comum";

/** Define o limite de uma categoria a partir de `mes` (0 = tirar o limite). Só categorias de despesa. */
export async function definirOrcamento(db: Db, uid: string, mes: string, categoriaId: string, limiteCentavos: number) {
  const c = await categoriaDoUsuario(db, uid, categoriaId);
  if (c.tipo !== "despesa") throw new ErroDados("Limite só vale para categorias de despesa.");
  await db
    .insert(orcamentoCategoria)
    .values({ usuarioId: uid, categoriaId, mes, limiteCentavos })
    .onConflictDoUpdate({ target: [orcamentoCategoria.usuarioId, orcamentoCategoria.categoriaId, orcamentoCategoria.mes], set: { limiteCentavos } });
}

/** Limites valendo no mês: para cada categoria, o registro mais recente até `mes`. */
export async function orcamentosVigentes(db: Db, uid: string, mes: string) {
  const todos = await db
    .select()
    .from(orcamentoCategoria)
    .where(and(eq(orcamentoCategoria.usuarioId, uid), lte(orcamentoCategoria.mes, mes)))
    .orderBy(desc(orcamentoCategoria.mes));
  const vistos = new Set<string>();
  return todos.filter((o) => !vistos.has(o.categoriaId) && vistos.add(o.categoriaId));
}
