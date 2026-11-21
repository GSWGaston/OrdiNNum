import Link from "next/link";
import { cartao, link, titulo } from "@/components/estilos";
import { marcarFaturaPagaAcao } from "@/app/acoes";
import { Enviar, Form } from "@/components/form";
import { GastoDiario } from "@/components/gasto-diario";
import { FAIXA } from "@/components/credito";
import { BarraObjetivo } from "@/components/objetivos";
import { Alertas } from "@/components/alertas";
import { gerarAlertas } from "@/lib/calculos/alertas";
import { listarConexoes } from "@/lib/dados/conexoes";
import { progressoOrcamentos } from "@/lib/calculos/orcamento";
import { orcamentosVigentes } from "@/lib/dados/orcamentos";
import { resumoCredito } from "@/lib/dados/credito";
import { listarObjetivos } from "@/lib/dados/objetivos";
import { Valor, Vazio } from "@/components/ui";
import { db } from "@/db";
import { hoje, limitesDoMes, mesPorExtenso, mesValido, nomeDoMes, somarDias, somarMesesAoMes } from "@/lib/calculos/datas";
import { despesasPorCategoria, previstosAte, resumoDoMes } from "@/lib/calculos/resumo";
import { listarCartoes } from "@/lib/dados/cartoes";
import { listarCategorias } from "@/lib/dados/categorias";
import { listarContas } from "@/lib/dados/contas";
import { gastoDiarioDoUsuario } from "@/lib/dados/metas";
import { listarRecorrencias } from "@/lib/dados/recorrencias";
import { listarTransacoes } from "@/lib/dados/transacoes";
import { formatarData, formatarReais } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";

export default async function Painel({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const uid = await exigirUsuario();
  const { mes: mesParam } = await searchParams;
  const dia = hoje();
  const mesAtual = dia.slice(0, 7);
  const mes = mesValido(mesParam) ? mesParam : mesAtual;
  const { fim } = limitesDoMes(mes);

  const ehMesAtual = mes === mesAtual;
  const [contas, cartoes, lancamentos, recorrencias, categorias, gastoDoDia, orcamentos, credito, objetivos, conexoes] = await Promise.all([
    listarContas(db, uid, dia),
    listarCartoes(db, uid),
    listarTransacoes(db, uid, { mes }),
    listarRecorrencias(db, uid),
    listarCategorias(db, uid),
    ehMesAtual ? gastoDiarioDoUsuario(db, uid, dia) : null,
    orcamentosVigentes(db, uid, mes),
    resumoCredito(db, uid, mesAtual),
    listarObjetivos(db, uid, dia),
    listarConexoes(db, uid),
  ]);
  const objetivosAtivos = objetivos.filter((o) => o.status === "ativo").slice(0, 3);
  // por cartão, a próxima fatura em aberto (o valor do mês, não o total parcelado)
  const faturasAPagar = (credito?.cartoes ?? []).flatMap((c) => {
    const f = c.faturas.find((x) => x.aberto > 0);
    return f ? [{ id: c.id, cartao: c.nome, vencimento: f.vencimento, aberto: f.aberto, doBanco: c.limiteDisponivelCentavos !== null }] : [];
  });

  if (!contas.length)
    return (
      <Vazio
        titulo="Bem-vindo! Comece criando uma conta."
        texto="Cadastre sua conta corrente, carteira ou vale com o saldo de hoje. Depois é só lançar seus gastos."
        href="/contas"
        acao="Criar primeira conta"
      />
    );

  const saldoAtual = contas.reduce((s, c) => s + c.saldoAtual, 0);
  // faturas abertas entram como compromisso a pagar (a compra já foi despesa no dia em que foi feita)
  const faturas = cartoes.flatMap((c) =>
    c.faturas
      .filter((f) => f.aberto > 0)
      .map((f) => ({ id: `${c.id}-${f.vencimento}`, descricao: `Fatura ${c.nome} de ${mesPorExtenso(f.vencimento)}`, data: f.vencimento, valorCentavos: -f.aberto })),
  );
  const aPagarAte = (ate: string) =>
    [...previstosAte(recorrencias, ate), ...faturas.filter((f) => f.data <= ate)].sort((a, b) => a.data.localeCompare(b.data));
  const previstosMes = ehMesAtual ? aPagarAte(fim) : [];
  const r = resumoDoMes(lancamentos, previstosMes, saldoAtual, dia);
  const porCategoria = despesasPorCategoria(lancamentos, categorias);
  const nomeCat = new Map(categorias.map((c) => [c.id, c]));
  const proximos = aPagarAte(somarDias(dia, 30)).slice(0, 6);

  return (
    <>
      {ehMesAtual && <GastoDiario dados={gastoDoDia} />}
      <Alertas
        alertas={gerarAlertas({
          hoje: dia,
          agora: new Date(),
          gastoDiario: gastoDoDia,
          orcamentos: progressoOrcamentos(orcamentos, lancamentos, categorias).map((p) => ({ ...p, nome: nomeCat.get(p.categoriaId)?.nome ?? "?" })),
          credito: credito?.consolidado ?? null,
          aPagar: aPagarAte(somarDias(dia, 3)),
          conexoes,
        })}
      />
      {credito && (
        <section className={`${cartao} flex flex-col gap-2`} aria-labelledby="faturas">
          {/* no painel vale o que se paga no mês (a parcela), não o total da compra parcelada que o banco tira do limite */}
          <h2 id="faturas" className="text-sm text-zinc-600 dark:text-zinc-400">
            Faturas dos cartões a pagar
          </h2>
          <p className="tabular text-2xl font-bold" data-testid="faturas-a-pagar">
            {formatarReais(faturasAPagar.reduce((s, f) => s + f.aberto, 0))}
          </p>
          {faturasAPagar.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhuma fatura em aberto.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {faturasAPagar.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-x-2">
                  <span>
                    💳 {f.cartao} <span className="text-zinc-600 dark:text-zinc-400">· {mesPorExtenso(f.vencimento)}, vence {formatarData(f.vencimento)}</span>
                    {f.vencimento < dia && <strong className="ml-1 text-red-700 dark:text-red-400">(vencida)</strong>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular">{formatarReais(f.aberto)}</span>
                    {f.doBanco && (
                      <Form action={marcarFaturaPagaAcao}>
                        <input type="hidden" name="id" value={f.id} />
                        <input type="hidden" name="vencimento" value={f.vencimento} />
                        <Enviar className="text-xs underline" confirmar={`Marcar a fatura de ${mesPorExtenso(f.vencimento)} do ${f.cartao} como paga?`}>
                          marcar paga
                        </Enviar>
                      </Form>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Limite usado: {Math.round(credito.consolidado.usoPct)}% ({FAIXA[credito.consolidado.faixa].texto}), já contando{" "}
            {formatarReais(credito.totalParcelasFuturas)} de parcelas dos próximos meses ·{" "}
            <Link href="/credito" className={link}>
              ver limite e parcelas
            </Link>
          </p>
        </section>
      )}
      {objetivosAtivos.length > 0 && (
        <section className={`${cartao} flex flex-col gap-3`} aria-labelledby="objs">
          <h2 id="objs" className="text-sm text-zinc-600 dark:text-zinc-400">
            Objetivos
          </h2>
          {objetivosAtivos.map((o) => (
            <BarraObjetivo key={o.id} o={o} />
          ))}
          <Link href="/objetivos" className={`${link} text-xs`}>
            Guardar dinheiro ou ver todos
          </Link>
        </section>
      )}
      <nav aria-label="Mês" className="flex items-center justify-between">
        <Link href={`/?mes=${somarMesesAoMes(mes, -1)}`} className={link} aria-label="Mês anterior">
          ‹ anterior
        </Link>
        <h1 className={titulo}>{nomeDoMes(mes)}</h1>
        <Link href={`/?mes=${somarMesesAoMes(mes, 1)}`} className={link} aria-label="Próximo mês">
          próximo ›
        </Link>
      </nav>

      <section className={`${cartao} flex flex-col gap-2`} aria-labelledby="saldo-contas-h">
        <h2 id="saldo-contas-h" className="text-sm text-zinc-600 dark:text-zinc-400">
          Saldo em contas hoje
        </h2>
        <p className="text-4xl font-black" data-testid="saldo-contas">
          <Valor centavos={saldoAtual} />
        </p>
        <ul className="flex flex-col gap-1 text-sm">
          {contas.map((c) => (
            <li key={c.id} className="flex justify-between gap-2">
              <span>🏦 {c.nome}</span>
              <Valor centavos={c.saldoAtual} />
            </li>
          ))}
        </ul>
        <Link href="/contas" className={`${link} text-xs`}>
          ver contas
        </Link>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className={cartao}>
          <h2 className="text-sm text-zinc-600 dark:text-zinc-400">Saldo do mês (receitas − despesas)</h2>
          <p className="text-2xl font-bold" data-testid="saldo-mes">
            <Valor centavos={r.saldoMes} />
          </p>
          <p className="tabular text-xs text-zinc-600 dark:text-zinc-400">
            Receitas {formatarReais(r.receitas)} · Despesas {formatarReais(r.despesas)}
          </p>
        </div>
        {ehMesAtual && (
          <div className={cartao}>
            <h2 className="text-sm text-zinc-600 dark:text-zinc-400">Previsão para o fim do mês</h2>
            <p className="text-2xl font-bold">
              <Valor centavos={r.saldoFimDoMes} />
            </p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Saldo de hoje + lançamentos futuros + recorrências e faturas até o fim do mês ({formatarReais(r.previstoReceitas)} a receber,{" "}
              {formatarReais(r.previstoDespesas)} a pagar)
            </p>
          </div>
        )}
      </section>

      <section className={cartao} aria-labelledby="por-categoria">
        <h2 id="por-categoria" className="mb-3 font-semibold">
          Para onde foi o dinheiro
        </h2>
        {porCategoria.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Nenhuma despesa neste mês.{" "}
            <Link href="/lancamentos/novo" className={link}>
              Lance seu primeiro gasto
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {porCategoria.map((p) => {
              const c = p.categoriaId ? nomeCat.get(p.categoriaId) : undefined;
              const pct = Math.round((p.total / r.despesas) * 100);
              return (
                <li key={p.categoriaId ?? "sem"} className="text-sm">
                  <div className="flex justify-between gap-2">
                    <span>
                      <span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: c?.cor ?? "#a1a1aa" }} />
                      {c?.nome ?? "Sem categoria"} <span className="text-zinc-500">({pct}%)</span>
                    </span>
                    <span className="tabular">{formatarReais(p.total)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800" aria-hidden>
                    <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: c?.cor ?? "#a1a1aa" }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={cartao} aria-labelledby="vencimentos">
        <h2 id="vencimentos" className="mb-3 font-semibold">
          Próximos vencimentos (30 dias)
        </h2>
        {proximos.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Nada previsto.{" "}
            <Link href="/recorrencias" className={link}>
              Cadastre aluguel, salário e assinaturas
            </Link>{" "}
            para vê-los aqui.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {proximos.map((p) => (
              <li key={`${p.id}-${p.data}`} className="flex justify-between gap-2">
                <span>
                  <span className="tabular text-zinc-600 dark:text-zinc-400">{formatarData(p.data)}</span> {p.descricao}
                  {p.data < dia && <strong className="ml-1 text-red-700 dark:text-red-400">(atrasada)</strong>}
                </span>
                <Valor centavos={p.valorCentavos} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
