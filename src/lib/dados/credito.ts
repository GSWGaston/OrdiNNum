import { and, eq, isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import { transacao, usuario } from "@/db/schema";
import { consolidarCredito, FAIXAS_PADRAO, gastoNoCreditoNoMes, parcelasFuturasPorMes, type Faixas } from "@/lib/calculos/credito";
import { listarCartoes } from "./cartoes";
import { ErroDados } from "./comum";

export async function faixasDoUsuario(db: Db, uid: string): Promise<Faixas> {
  const [u] = await db
    .select({ amarelaPct: usuario.faixaAmarelaPct, vermelhaPct: usuario.faixaVermelhaPct })
    .from(usuario)
    .where(eq(usuario.id, uid));
  return u ?? FAIXAS_PADRAO;
}

export async function definirFaixas(db: Db, uid: string, f: Faixas) {
  if (!(f.amarelaPct >= 1 && f.amarelaPct < f.vermelhaPct && f.vermelhaPct <= 100))
    throw new ErroDados("A faixa amarela precisa ser menor que a vermelha (entre 1% e 100%).");
  await db.update(usuario).set({ faixaAmarelaPct: f.amarelaPct, faixaVermelhaPct: f.vermelhaPct }).where(eq(usuario.id, uid));
}

/** Tudo da tela Crédito: consolidado, por cartão, gasto no mês e parcelas futuras. null se não há cartão. */
export async function resumoCredito(db: Db, uid: string, mes: string) {
  const [cartoes, faixas, lancs] = await Promise.all([
    listarCartoes(db, uid),
    faixasDoUsuario(db, uid),
    db
      .select({
        data: transacao.data,
        valorCentavos: transacao.valorCentavos,
        cartaoId: transacao.cartaoId,
        grupoParcelas: transacao.grupoParcelas,
        transferenciaId: transacao.transferenciaId,
        descricao: transacao.descricao,
        parcelaAtual: transacao.parcelaAtual,
        parcelasTotal: transacao.parcelasTotal,
      })
      .from(transacao)
      .where(and(eq(transacao.usuarioId, uid), isNotNull(transacao.cartaoId))),
  ]);
  if (!cartoes.length) return null;
  const parcelas = parcelasFuturasPorMes(lancs, mes);
  return {
    cartoes,
    faixas,
    // com limite pessoal, o uso é medido sobre ele (é o que a pessoa se permite gastar)
    consolidado: consolidarCredito(
      cartoes.map((c) => ({ id: c.id, limiteTotalCentavos: c.limitePessoalCentavos ?? c.limiteTotalCentavos, disponivel: c.disponivel })),
      faixas,
    ),
    gastoNoMes: gastoNoCreditoNoMes(lancs, mes),
    parcelasFuturas: parcelas,
    totalParcelasFuturas: parcelas.reduce((s, p) => s + p.total, 0),
  };
}
