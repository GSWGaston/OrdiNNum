import Link from "next/link";
import { marcarFaturaPagaAcao, pagarFaturaAcao, removerCartao, removerConta, salvarCartao, salvarConta, transferirAcao } from "@/app/acoes";
import { botaoPerigo, botaoSecundario, campo, cartao, link, rotulo, titulo } from "@/components/estilos";
import { Enviar, Form } from "@/components/form";
import { SelectConta, TIPOS_CONTA, Valor } from "@/components/ui";
import { db } from "@/db";
import { hoje, mesPorExtenso } from "@/lib/calculos/datas";
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

type CartaoForm = {
  id: string;
  nome: string;
  bandeira: string;
  limiteTotalCentavos: number;
  diaFechamento: number;
  diaVencimento: number;
  conexaoId?: string | null;
  limitePessoalCentavos?: number | null;
};

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
      <label className={rotulo}>
        Limite do cartão (R$)
        {c?.conexaoId ? (
          <>
            <input type="hidden" name="limite" value={centavosParaTexto(c.limiteTotalCentavos)} />
            <span className={`${campo} opacity-70`}>{formatarReais(c.limiteTotalCentavos)}</span>
            <span className="text-xs font-normal text-zinc-600 dark:text-zinc-400">informado pelo banco</span>
          </>
        ) : (
          <input name="limite" inputMode="decimal" required defaultValue={c ? centavosParaTexto(c.limiteTotalCentavos) : ""} placeholder="0,00" className={campo} />
        )}
      </label>
      <label className={rotulo}>
        Limite pessoal (opcional)
        <input
          name="limitePessoal"
          inputMode="decimal"
          defaultValue={c?.limitePessoalCentavos ? centavosParaTexto(c.limitePessoalCentavos) : ""}
          placeholder="ex.: 400,00"
          className={campo}
        />
        <span className="text-xs font-normal text-zinc-600 dark:text-zinc-400">Quanto você se permite usar, se for menos que o limite</span>
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
      <div className="flex items-center justify-between gap-2">
        <h1 className={titulo}>Contas e carteiras</h1>
        <Link href="/bancos" className={botaoSecundario}>
          🏦 Conectar banco
        </Link>
      </div>
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
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {TIPOS_CONTA[c.tipo]}
                    {c.origem === "open_finance" && " · 🔗 saldo do banco"}
                  </span>
                </span>
                <Valor centavos={c.saldoAtual} className="font-bold" />
              </summary>
              {c.origem === "open_finance" ? (
                <Form action={salvarConta} className="mt-3 flex flex-col gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="tipo" value={c.tipo} />
                  <input type="hidden" name="saldo" value="0" />
                  <label className={rotulo}>
                    Nome
                    <input name="nome" required maxLength={80} defaultValue={c.nome} className={campo} />
                  </label>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    Conta ligada ao banco: saldo e lançamentos vêm de lá. Para remover, desconecte em{" "}
                    <Link href="/bancos" className={link}>
                      Bancos
                    </Link>
                    .
                  </p>
                  <Enviar>Renomear</Enviar>
                </Form>
              ) : (
              <>
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
              </>
              )}
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
      {contas.length > 1 && (
        <section className={cartao} aria-labelledby="transferir">
          <h2 id="transferir" className="mb-1 font-semibold">
            Transferir entre contas
          </h2>
          <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-400">
            Ex.: da corrente para a poupança. Só move o dinheiro: não conta como receita nem despesa.
          </p>
          <Form action={transferirAcao} className="grid grid-cols-2 gap-3">
            <label className={rotulo}>
              De
              <SelectConta contas={contas} name="deContaId" defaultValue={contas[0]!.id} />
            </label>
            <label className={rotulo}>
              Para
              <SelectConta contas={contas} name="paraContaId" defaultValue={contas[1]!.id} />
            </label>
            <label className={rotulo}>
              Valor (R$)
              <input name="valor" inputMode="decimal" required placeholder="0,00" className={campo} />
            </label>
            <label className={rotulo}>
              Data
              <input name="data" type="date" required defaultValue={dia} className={campo} />
            </label>
            <label className={`${rotulo} col-span-2`}>
              Descrição (opcional)
              <input name="descricao" maxLength={200} placeholder="Transferência" className={campo} />
            </label>
            <div className="col-span-2">
              <Enviar>Transferir</Enviar>
            </div>
          </Form>
        </section>
      )}

      <div className="mt-4 flex items-baseline justify-between gap-2">
        <h2 className={titulo}>Cartões de crédito</h2>
        {cartoes.length > 0 && (
          <Link href="/credito" className={`${link} text-sm`}>
            Ver uso total
          </Link>
        )}
      </div>
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
                      {formatarReais(c.disponivel)} de {formatarReais(c.limitePessoalCentavos ?? c.limiteTotalCentavos)}
                      {c.limitePessoalCentavos ? " (limite pessoal)" : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-600 dark:text-zinc-400">Uso do limite</dt>
                    <dd className="tabular font-semibold">{Math.round(c.usoPct)}%</dd>
                  </div>
                  {aPagar && (
                    <div>
                      <dt className="text-zinc-600 dark:text-zinc-400">
                        {aPagar.fechamento ? `Fatura que fecha ${formatarData(aPagar.fechamento)}` : `Fatura de ${mesPorExtenso(aPagar.vencimento)}`}
                      </dt>
                      <dd className="tabular font-semibold">{formatarReais(aPagar.aberto)}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-zinc-600 dark:text-zinc-400">Faturas seguintes (parcelas e compras novas)</dt>
                    <dd className="tabular font-semibold">{formatarReais(depois)}</dd>
                  </div>
                </dl>
                {c.conexaoId && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">Como a fatura foi calculada</summary>
                    <dl className="tabular mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
                      <dt>Disponível informado pelo banco</dt>
                      <dd className="text-right">{formatarReais(c.limiteDisponivelCentavos ?? 0)}</dd>
                      <dt>Calculado sobre</dt>
                      <dd className="text-right">
                        {c.base === "pessoal" ? `o limite pessoal (${formatarReais(c.limitePessoalCentavos ?? 0)})` : `o limite do cartão (${formatarReais(c.limiteTotalCentavos)})`}
                      </dd>
                      <dt>Usado</dt>
                      <dd className="text-right">{formatarReais(c.devido)}</dd>
                      <dt>− Parcelas dos próximos meses</dt>
                      <dd className="text-right">{formatarReais(c.parcelasFuturas)}</dd>
                      <dt className="font-semibold">= Fatura do mês</dt>
                      <dd className="text-right font-semibold">{formatarReais(c.faturas[0]?.aberto ?? 0)}</dd>
                      <dt className="text-zinc-500">Campo “fatura” do banco (não usado)</dt>
                      <dd className="text-right text-zinc-500">{c.faturaAbertaCentavos ? formatarReais(c.faturaAbertaCentavos) : "—"}</dd>
                    </dl>
                  </details>
                )}

                {c.limiteDisponivelCentavos !== null && (aPagar || c.faturaPaga) && (
                  <Form action={marcarFaturaPagaAcao} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <input type="hidden" name="id" value={c.id} />
                    {c.faturaPaga ? (
                      <>
                        <span>✓ Fatura de {mesPorExtenso(c.faturaPaga.vencimento)} marcada como paga.</span>
                        <input type="hidden" name="vencimento" value="" />
                        <Enviar className={botaoSecundario}>Desfazer</Enviar>
                      </>
                    ) : (
                      <>
                        <input type="hidden" name="vencimento" value={aPagar!.vencimento} />
                        <Enviar className={botaoSecundario}>Marcar fatura de {mesPorExtenso(aPagar!.vencimento)} como paga</Enviar>
                      </>
                    )}
                  </Form>
                )}
                {aPagar && contas.length > 0 && c.limiteDisponivelCentavos === null && (
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

    </>
  );
}
