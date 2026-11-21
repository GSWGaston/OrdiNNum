import Link from "next/link";
import { aportarAcao, arquivarObjetivoAcao, removerAporte, removerObjetivo, salvarObjetivo } from "@/app/acoes";
import { botaoPerigo, botaoSecundario, campo, cartao, link, rotulo, titulo } from "@/components/estilos";
import { Enviar, Form } from "@/components/form";
import { BarraObjetivo } from "@/components/objetivos";
import { Valor } from "@/components/ui";
import { db } from "@/db";
import { hoje } from "@/lib/calculos/datas";
import { listarObjetivos } from "@/lib/dados/objetivos";
import { centavosParaTexto, formatarData, formatarReais } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";

export const metadata = { title: "Objetivos" };

type Obj = Awaited<ReturnType<typeof listarObjetivos>>[number];

function CamposObjetivo({ o }: { o?: Obj }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {o && <input type="hidden" name="id" value={o.id} />}
      <label className={`${rotulo} col-span-2`}>
        Nome
        <input name="nome" required maxLength={80} defaultValue={o?.nome} placeholder="Ex.: Viagem, reserva de emergência" className={campo} />
      </label>
      <label className={rotulo}>
        Quanto quer juntar (R$)
        <input name="alvo" inputMode="decimal" required defaultValue={o ? centavosParaTexto(o.valorAlvoCentavos) : ""} placeholder="0,00" className={campo} />
      </label>
      <label className={rotulo}>
        Até quando (opcional)
        <input name="prazo" type="date" defaultValue={o?.prazo ?? ""} className={campo} />
      </label>
    </div>
  );
}

export default async function Objetivos() {
  const uid = await exigirUsuario();
  const dia = hoje();
  const objetivos = await listarObjetivos(db, uid, dia);
  const ativos = objetivos.filter((o) => o.status === "ativo");
  const arquivados = objetivos.filter((o) => o.status === "arquivado");
  const reservado = ativos.reduce((s, o) => s + Math.max(0, o.guardado), 0);

  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <h1 className={titulo}>Objetivos</h1>
        <Link href="/orcamento" className={`${link} text-sm`}>
          ‹ Meta e orçamento
        </Link>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Separe dinheiro para uma viagem, uma compra ou uma reserva. O que você guarda aqui fica reservado: não entra no “quanto posso gastar
        hoje”. {reservado > 0 && <strong>Total reservado: {formatarReais(reservado)}.</strong>}
      </p>

      {ativos.length === 0 && <p className={`${cartao} text-sm`}>Nenhum objetivo ativo. Crie o primeiro abaixo.</p>}
      <ul className="flex flex-col gap-3">
        {ativos.map((o) => (
          <li key={o.id} className={`${cartao} flex flex-col gap-3`}>
            <BarraObjetivo o={o} />
            {o.esperadoHoje !== null && (
              <p className="text-xs text-zinc-600 dark:text-zinc-400">Para estar no ritmo, hoje o ideal seria ter {formatarReais(o.esperadoHoje)}.</p>
            )}

            <Form action={aportarAcao} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="objetivoId" value={o.id} />
              <label className={`${rotulo} w-28`}>
                Valor
                <input name="valor" inputMode="decimal" required placeholder={o.aporteMensal ? centavosParaTexto(o.aporteMensal) : "0,00"} className={campo} />
              </label>
              <label className={rotulo}>
                Data
                <input name="data" type="date" required defaultValue={dia} className={campo} />
              </label>
              <Enviar className={botaoSecundario} name="tipo" value="guardar">
                + Guardar
              </Enviar>
              <Enviar className={botaoSecundario} name="tipo" value="retirar">
                − Retirar
              </Enviar>
            </Form>

            <details>
              <summary className="cursor-pointer text-sm font-medium">Histórico de aportes ({o.aportes.length})</summary>
              {o.aportes.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Nenhum aporte ainda.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {o.aportes.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2">
                      <span className="tabular text-zinc-600 dark:text-zinc-400">{formatarData(a.data)}</span>
                      <Valor centavos={a.valorCentavos} />
                      <Form action={removerAporte}>
                        <input type="hidden" name="id" value={a.id} />
                        <Enviar className="text-xs underline" confirmar="Excluir este aporte?">
                          excluir
                        </Enviar>
                      </Form>
                    </li>
                  ))}
                </ul>
              )}
            </details>

            <details>
              <summary className="cursor-pointer text-sm font-medium">Editar</summary>
              <Form action={salvarObjetivo} className="mt-3 flex flex-col gap-3">
                <CamposObjetivo o={o} />
                <Enviar>Salvar</Enviar>
              </Form>
              <div className="mt-2 flex flex-wrap gap-2">
                <Form action={arquivarObjetivoAcao}>
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="arquivar" value="sim" />
                  <Enviar className={botaoSecundario}>Arquivar (libera a reserva)</Enviar>
                </Form>
                <Form action={removerObjetivo}>
                  <input type="hidden" name="id" value={o.id} />
                  <Enviar className={botaoPerigo} confirmar={`Excluir "${o.nome}" e todo o histórico de aportes?`}>
                    Excluir
                  </Enviar>
                </Form>
              </div>
            </details>
          </li>
        ))}
      </ul>

      <section className={cartao} aria-labelledby="novo-obj">
        <h2 id="novo-obj" className="mb-3 font-semibold">
          Novo objetivo
        </h2>
        <Form action={salvarObjetivo} className="flex flex-col gap-3">
          <CamposObjetivo />
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Com prazo, o app diz quanto guardar por mês. Sem prazo, estima quando você chega lá pelo ritmo dos últimos 3 meses.
          </p>
          <Enviar>Criar objetivo</Enviar>
        </Form>
      </section>

      {arquivados.length > 0 && (
        <section className={cartao} aria-labelledby="arq">
          <h2 id="arq" className="mb-2 font-semibold">
            Arquivados
          </h2>
          <ul className="flex flex-col gap-2 text-sm">
            {arquivados.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2">
                <span>
                  {o.nome} · {formatarReais(o.guardado)} de {formatarReais(o.valorAlvoCentavos)}
                </span>
                <Form action={arquivarObjetivoAcao}>
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="arquivar" value="nao" />
                  <Enviar className={botaoSecundario}>Reativar</Enviar>
                </Form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
