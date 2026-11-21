import Link from "next/link";
import { conectarPorItemId, conectarSimulado, desconectarAcao, sincronizarAgora } from "@/app/acoes";
import { ConectarPluggy } from "@/components/conectar-pluggy";
import { botaoPerigo, botaoSecundario, campo, cartao, link, rotulo, titulo } from "@/components/estilos";
import { Enviar, Form } from "@/components/form";
import { db } from "@/db";
import { provedorAtivo } from "@/lib/bank";
import { consentimentoVencendo, listarConexoes } from "@/lib/dados/conexoes";
import { exigirUsuario } from "@/lib/sessao";

export const metadata = { title: "Bancos conectados" };

const quando = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(d) : "nunca";
const dataBR = (d: Date) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(d);

const STATUS: Record<string, { texto: string; cor: string }> = {
  atualizado: { texto: "✓ Atualizado", cor: "text-emerald-700 dark:text-emerald-400" },
  atualizando: { texto: "↻ Atualizando no banco", cor: "text-sky-700 dark:text-sky-400" },
  pendente: { texto: "… Aguardando primeira sincronização", cor: "text-zinc-600 dark:text-zinc-400" },
  acao_necessaria: { texto: "⚠ Precisa de ação sua", cor: "text-amber-700 dark:text-amber-400" },
  erro: { texto: "✕ Com erro", cor: "text-red-700 dark:text-red-400" },
};

export default async function Bancos() {
  const uid = await exigirUsuario();
  const provedor = provedorAtivo();
  const conexoes = await listarConexoes(db, uid);

  return (
    <>
      <h1 className={titulo}>Bancos conectados</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        O app não fala direto com o banco: usa a Pluggy, um agregador de Open Finance. Você autoriza no próprio banco, pode ver aqui até
        quando a autorização vale e revogar quando quiser. Contas, cartões e lançamentos chegam sozinhos e não duplicam. A atualização
        automática acontece uma vez por dia.
      </p>

      <section className={`${cartao} flex flex-col gap-3`} aria-labelledby="conectar">
        <h2 id="conectar" className="font-semibold">
          Conectar um banco
        </h2>
        {!provedor && (
          <p className="text-sm">
            Open Finance ainda não está configurado neste servidor. Falta cadastrar as chaves da Pluggy (veja “Open Finance” no README).
          </p>
        )}
        {provedor?.nome === "fake" && (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Sem chaves da Pluggy, este ambiente usa um <strong>banco simulado</strong> com dados fictícios, só para testar.
            </p>
            <Form action={conectarSimulado}>
              <Enviar>Conectar banco simulado</Enviar>
            </Form>
          </>
        )}
        {provedor?.nome === "pluggy" && (
          <>
            <ConectarPluggy sandbox={process.env.PLUGGY_SANDBOX === "true"} />
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Já conectei pelo Meu Pluggy</summary>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                No painel da Pluggy, cada banco ligado pelo Meu Pluggy aparece como um item. Copie o ID do item e cole aqui.
              </p>
              <Form action={conectarPorItemId} className="mt-2 flex flex-wrap items-end gap-2">
                <label className={`${rotulo} min-w-64 flex-1`}>
                  ID do item
                  <input name="itemId" required autoComplete="off" placeholder="1a2b3c4d-…" className={campo} />
                </label>
                <Enviar className={botaoSecundario}>Conectar</Enviar>
              </Form>
            </details>
          </>
        )}
      </section>

      {conexoes.length === 0 ? (
        <p className={`${cartao} text-sm`}>Nenhum banco conectado. Enquanto isso, dá para usar tudo com lançamentos manuais.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {conexoes.map((c) => {
            const s = STATUS[c.status] ?? STATUS.erro!;
            const vencendo = consentimentoVencendo(c.consentimentoAte);
            return (
              <li key={c.id} className={`${cartao} flex flex-col gap-2`}>
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">🏦 {c.banco || "Banco"}</span>
                  <span className={`text-sm font-semibold ${s.cor}`}>{s.texto}</span>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                  <dt className="text-zinc-600 dark:text-zinc-400">Autorização vale até</dt>
                  <dd className={vencendo ? "font-semibold text-amber-700 dark:text-amber-400" : ""}>
                    {c.consentimentoAte ? `${dataBR(c.consentimentoAte)}${vencendo ? " ⚠ renove em breve" : ""}` : "não informado pelo banco"}
                  </dd>
                  <dt className="text-zinc-600 dark:text-zinc-400">Última sincronização</dt>
                  <dd>{quando(c.ultimaSincronizacao)}</dd>
                  <dt className="text-zinc-600 dark:text-zinc-400">Via</dt>
                  <dd>{c.provedor === "fake" ? "banco simulado (teste)" : "Pluggy"}</dd>
                </dl>
                {c.erro && <p className="text-sm text-red-700 dark:text-red-400">{c.erro}</p>}
                <div className="flex flex-wrap items-end gap-2">
                  <Form action={sincronizarAgora}>
                    <input type="hidden" name="id" value={c.id} />
                    <Enviar className={botaoSecundario}>Sincronizar agora</Enviar>
                  </Form>
                </div>
                <details>
                  <summary className="cursor-pointer text-sm font-medium">Desconectar e revogar a autorização</summary>
                  <Form action={desconectarAcao} className="mt-2 flex flex-col gap-2 text-sm">
                    <input type="hidden" name="id" value={c.id} />
                    <fieldset className="flex flex-col gap-1">
                      <legend className="mb-1">O que fazer com o que já foi importado?</legend>
                      <label className="flex gap-2">
                        <input type="radio" name="historico" value="manter" defaultChecked className="accent-emerald-700" />
                        Manter contas, cartões e lançamentos (viram manuais, com o saldo de hoje)
                      </label>
                      <label className="flex gap-2">
                        <input type="radio" name="historico" value="apagar" className="accent-red-700" />
                        Apagar tudo que veio desse banco
                      </label>
                    </fieldset>
                    <Enviar className={botaoPerigo} confirmar="Desconectar este banco? A autorização será revogada no agregador.">
                      Desconectar
                    </Enviar>
                  </Form>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-sm">
        <Link href="/configuracoes#regras" className={link}>
          Regras de categorização automática
        </Link>
      </p>
    </>
  );
}
