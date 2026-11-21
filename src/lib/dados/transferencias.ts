import { and, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { categoria, transacao } from "@/db/schema";
import { somarDias } from "@/lib/calculos/datas";
import { JANELA_DIAS, parearTransferencias } from "@/lib/calculos/transferencias";
import { ErroDados } from "./comum";

/**
 * Junta como transferência os pares saída/entrada de mesmo valor entre contas/cartões do usuário desde `desde`
 * (ex.: Pix do Inter que paga a fatura do Nubank). Roda a cada sincronização. Devolve quantos pares marcou.
 */
export async function detectarTransferencias(db: Db, uid: string, desde: string) {
  const candidatos = await db
    .select({ id: transacao.id, data: transacao.data, valorCentavos: transacao.valorCentavos, contaId: transacao.contaId, cartaoId: transacao.cartaoId })
    .from(transacao)
    .where(
      and(
        eq(transacao.usuarioId, uid),
        isNull(transacao.transferenciaId),
        eq(transacao.transferenciaRecusada, false),
        gte(transacao.data, somarDias(desde, -JANELA_DIAS)),
      ),
    );
  const pares = parearTransferencias(candidatos);
  for (const par of pares)
    await db
      .update(transacao)
      .set({ transferenciaId: crypto.randomUUID(), categoriaId: null })
      .where(and(eq(transacao.usuarioId, uid), inArray(transacao.id, par)));
  await categorizarPagamentosDeFatura(db, uid);
  return pares.length;
}

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

/**
 * Transferências que tocam um cartão (pagamento de fatura, dos dois lados) e estão sem categoria ganham a categoria
 * "Fatura" do usuário, se ele tiver uma (de preferência a principal). Não mexe em categoria já escolhida.
 */
export async function categorizarPagamentosDeFatura(db: Db, uid: string) {
  const fatura = (await db.select().from(categoria).where(eq(categoria.usuarioId, uid)))
    .filter((c) => normalizar(c.nome) === "fatura")
    .sort((a, b) => Number(!!a.paiId) - Number(!!b.paiId))[0];
  if (!fatura) return 0;
  const comCartao = db
    .select({ t: transacao.transferenciaId })
    .from(transacao)
    .where(and(eq(transacao.usuarioId, uid), isNotNull(transacao.cartaoId), isNotNull(transacao.transferenciaId)));
  const r = await db
    .update(transacao)
    .set({ categoriaId: fatura.id })
    .where(and(eq(transacao.usuarioId, uid), isNull(transacao.categoriaId), inArray(transacao.transferenciaId, comCartao)))
    .returning({ id: transacao.id });
  return r.length;
}

/** "É transferência entre minhas contas": tira o lançamento de receitas/despesas (sem par, se não houver). */
export const marcarComoTransferencia = (db: Db, uid: string, id: string) =>
  db
    .update(transacao)
    .set({ transferenciaId: crypto.randomUUID(), categoriaId: null, transferenciaRecusada: false })
    .where(and(eq(transacao.id, id), eq(transacao.usuarioId, uid), isNull(transacao.transferenciaId)));

/** Vincula um gasto ao seu reembolso (sinais opostos, ambos livres): os dois saem de receitas/despesas. */
export async function vincularReembolso(db: Db, uid: string, idA: string, idB: string) {
  const ls = await db
    .select({ id: transacao.id, valorCentavos: transacao.valorCentavos, transferenciaId: transacao.transferenciaId })
    .from(transacao)
    .where(and(eq(transacao.usuarioId, uid), inArray(transacao.id, [idA, idB])));
  if (ls.length !== 2 || idA === idB) throw new ErroDados("Lançamento não encontrado.");
  if (ls.some((l) => l.transferenciaId)) throw new ErroDados("Um dos lançamentos já está vinculado.");
  if (Math.sign(ls[0]!.valorCentavos) === Math.sign(ls[1]!.valorCentavos)) throw new ErroDados("Vincule uma saída a uma entrada.");
  await db
    .update(transacao)
    .set({ transferenciaId: crypto.randomUUID(), reembolso: true })
    .where(and(eq(transacao.usuarioId, uid), inArray(transacao.id, [idA, idB])));
}

/** "Não é transferência": desfaz o par inteiro e impede a detecção automática de refazer. */
export async function desfazerTransferencia(db: Db, uid: string, id: string) {
  const [t] = await db
    .select({ transferenciaId: transacao.transferenciaId })
    .from(transacao)
    .where(and(eq(transacao.id, id), eq(transacao.usuarioId, uid)));
  if (!t?.transferenciaId) return;
  await db
    .update(transacao)
    .set({ transferenciaId: null, transferenciaRecusada: true, reembolso: false })
    .where(and(eq(transacao.usuarioId, uid), eq(transacao.transferenciaId, t.transferenciaId)));
}
