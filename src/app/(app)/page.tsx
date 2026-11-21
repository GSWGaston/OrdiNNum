import Link from "next/link";
import { cartao, link, titulo } from "@/components/estilos";
import { GastoDiario } from "@/components/gasto-diario";
import { Valor, Vazio } from "@/components/ui";
import { db } from "@/db";
import { hoje, limitesDoMes, mesValido, nomeDoMes, somarDias, somarMesesAoMes } from "@/lib/calculos/datas";
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
  const [contas, cartoes, lancamentos, recorrencias, categorias, gastoDoDia] = await Promise.all([
    listarContas(db, uid, dia),
    listarCartoes(db, uid),
    listarTransacoes(db, uid, { mes }),
    listarRecorrencias(db, uid),
    listarCategorias(db, uid),
    ehMesAtual ? gastoDiarioDoUsuario(db, uid, dia) : null,
  ]);

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
      .map((f) => ({ id: `${c.id}-${f.vencimento}`, descricao: `Fatura ${c.nome}`, data: f.vencimento, valorCentavos: -f.aberto })),
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
      <nav aria-label="Mês" className="flex items-center justify-between">
        <Link href={`/?mes=${somarMesesAoMes(mes, -1)}`} className={link} aria-label="Mês anterior">
          ‹ anterior
        </Link>
        <h1 className={titulo}>{nomeDoMes(mes)}</h1>
        <Link href={`/?mes=${somarMesesAoMes(mes, 1)}`} className={link} aria-label="Próximo mês">
          próximo ›
        </Link>
      </nav>

      <section className={`${cartao} flex flex-col gap-1`} aria-labelledby="saldo-mes">
        <h2 id="saldo-mes" className="text-sm text-zinc-600 dark:text-zinc-400">
          Saldo do mês (receitas − despesas)
        </h2>
        <p className="text-4xl font-black" data-testid="saldo-mes">
          <Valor centavos={r.saldoMes} />
        </p>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-zinc-600 dark:text-zinc-400">Receitas</dt>
            <dd className="tabular font-semibold">{formatarReais(r.receitas)}</dd>
          </div>
          <div>
            <dt className="text-zinc-600 dark:text-zinc-400">Despesas</dt>
            <dd className="tabular font-semibold">{formatarReais(r.despesas)}</dd>
          </div>
        </dl>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className={cartao}>
          <h2 className="text-sm text-zinc-600 dark:text-zinc-400">Saldo em contas hoje</h2>
          <p className="text-2xl font-bold" data-testid="saldo-contas">
            <Valor centavos={saldoAtual} />
          </p>
          <Link href="/contas" className={`${link} text-sm`}>
            {contas.length} conta(s)
          </Link>
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
