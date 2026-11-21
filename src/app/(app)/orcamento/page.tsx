import { salvarMeta } from "@/app/acoes";
import { campo, cartao, rotulo, titulo } from "@/components/estilos";
import { Enviar, Form } from "@/components/form";
import { descreverMeta, GastoDiario } from "@/components/gasto-diario";
import { db } from "@/db";
import { hoje, nomeDoMes } from "@/lib/calculos/datas";
import { gastoDiarioDoUsuario } from "@/lib/dados/metas";
import { centavosParaTexto, formatarReais } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";

export const metadata = { title: "Meta do mês" };

export default async function Orcamento() {
  const uid = await exigirUsuario();
  const dia = hoje();
  const mes = dia.slice(0, 7);
  const dados = await gastoDiarioDoUsuario(db, uid, dia);

  return (
    <>
      <h1 className={titulo}>Meta de {nomeDoMes(mes).toLowerCase()}</h1>
      <GastoDiario dados={dados} />

      <section className={cartao} aria-labelledby="def-meta">
        <h2 id="def-meta" className="mb-1 font-semibold">
          {dados ? "Mudar a meta" : "Definir a meta"}
        </h2>
        <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-400">
          Vale para este mês e para os próximos, até você mudar.
        </p>
        <Form action={salvarMeta} className="flex flex-col gap-3">
          <input type="hidden" name="mes" value={mes} />
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Tipo de meta</legend>
            {(
              [
                ["economizar", "Quero economizar", "Quanto você quer ter a mais no fim do mês do que tinha no começo."],
                ["saldo_final", "Quero terminar o mês com", "Quanto você quer ter nas contas no último dia do mês."],
              ] as const
            ).map(([v, r, ajuda]) => (
              <label
                key={v}
                className="flex cursor-pointer gap-2 rounded-lg border border-zinc-300 p-3 has-checked:border-emerald-700 has-checked:bg-emerald-50 dark:border-zinc-700 dark:has-checked:bg-emerald-950"
              >
                <input type="radio" name="modo" value={v} defaultChecked={(dados?.meta.modo ?? "economizar") === v} className="mt-1 accent-emerald-700" />
                <span>
                  <span className="font-medium">{r}</span>
                  <span className="block text-xs text-zinc-600 dark:text-zinc-400">{ajuda}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <label className={rotulo}>
            Valor (R$)
            <input
              name="valor"
              inputMode="decimal"
              required
              defaultValue={dados ? centavosParaTexto(dados.meta.valorCentavos) : ""}
              placeholder="0,00"
              className={`${campo} text-xl`}
            />
          </label>
          <Enviar>Salvar meta</Enviar>
        </Form>
      </section>

      {dados && (
        <section className={cartao} aria-labelledby="conta">
          <h2 id="conta" className="mb-2 font-semibold">
            De onde vem o número
          </h2>
          <dl className="tabular grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
            <dt>Saldo hoje nas contas (sem investimentos)</dt>
            <dd className="text-right">{formatarReais(dados.saldoAtual)}</dd>
            <dt>+ Receitas que ainda vão entrar no mês</dt>
            <dd className="text-right">{formatarReais(dados.receitasRestantes)}</dd>
            <dt>− Contas fixas, parcelas e cartões a pagar</dt>
            <dd className="text-right">{formatarReais(dados.fixasAPagar)}</dd>
            <dt>
              − Meta ({descreverMeta(dados.meta)})
              {dados.meta.modo === "economizar" && (
                <span className="block text-xs text-zinc-600 dark:text-zinc-400">
                  saldo no início do mês {formatarReais(dados.saldoInicioMes)} + meta
                  {dados.guardadoNoMes > 0 ? ` − ${formatarReais(dados.guardadoNoMes)} já guardados em investimento` : ""}
                </span>
              )}
            </dt>
            <dd className="text-right">{formatarReais(dados.alvo)}</dd>
            <dt className="border-t border-zinc-200 pt-1 font-semibold dark:border-zinc-800">= Livre para o dia a dia até o fim do mês</dt>
            <dd className="border-t border-zinc-200 pt-1 text-right font-semibold dark:border-zinc-800">{formatarReais(dados.disponivel)}</dd>
            <dt>÷ Dias que faltam (contando hoje)</dt>
            <dd className="text-right">{dados.dias}</dd>
          </dl>
          <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
            O limite de hoje é calculado como se você ainda não tivesse gastado nada hoje; o que você gastar hoje sai do “ainda pode”.
            Amanhã o limite é recalculado: gastou menos hoje, ele sobe; gastou mais, desce. Compra no cartão conta no dia da compra.
            Contas fixas (recorrências) e parcelas não contam como gasto do dia a dia.
          </p>
        </section>
      )}
    </>
  );
}
