import { and, desc, eq, gte, isNotNull, lte, sum } from "drizzle-orm";
import type { Db } from "@/db";
import { metaMensal, transacao } from "@/db/schema";
import { calcularGastoDiario, type Meta } from "@/lib/calculos/gastoDiario";
import { limitesDoMes } from "@/lib/calculos/datas";
import { previstosAte } from "@/lib/calculos/resumo";
import { listarCartoes } from "./cartoes";
import { listarContas } from "./contas";
import { reservadoEmObjetivos } from "./objetivos";
import { listarRecorrencias } from "./recorrencias";

/** Define a meta de um mês (substitui a que existir). */
export const definirMeta = (db: Db, uid: string, mes: string, meta: Meta) =>
  db
    .insert(metaMensal)
    .values({ usuarioId: uid, mes, ...meta })
    .onConflictDoUpdate({ target: [metaMensal.usuarioId, metaMensal.mes], set: meta });

/** Meta do mês; se o mês ainda não tem, vale a do último mês que teve (herdada = true). */
export async function metaVigente(db: Db, uid: string, mes: string) {
  const [m] = await db
    .select()
    .from(metaMensal)
    .where(and(eq(metaMensal.usuarioId, uid), lte(metaMensal.mes, mes)))
    .orderBy(desc(metaMensal.mes))
    .limit(1);
  return m ? { modo: m.modo, valorCentavos: m.valorCentavos, herdada: m.mes !== mes } : null;
}

/**
 * Quanto se deve nos cartões até o fim do mês (cartão com crédito sobrando não abate o de outro).
 * Manual: compras - pagamentos até `ate` (parcelas de meses seguintes têm data futura e ficam de fora).
 * Do banco: a fatura do mês calculada em resumoDoCartao (limite usado - parcelas dos próximos meses).
 */
async function dividaCartoesAte(db: Db, uid: string, ate: string) {
  const [cartoes, somas] = await Promise.all([
    listarCartoes(db, uid),
    db
      .select({ cartaoId: transacao.cartaoId, total: sum(transacao.valorCentavos).mapWith(Number) })
      .from(transacao)
      .where(and(eq(transacao.usuarioId, uid), isNotNull(transacao.cartaoId), lte(transacao.data, ate)))
      .groupBy(transacao.cartaoId),
  ]);
  const soma = new Map(somas.map((p) => [p.cartaoId, p.total]));
  return cartoes.reduce(
    (s, c) => s + (c.limiteDisponivelCentavos !== null ? (c.faturas[0]?.aberto ?? 0) : Math.max(0, -(soma.get(c.id) ?? 0))),
    0,
  );
}

/** Junta os dados do mês e calcula o gasto diário de `hoje`. null se não há meta definida. */
export async function gastoDiarioDoUsuario(db: Db, uid: string, hoje: string) {
  const mes = hoje.slice(0, 7);
  const { inicio, fim } = limitesDoMes(mes);
  const meta = await metaVigente(db, uid, mes);
  if (!meta) return null;
  const [contas, lancamentosMes, recorrencias, dividaCartoes, reservadoObjetivos] = await Promise.all([
    listarContas(db, uid, hoje),
    db
      .select()
      .from(transacao)
      .where(and(eq(transacao.usuarioId, uid), gte(transacao.data, inicio), lte(transacao.data, fim))),
    listarRecorrencias(db, uid),
    dividaCartoesAte(db, uid, fim),
    reservadoEmObjetivos(db, uid),
  ]);
  const resultado = calcularGastoDiario({
    hoje,
    fimDoMes: fim,
    meta,
    contas,
    lancamentosMes,
    previstos: previstosAte(recorrencias, fim),
    dividaCartoes,
    reservadoObjetivos,
  });
  return { meta, ...resultado };
}
