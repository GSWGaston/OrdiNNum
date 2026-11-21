import { pagarFaturaAcao, removerCartao, removerConta, salvarCartao, salvarConta } from "@/app/acoes";
import { botaoPerigo, botaoSecundario, campo, cartao, rotulo, titulo } from "@/components/estilos";
import { Enviar, Form } from "@/components/form";
import { SelectConta, TIPOS_CONTA, Valor } from "@/components/ui";
import { db } from "@/db";
import { hoje } from "@/lib/calculos/datas";
import { listarCartoes } from "@/lib/dados/cartoes";
import { listarContas } from "@/lib/dados/contas";
import { centavosParaTexto, formatarData, formatarReais } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";

export const metadata = { title: "Contas" };

function CamposConta({ c }: { c?: { id: string; nome: string; tipo: keyof typeof TIPOS_CONTA; saldoCentavos: number } }) {
  return (
    <>
      {c && <input type="hidden" name="id" value={c.id} />}
      <label className={rotulo}>
        Nome
        <input name="nome" required maxLength={80} defaultValue={c?.nome} placeholder="Ex.: Nubank, Carteira" className={campo} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={rotulo}>
          Tipo
          <select name="tipo" defaultValue={c?.tipo ?? "corrente"} className={campo}>
            {Object.entries(TIPOS_CONTA).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className={rotulo}>
          Saldo de abertura (R$)
          <input name="saldo" inputMode="decimal" defaultValue={c ? centavosParaTexto(c.saldoCentavos) : ""} placeholder="0,00" className={campo} />
        </label>
      </div>
    </>
  );
}

const BANDEIRAS = ["Visa", "Mastercard", "Elo", "American Express", "Hipercard", "Outra"];

type CartaoForm = { id: string; nome: string; bandeira: string; limiteTotalCentavos: number; diaFechamento: number; diaVencimento: number };

function CamposCartao({ c }: { c?: CartaoForm }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {c && <input type="hidden" name="id" value={c.id} />}
      <label className={rotulo}>
        Nome
        <input name="nome" required maxLength={80} defaultValue={c?.nome} placeholder="Ex.: Nubank" className={campo} />
      </label>
      <label className={rotulo}>
        Bandeira
        <select name="bandeira" defaultValue={c?.bandeira ?? "Mastercard"} className={campo}>
          {BANDEIRAS.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </label>
      <label className={`${rotulo} col-span-2`}>
        Limite total (R$)
        <input name="limite" inputMode="decimal" required defaultValue={c ? centavosParaTexto(c.limiteTotalCentavos) : ""} placeholder="0,00" className={campo} />
      </label>
      <label className={rotulo}>
        Dia do fechamento
        <input name="diaFechamento" type="number" min={1} max={31} required defaultValue={c?.diaFechamento} className={campo} />
      </label>
      <label className={rotulo}>
        Dia do vencimento
        <input name="diaVencimento" type="number" min={1} max={31} required defaultValue={c?.diaVencimento} className={campo} />
      </label>
    </div>
  );
}

export default async function Contas() {
  const uid = await exigirUsuario();
  const dia = hoje();
  const [contas, cartoes] = await Promise.all([listarContas(db, uid, dia), listarCartoes(db, uid)]);
  const total = contas.reduce((s, c) => s + c.saldoAtual, 0);

  return (
    <>
      <h1 className={titulo}>Contas e carteiras</h1>
      {contas.length > 0 && (
        <p className="text-sm">
          Total hoje: <Valor centavos={total} className="font-bold" />
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {contas.map((c) => (
          <li key={c.id} className={cartao}>
            <details>
              <summary className="flex cursor-pointer list-none justify-between gap-2">
                <span className="flex flex-col">
                  <span className="font-semibold">{c.nome}</span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">{TIPOS_CONTA[c.tipo]}</span>
                </span>
                <Valor centavos={c.saldoAtual} className="font-bold" />
              </summary>
              <Form action={salvarConta} className="mt-3 flex flex-col gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <CamposConta c={c} />
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Saldo de abertura = quanto havia antes do primeiro lançamento. O saldo atual soma os lançamentos até hoje.
                </p>
                <Enviar>Salvar</Enviar>
              </Form>
              <Form action={removerConta} className="mt-2">
                <input type="hidden" name="id" value={c.id} />
                <Enviar className={botaoPerigo} confirmar={`Excluir "${c.nome}"? Os lançamentos e recorrências dela também serão apagados.`}>
                  Excluir conta
                </Enviar>
              </Form>
            </details>
          </li>
        ))}
      </ul>

      <section className={cartao} aria-labelledby="nova-conta">
        <h2 id="nova-conta" className="mb-3 font-semibold">
          {contas.length ? "Adicionar conta" : "Crie sua primeira conta"}
        </h2>
        <Form action={salvarConta} className="flex flex-col gap-3">
          <CamposConta />
          <Enviar>Adicionar</Enviar>
        </Form>
      </section>
      <h2 className={`${titulo} mt-4`}>Cartões de crédito</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Compra no cartão conta como gasto no dia da compra. A fatura aparece como conta a pagar e, ao pagar, o dinheiro sai da
        conta sem contar de novo como despesa.
      </p>
      <ul className="flex flex-col gap-2">
        {cartoes.map((c) => {
          const abertas = c.faturas.filter((f) => f.aberto > 0);
          const aPagar = abertas[0];
          const depois = abertas.slice(1).reduce((s, f) => s + f.aberto, 0);
          const vencida = aPagar && aPagar.vencimento < dia;
          return (
            <li key={c.id} className={cartao}>
              <details>
                <summary className="flex cursor-pointer list-none justify-between gap-2">
                  <span className="flex flex-col">
                    <span className="font-semibold">💳 {c.nome}</span>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      {c.bandeira} · fecha dia {c.diaFechamento}, vence dia {c.diaVencimento}
                    </span>
                  </span>
                  <span className="text-right text-sm">
                    {aPagar ? (
                      <>
                        <span className="tabular block font-bold">{formatarReais(aPagar.aberto)}</span>
                        <span className={`text-xs ${vencida ? "font-bold text-red-700 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"}`}>
                          {vencida ? "vencida em" : "vence"} {formatarData(aPagar.vencimento)}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">sem fatura aberta</span>
                    )}
                  </span>
                </summary>
                <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
                  <div>
                    <dt className="text-zinc-600 dark:text-zinc-400">Limite disponível</dt>
                    <dd className="tabular font-semibold">
                      {formatarReais(c.disponivel)} de {formatarReais(c.limiteTotalCentavos)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-600 dark:text-zinc-400">Uso do limite</dt>
                    <dd className="tabular font-semibold">{Math.round(c.usoPct)}%</dd>
                  </div>
                  {aPagar && (
                    <div>
                      <dt className="text-zinc-600 dark:text-zinc-400">Fatura que fecha {formatarData(aPagar.fechamento)}</dt>
                      <dd className="tabular font-semibold">{formatarReais(aPagar.aberto)}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-zinc-600 dark:text-zinc-400">Faturas seguintes (parcelas e compras novas)</dt>
                    <dd className="tabular font-semibold">{formatarReais(depois)}</dd>
                  </div>
                </dl>

                {aPagar && contas.length > 0 && (
                  <Form action={pagarFaturaAcao} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="cartaoId" value={c.id} />
                    <label className={`${rotulo} w-32`}>
                      Valor pago
                      <input name="valor" inputMode="decimal" required defaultValue={centavosParaTexto(aPagar.aberto)} className={campo} />
                    </label>
                    <label className={`${rotulo} min-w-36 flex-1`}>
                      Pago com
                      <SelectConta contas={contas} defaultValue={(contas.find((x) => x.tipo === "corrente") ?? contas[0])?.id} />
                    </label>
                    <label className={rotulo}>
                      Data
                      <input name="data" type="date" required defaultValue={dia} className={campo} />
                    </label>
                    <Enviar className={botaoSecundario}>Registrar pagamento</Enviar>
                  </Form>
                )}

                <Form action={salvarCartao} className="mt-3 flex flex-col gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                  <CamposCartao c={c} />
                  <Enviar>Salvar cartão</Enviar>
                </Form>
                <Form action={removerCartao} className="mt-2">
                  <input type="hidden" name="id" value={c.id} />
                  <Enviar className={botaoPerigo} confirmar={`Excluir "${c.nome}"? As compras e pagamentos registrados nele também serão apagados.`}>
                    Excluir cartão
                  </Enviar>
                </Form>
              </details>
            </li>
          );
        })}
      </ul>
      <section className={cartao} aria-labelledby="novo-cartao">
        <h2 id="novo-cartao" className="mb-3 font-semibold">
          Adicionar cartão de crédito
        </h2>
        <Form action={salvarCartao} className="flex flex-col gap-3">
          <CamposCartao />
          <Enviar>Adicionar cartão</Enviar>
        </Form>
      </section>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">O botão “Conectar banco” chega na fase 3 (Open Finance).</p>
    </>
  );
}
