import { and, asc, eq, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { recorrencia, transacao } from "@/db/schema";
import { proximaData } from "@/lib/calculos/datas";
import { categoriaDoUsuario, contaDoUsuario, ErroDados } from "./comum";

export type DadosRecorrencia = Omit<typeof recorrencia.$inferInsert, "id" | "usuarioId">;
type Recorrencia = typeof recorrencia.$inferSelect;

export const listarRecorrencias = (db: Db, uid: string) =>
  db.select().from(recorrencia).where(eq(recorrencia.usuarioId, uid)).orderBy(asc(recorrencia.proximaData));

export async function criarRecorrencia(db: Db, uid: string, d: DadosRecorrencia) {
  await contaDoUsuario(db, uid, d.contaId);
  if (d.categoriaId) await categoriaDoUsuario(db, uid, d.categoriaId);
  await db.insert(recorrencia).values({ ...d, usuarioId: uid });
}

export async function atualizarRecorrencia(db: Db, uid: string, id: string, d: DadosRecorrencia) {
  await contaDoUsuario(db, uid, d.contaId);
  if (d.categoriaId) await categoriaDoUsuario(db, uid, d.categoriaId);
  await db.update(recorrencia).set(d).where(and(eq(recorrencia.id, id), eq(recorrencia.usuarioId, uid)));
}

/** Pula a ocorrência pendente (ex.: mês sem cobrança): avança a próxima data sem lançar. */
export async function pularOcorrencia(db: Db, uid: string, id: string) {
  const [r] = await db
    .select()
    .from(recorrencia)
    .where(and(eq(recorrencia.id, id), eq(recorrencia.usuarioId, uid)));
  if (!r) throw new ErroDados("Recorrência não encontrada.");
  await db
    .update(recorrencia)
    .set({ proximaData: proximaData(r.proximaData, r.periodicidade) })
    .where(and(eq(recorrencia.id, r.id), eq(recorrencia.proximaData, r.proximaData)));
}

export const excluirRecorrencia = (db: Db, uid: string, id: string) =>
  db.delete(recorrencia).where(and(eq(recorrencia.id, id), eq(recorrencia.usuarioId, uid)));

export const definirAutomatica = (db: Db, uid: string, id: string, automatica: boolean) =>
  db.update(recorrencia).set({ automatica }).where(and(eq(recorrencia.id, id), eq(recorrencia.usuarioId, uid)));

/**
 * Avança a próxima data só se ela ainda for a que lemos (update condicional) e então lança.
 * Duas requisições ao mesmo tempo não duplicam: a segunda não acha a linha e não lança.
 */
async function lancarOcorrencia(db: Db, r: Recorrencia, valorCentavos: number) {
  const [ok] = await db
    .update(recorrencia)
    .set({ proximaData: proximaData(r.proximaData, r.periodicidade) })
    .where(and(eq(recorrencia.id, r.id), eq(recorrencia.proximaData, r.proximaData)))
    .returning({ id: recorrencia.id });
  if (!ok) return false;
  await db.insert(transacao).values({
    usuarioId: r.usuarioId,
    contaId: r.contaId,
    categoriaId: r.categoriaId,
    recorrenciaId: r.id,
    data: r.proximaData,
    valorCentavos,
    descricao: r.descricao,
  });
  return true;
}

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
    await lancarOcorrencia(tx, r, valor);
  });
}

/** Lança sozinhas as recorrências automáticas vencidas até `hoje`, inclusive meses atrasados. */
export async function lancarVencidas(db: Db, uid: string, hoje: string) {
  const vencidas = await db
    .select()
    .from(recorrencia)
    .where(and(eq(recorrencia.usuarioId, uid), eq(recorrencia.automatica, true), lte(recorrencia.proximaData, hoje)));
  for (const r of vencidas)
    await db.transaction(async (tx) => {
      // shortcut: no máximo 400 ocorrências por chamada (8 anos semanais); o resto sai na próxima visita
      for (let atual = r, i = 0; atual.proximaData <= hoje && i < 400; i++) {
        if (!(await lancarOcorrencia(tx, atual, atual.valorCentavos))) break;
        atual = { ...atual, proximaData: proximaData(atual.proximaData, atual.periodicidade) };
      }
    });
}
