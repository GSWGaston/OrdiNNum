import { removerConta, salvarConta } from "@/app/acoes";
import { botaoPerigo, campo, cartao, rotulo, titulo } from "@/components/estilos";
import { Enviar, Form } from "@/components/form";
import { TIPOS_CONTA, Valor } from "@/components/ui";
import { db } from "@/db";
import { hoje } from "@/lib/calculos/datas";
import { listarContas } from "@/lib/dados/contas";
import { centavosParaTexto } from "@/lib/formato";
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

export default async function Contas() {
  const uid = await exigirUsuario();
  const contas = await listarContas(db, uid, hoje());
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
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Cartões de crédito e o botão “Conectar banco” chegam nas próximas fases.
      </p>
    </>
  );
}
