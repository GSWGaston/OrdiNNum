import Link from "next/link";
import { salvarFaixas } from "@/app/acoes";
import { FAIXA, MedidorCredito } from "@/components/credito";
import { botaoSecundario, campo, cartao, link, rotulo, titulo } from "@/components/estilos";
import { Enviar, Form } from "@/components/form";
import { Vazio } from "@/components/ui";
import { db } from "@/db";
import { hoje, nomeDoMes } from "@/lib/calculos/datas";
import { resumoCredito } from "@/lib/dados/credito";
import { formatarData, formatarReais } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";

export const metadata = { title: "Crédito" };

export default async function Credito() {
  const uid = await exigirUsuario();
  const dia = hoje();
  const mes = dia.slice(0, 7);
  const r = await resumoCredito(db, uid, mes);
  if (!r)
    return <Vazio titulo="Nenhum cartão cadastrado" texto="Cadastre seus cartões de crédito para ver o limite somado e o uso." href="/contas" acao="Cadastrar cartão" />;

  const c = r.consolidado;
  const maiorParcela = Math.max(...r.parcelasFuturas.map((p) => p.total), 1);
  return (
    <>
      <h1 className={titulo}>Crédito</h1>

      <section className={`${cartao} flex flex-col gap-3`} aria-labelledby="consol">
        <h2 id="consol" className="text-sm text-zinc-600 dark:text-zinc-400">
          Uso do limite (todos os cartões)
        </h2>
        <MedidorCredito usoPct={c.usoPct} faixa={c.faixa} faixas={r.faixas} rotulo="Todos os cartões" />
        <dl className="tabular grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-zinc-600 dark:text-zinc-400">Limite total</dt>
            <dd className="font-semibold">{formatarReais(c.limiteTotal)}</dd>
          </div>
          <div>
            <dt className="text-zinc-600 dark:text-zinc-400">Disponível</dt>
            <dd className="font-semibold">{formatarReais(c.disponivel)}</dd>
          </div>
          <div>
            <dt className="text-zinc-600 dark:text-zinc-400">Gasto no crédito em {nomeDoMes(mes).split(" ")[0]!.toLowerCase()}</dt>
            <dd className="font-semibold">{formatarReais(r.gastoNoMes)}</dd>
          </div>
          <div>
            <dt className="text-zinc-600 dark:text-zinc-400">Comprometido em parcelas futuras</dt>
            <dd className="font-semibold">{formatarReais(r.totalParcelasFuturas)}</dd>
          </div>
        </dl>
      </section>

      <section className={`${cartao} flex flex-col gap-4`} aria-labelledby="por-cartao">
        <h2 id="por-cartao" className="font-semibold">
          Por cartão
        </h2>
        {r.cartoes.map((k, i) => {
          const p = c.porCartao[i]!;
          const proxima = k.faturas.find((f) => f.aberto > 0);
          return (
            <div key={k.id} className="flex flex-col gap-1">
              <div className="flex justify-between gap-2 text-sm">
                <span className="font-medium">💳 {k.nome}</span>
                <span className="tabular text-zinc-600 dark:text-zinc-400">
                  {formatarReais(k.disponivel)} livres de {formatarReais(k.limitePessoalCentavos ?? k.limiteTotalCentavos)}
                  {k.limitePessoalCentavos ? " (pessoal)" : ""}
                </span>
              </div>
              <MedidorCredito usoPct={p.usoPct} faixa={p.faixa} faixas={r.faixas} rotulo={k.nome} />
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {proxima
                  ? `Fatura de ${formatarReais(proxima.aberto)} vence ${formatarData(proxima.vencimento)} ${proxima.fechamento ? ` (fecha ${formatarData(proxima.fechamento)})` : ""}`
                  : "Sem fatura aberta"}
              </p>
            </div>
          );
        })}
        <Link href="/contas" className={`${link} text-sm`}>
          Pagar fatura ou editar cartões
        </Link>
      </section>

      <section className={cartao} aria-labelledby="parcelas">
        <h2 id="parcelas" className="mb-3 font-semibold">
          Parcelas futuras por mês
        </h2>
        {r.parcelasFuturas.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhuma parcela de cartão para os próximos meses.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {r.parcelasFuturas.map((p) => (
              <li key={p.mes}>
                <div className="flex justify-between">
                  <span>{nomeDoMes(p.mes)}</span>
                  <span className="tabular">{formatarReais(p.total)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800" aria-hidden>
                  <div className="h-1.5 rounded-full bg-sky-600" style={{ width: `${(p.total / maiorParcela) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={cartao} aria-labelledby="faixas">
        <h2 id="faixas" className="mb-1 font-semibold">
          Faixas do medidor
        </h2>
        <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-400">
          Até a faixa amarela: {FAIXA.verde.texto}. Entre as duas: {FAIXA.amarela.texto}. Acima da vermelha: {FAIXA.vermelha.texto}.
        </p>
        <Form action={salvarFaixas} className="flex flex-wrap items-end gap-2">
          <label className={`${rotulo} w-36`}>
            Amarelo a partir de (%)
            <input name="amarelaPct" type="number" min={1} max={99} required defaultValue={r.faixas.amarelaPct} className={campo} />
          </label>
          <label className={`${rotulo} w-36`}>
            Vermelho a partir de (%)
            <input name="vermelhaPct" type="number" min={2} max={100} required defaultValue={r.faixas.vermelhaPct} className={campo} />
          </label>
          <Enviar className={botaoSecundario}>Salvar faixas</Enviar>
        </Form>
      </section>
    </>
  );
}
