import Link from "next/link";
import { categorizarLote, editarLancamento, removerLancamento } from "@/app/acoes";
import { botao, botaoPerigo, botaoSecundario, campo, cartao, link, rotulo, titulo } from "@/components/estilos";
import { Enviar, Form } from "@/components/form";
import { SelectCategoria, SelectConta, Tipo, Valor, Vazio } from "@/components/ui";
import { db } from "@/db";
import { hoje, mesValido, nomeDoMes } from "@/lib/calculos/datas";
import { listarCategorias } from "@/lib/dados/categorias";
import { listarContas } from "@/lib/dados/contas";
import { listarTransacoes } from "@/lib/dados/transacoes";
import { centavosParaTexto, formatarData, formatarReais } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";

export const metadata = { title: "Lançamentos" };

type Busca = { mes?: string; conta?: string; categoria?: string; q?: string };
const uuid = (s?: string) => (s && /^[0-9a-f-]{36}$/i.test(s) ? s : undefined);

export default async function Lancamentos({ searchParams }: { searchParams: Promise<Busca> }) {
  const uid = await exigirUsuario();
  const sp = await searchParams;
  const dia = hoje();
  const mes = mesValido(sp.mes) ? sp.mes : dia.slice(0, 7);
  const filtro = { mes, contaId: uuid(sp.conta), categoriaId: uuid(sp.categoria), texto: sp.q?.trim().slice(0, 100) || undefined };

  const [lista, contas, categorias] = await Promise.all([
    listarTransacoes(db, uid, filtro),
    listarContas(db, uid, dia),
    listarCategorias(db, uid),
  ]);
  const nomeConta = new Map(contas.map((c) => [c.id, c.nome]));
  const nomeCat = new Map(categorias.map((c) => [c.id, c.nome]));
  const entradas = lista.filter((t) => t.valorCentavos > 0).reduce((s, t) => s + t.valorCentavos, 0);
  const saidas = lista.filter((t) => t.valorCentavos < 0).reduce((s, t) => s - t.valorCentavos, 0);

  return (
    <>
      <h1 className={titulo}>Lançamentos</h1>

      <form className={`${cartao} grid grid-cols-2 gap-3 sm:grid-cols-4`} role="search" aria-label="Filtrar lançamentos">
        <label className={rotulo}>
          Mês
          <input type="month" name="mes" defaultValue={mes} className={campo} />
        </label>
        <label className={rotulo}>
          Conta
          <SelectConta contas={contas} name="conta" defaultValue={filtro.contaId} vazio="Todas" />
        </label>
        <label className={rotulo}>
          Categoria
          <SelectCategoria categorias={categorias} name="categoria" defaultValue={filtro.categoriaId} vazio="Todas" />
        </label>
        <label className={rotulo}>
          Texto
          <input type="search" name="q" defaultValue={filtro.texto} placeholder="Buscar descrição" className={campo} />
        </label>
        <div className="col-span-2 flex gap-2 sm:col-span-4">
          <button className={botao}>Filtrar</button>
          <Link href="/lancamentos" className={botaoSecundario}>
            Limpar
          </Link>
        </div>
      </form>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {nomeDoMes(mes)}: {lista.length} lançamento(s) · entradas {formatarReais(entradas)} · saídas{" "}
        {formatarReais(saidas)}
      </p>

      {lista.length === 0 ? (
        <Vazio
          titulo="Nenhum lançamento aqui"
          texto="Mude os filtros ou registre um gasto: leva poucos segundos."
          href="/lancamentos/novo"
          acao="Lançar agora"
        />
      ) : (
        <>
          <Form id="lote" action={categorizarLote} className={`${cartao} flex flex-wrap items-end gap-2`}>
            <label className={`${rotulo} min-w-48 flex-1`}>
              Categorizar marcados como
              <SelectCategoria categorias={categorias} />
            </label>
            <Enviar className={botaoSecundario}>Aplicar aos marcados</Enviar>
          </Form>

          <ul className="flex flex-col gap-2">
            {lista.map((t) => (
              <li key={t.id} className={`${cartao} flex items-start gap-3 py-3`}>
                <input
                  type="checkbox"
                  name="ids"
                  value={t.id}
                  form="lote"
                  aria-label={`Marcar ${t.descricao || "lançamento"} de ${formatarData(t.data)}`}
                  className="mt-1.5 h-4 w-4 accent-emerald-700"
                />
                <details className="flex-1">
                  <summary className="flex cursor-pointer list-none justify-between gap-2">
                    <span className="flex flex-col">
                      <span className="font-medium">
                        {t.descricao || "(sem descrição)"}
                        {t.parcelasTotal && (
                          <span className="ml-1 text-xs text-zinc-500">
                            {t.parcelaAtual}/{t.parcelasTotal}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        {formatarData(t.data)} · {t.categoriaId ? nomeCat.get(t.categoriaId) : "Sem categoria"} ·{" "}
                        {nomeConta.get(t.contaId)}
                        {t.data > dia && " · futuro"}
                      </span>
                    </span>
                    <Valor centavos={t.valorCentavos} className="font-semibold" />
                  </summary>

                  <Form action={editarLancamento} className="mt-3 flex flex-col gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                    <input type="hidden" name="id" value={t.id} />
                    <Tipo defaultValue={t.valorCentavos < 0 ? "despesa" : "receita"} />
                    <div className="grid grid-cols-2 gap-3">
                      <label className={rotulo}>
                        Valor (R$)
                        <input name="valor" inputMode="decimal" required defaultValue={centavosParaTexto(Math.abs(t.valorCentavos))} className={campo} />
                      </label>
                      <label className={rotulo}>
                        Data
                        <input name="data" type="date" required defaultValue={t.data} className={campo} />
                      </label>
                      <label className={rotulo}>
                        Categoria
                        <SelectCategoria categorias={categorias} defaultValue={t.categoriaId} />
                      </label>
                      <label className={rotulo}>
                        Conta
                        <SelectConta contas={contas} defaultValue={t.contaId} />
                      </label>
                    </div>
                    <label className={rotulo}>
                      Descrição
                      <input name="descricao" maxLength={200} defaultValue={t.descricao} className={campo} />
                    </label>
                    <label className={rotulo}>
                      Observação
                      <input name="observacao" maxLength={1000} defaultValue={t.observacao ?? ""} className={campo} />
                    </label>
                    <Enviar>Salvar alterações</Enviar>
                  </Form>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Form action={removerLancamento}>
                      <input type="hidden" name="id" value={t.id} />
                      <Enviar className={botaoPerigo} confirmar="Excluir este lançamento?">
                        Excluir
                      </Enviar>
                    </Form>
                    {t.grupoParcelas && (
                      <Form action={removerLancamento}>
                        <input type="hidden" name="grupo" value={t.grupoParcelas} />
                        <Enviar className={botaoPerigo} confirmar={`Excluir todas as ${t.parcelasTotal} parcelas?`}>
                          Excluir todas as parcelas
                        </Enviar>
                      </Form>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-sm">
        <Link href="/api/exportar?formato=csv" className={link} prefetch={false}>
          Baixar todos os lançamentos em CSV
        </Link>
      </p>
    </>
  );
}
