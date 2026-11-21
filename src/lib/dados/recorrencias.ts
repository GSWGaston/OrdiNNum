import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { recorrencia, transacao } from "@/db/schema";
import { proximaData } from "@/lib/calculos/datas";
import { categoriaDoUsuario, contaDoUsuario, ErroDados } from "./comum";

export type DadosRecorrencia = Omit<typeof recorrencia.$inferInsert, "id" | "usuarioId">;

export const listarRecorrencias = (db: Db, uid: string) =>
  db.select().from(recorrencia).where(eq(recorrencia.usuarioId, uid)).orderBy(asc(recorrencia.proximaData));

export async function criarRecorrencia(db: Db, uid: string, d: DadosRecorrencia) {
  await contaDoUsuario(db, uid, d.contaId);
  if (d.categoriaId) await categoriaDoUsuario(db, uid, d.categoriaId);
  await db.insert(recorrencia).values({ ...d, usuarioId: uid });
}

export const excluirRecorrencia = (db: Db, uid: string, id: string) =>
  db.delete(recorrencia).where(and(eq(recorrencia.id, id), eq(recorrencia.usuarioId, uid)));

/**
 * Lança a ocorrência pendente (na data prevista) e avança a próxima data.
 * `valorCentavos` opcional permite ajustar contas variáveis (luz, água); mantém o sinal da recorrência.
 */
export function lancarRecorrencia(db: Db, uid: string, id: string, valorCentavos?: number) {
  return db.transaction(async (tx) => {
    const [r] = await tx
      .select()
      .from(recorrencia)
      .where(and(eq(recorrencia.id, id), eq(recorrencia.usuarioId, uid)));
    if (!r) throw new ErroDados("Recorrência não encontrada.");
    const valor = valorCentavos === undefined ? r.valorCentavos : Math.sign(r.valorCentavos) * Math.abs(valorCentavos);
    await tx.insert(transacao).values({
      usuarioId: uid,
      contaId: r.contaId,
      categoriaId: r.categoriaId,
      recorrenciaId: r.id,
      data: r.proximaData,
      valorCentavos: valor,
      descricao: r.descricao,
    });
    await tx
      .update(recorrencia)
      .set({ proximaData: proximaData(r.proximaData, r.periodicidade) })
      .where(eq(recorrencia.id, r.id));
  });
}
