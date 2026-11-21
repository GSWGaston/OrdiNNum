import { and, desc, eq, gte, isNotNull, lte, sum } from "drizzle-orm";
import type { Db } from "@/db";
import { metaMensal, transacao } from "@/db/schema";
import { calcularGastoDiario, type Meta } from "@/lib/calculos/gastoDiario";
import { limitesDoMes } from "@/lib/calculos/datas";
import { previstosAte } from "@/lib/calculos/resumo";
import { listarContas } from "./contas";
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

/** Quanto se deve em cada cartão por compras até `ate` (cartão com crédito sobrando não abate o de outro). */
async function dividaCartoesAte(db: Db, uid: string, ate: string) {
  const porCartao = await db
    .select({ total: sum(transacao.valorCentavos).mapWith(Number) })
    .from(transacao)
    .where(and(eq(transacao.usuarioId, uid), isNotNull(transacao.cartaoId), lte(transacao.data, ate)))
    .groupBy(transacao.cartaoId);
  return porCartao.reduce((s, c) => s + Math.max(0, -c.total), 0);
}

/** Junta os dados do mês e calcula o gasto diário de `hoje`. null se não há meta definida. */
export async function gastoDiarioDoUsuario(db: Db, uid: string, hoje: string) {
  const mes = hoje.slice(0, 7);
  const { inicio, fim } = limitesDoMes(mes);
  const meta = await metaVigente(db, uid, mes);
  if (!meta) return null;
  const [contas, lancamentosMes, recorrencias, dividaCartoes] = await Promise.all([
    listarContas(db, uid, hoje),
    db
      .select()
      .from(transacao)
      .where(and(eq(transacao.usuarioId, uid), gte(transacao.data, inicio), lte(transacao.data, fim))),
    listarRecorrencias(db, uid),
    dividaCartoesAte(db, uid, fim),
  ]);
  const resultado = calcularGastoDiario({
    hoje,
    fimDoMes: fim,
    meta,
    contas,
    lancamentosMes,
    previstos: previstosAte(recorrencias, fim),
    dividaCartoes,
  });
  return { meta, ...resultado };
}
