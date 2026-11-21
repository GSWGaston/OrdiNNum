import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { transacao } from "@/db/schema";
import { somarDias } from "@/lib/calculos/datas";
import { JANELA_DIAS, parearTransferencias } from "@/lib/calculos/transferencias";

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
  return pares.length;
}

/** "É transferência entre minhas contas": tira o lançamento de receitas/despesas (sem par, se não houver). */
export const marcarComoTransferencia = (db: Db, uid: string, id: string) =>
  db
    .update(transacao)
    .set({ transferenciaId: crypto.randomUUID(), categoriaId: null, transferenciaRecusada: false })
    .where(and(eq(transacao.id, id), eq(transacao.usuarioId, uid), isNull(transacao.transferenciaId)));

/** "Não é transferência": desfaz o par inteiro e impede a detecção automática de refazer. */
export async function desfazerTransferencia(db: Db, uid: string, id: string) {
  const [t] = await db
    .select({ transferenciaId: transacao.transferenciaId })
    .from(transacao)
    .where(and(eq(transacao.id, id), eq(transacao.usuarioId, uid)));
  if (!t?.transferenciaId) return;
  await db
    .update(transacao)
    .set({ transferenciaId: null, transferenciaRecusada: true })
    .where(and(eq(transacao.usuarioId, uid), eq(transacao.transferenciaId, t.transferenciaId)));
}
