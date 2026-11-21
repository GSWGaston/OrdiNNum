import { and, asc, desc, eq, sum } from "drizzle-orm";
import type { Db } from "@/db";
import { aporteObjetivo, objetivo } from "@/db/schema";
import { resumoObjetivo } from "@/lib/calculos/objetivos";
import { ErroDados } from "./comum";

export type DadosObjetivo = { nome: string; valorAlvoCentavos: number; prazo: string | null };

async function objetivoDoUsuario(db: Db, uid: string, id: string) {
  const [o] = await db.select({ id: objetivo.id }).from(objetivo).where(and(eq(objetivo.id, id), eq(objetivo.usuarioId, uid)));
  if (!o) throw new ErroDados("Objetivo não encontrado.");
}

/** Objetivos com aportes (mais recentes primeiro) e o resumo calculado. Ativos antes dos arquivados. */
export async function listarObjetivos(db: Db, uid: string, hoje: string) {
  const [objs, aportes] = await Promise.all([
    db.select().from(objetivo).where(eq(objetivo.usuarioId, uid)).orderBy(asc(objetivo.status), asc(objetivo.prazo), asc(objetivo.nome)),
    db.select().from(aporteObjetivo).where(eq(aporteObjetivo.usuarioId, uid)).orderBy(desc(aporteObjetivo.data)),
  ]);
  return objs.map((o) => {
    const meus = aportes.filter((a) => a.objetivoId === o.id);
    return { ...o, aportes: meus, ...resumoObjetivo(o, meus, hoje) };
  });
}

export const criarObjetivo = (db: Db, uid: string, d: DadosObjetivo, hoje: string) =>
  db.insert(objetivo).values({ ...d, usuarioId: uid, criadoEm: hoje });

export const atualizarObjetivo = (db: Db, uid: string, id: string, d: DadosObjetivo) =>
  db.update(objetivo).set(d).where(and(eq(objetivo.id, id), eq(objetivo.usuarioId, uid)));

export const arquivarObjetivo = (db: Db, uid: string, id: string, arquivar: boolean) =>
  db.update(objetivo).set({ status: arquivar ? "arquivado" : "ativo" }).where(and(eq(objetivo.id, id), eq(objetivo.usuarioId, uid)));

export const excluirObjetivo = (db: Db, uid: string, id: string) =>
  db.delete(objetivo).where(and(eq(objetivo.id, id), eq(objetivo.usuarioId, uid)));

/** Guardar (valor positivo) ou retirar (negativo) dinheiro de um objetivo. */
export async function aportar(db: Db, uid: string, objetivoId: string, d: { data: string; valorCentavos: number }) {
  await objetivoDoUsuario(db, uid, objetivoId);
  if (!d.valorCentavos) throw new ErroDados("Informe um valor.");
  await db.insert(aporteObjetivo).values({ ...d, objetivoId, usuarioId: uid });
}

export const excluirAporte = (db: Db, uid: string, id: string) =>
  db.delete(aporteObjetivo).where(and(eq(aporteObjetivo.id, id), eq(aporteObjetivo.usuarioId, uid)));

/** Dinheiro separado em objetivos ativos (sai do saldo livre do gasto diário). */
export async function reservadoEmObjetivos(db: Db, uid: string) {
  const porObjetivo = await db
    .select({ total: sum(aporteObjetivo.valorCentavos).mapWith(Number) })
    .from(aporteObjetivo)
    .innerJoin(objetivo, eq(objetivo.id, aporteObjetivo.objetivoId))
    .where(and(eq(aporteObjetivo.usuarioId, uid), eq(objetivo.status, "ativo")))
    .groupBy(aporteObjetivo.objetivoId);
  return porObjetivo.reduce((s, o) => s + Math.max(0, o.total), 0);
}
