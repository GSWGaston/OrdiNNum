import { lancarRecorrenciaAcao, removerRecorrencia, salvarRecorrencia } from "@/app/acoes";
import { botaoPerigo, botaoSecundario, campo, cartao, rotulo, titulo } from "@/components/estilos";
import { Enviar, Form } from "@/components/form";
import { PERIODICIDADES, SelectCategoria, SelectConta, Tipo, Valor, Vazio } from "@/components/ui";
import { db } from "@/db";
import { hoje } from "@/lib/calculos/datas";
import { listarCategorias } from "@/lib/dados/categorias";
import { listarContas } from "@/lib/dados/contas";
import { listarRecorrencias } from "@/lib/dados/recorrencias";
import { centavosParaTexto, formatarData } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";

export const metadata = { title: "Recorrências" };

export default async function Recorrencias() {
  const uid = await exigirUsuario();
  const dia = hoje();
  const [recs, contas, categorias] = await Promise.all([listarRecorrencias(db, uid), listarContas(db, uid, dia), listarCategorias(db, uid)]);
  const nomeConta = new Map(contas.map((c) => [c.id, c.nome]));

  if (!contas.length) return <Vazio titulo="Antes, crie uma conta" texto="Cada recorrência é lançada em uma conta." href="/contas" acao="Criar conta" />;

  return (
    <>
      <h1 className={titulo}>Recorrências</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Aluguel, salário, assinaturas. Quando vencer, confira o valor e toque em “Lançar”: vira um lançamento e a próxima data avança.
      </p>

      {recs.length === 0 && <p className={`${cartao} text-sm`}>Nenhuma recorrência ainda. Cadastre a primeira abaixo.</p>}
      <ul className="flex flex-col gap-2">
        {recs.map((r) => {
          const vencida = r.proximaData <= dia;
          return (
            <li key={r.id} className={`${cartao} flex flex-col gap-2`}>
              <div className="flex justify-between gap-2">
                <span className="flex flex-col">
                  <span className="font-semibold">{r.descricao}</span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {PERIODICIDADES[r.periodicidade]} · {nomeConta.get(r.contaId)} · próxima {formatarData(r.proximaData)}
                    {vencida && <strong className="ml-1 text-amber-700 dark:text-amber-400">(vence hoje ou já venceu)</strong>}
                  </span>
                </span>
                <Valor centavos={r.valorCentavos} className="font-semibold" />
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Form action={lancarRecorrenciaAcao} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <label className={`${rotulo} w-32`}>
                    Valor desta vez
                    <input name="valor" inputMode="decimal" placeholder={centavosParaTexto(Math.abs(r.valorCentavos))} className={campo} />
                  </label>
                  <Enviar className={botaoSecundario}>Lançar {formatarData(r.proximaData)}</Enviar>
                </Form>
                <Form action={removerRecorrencia}>
                  <input type="hidden" name="id" value={r.id} />
                  <Enviar className={botaoPerigo} confirmar={`Excluir a recorrência "${r.descricao}"? Lançamentos já feitos ficam.`}>
                    Excluir
                  </Enviar>
                </Form>
              </div>
            </li>
          );
        })}
      </ul>

      <section className={cartao} aria-labelledby="nova-rec">
        <h2 id="nova-rec" className="mb-3 font-semibold">
          Nova recorrência
        </h2>
        <Form action={salvarRecorrencia} className="flex flex-col gap-3">
          <Tipo />
          <label className={rotulo}>
            Descrição
            <input name="descricao" required maxLength={200} placeholder="Ex.: Aluguel" className={campo} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={rotulo}>
              Valor (R$)
              <input name="valor" inputMode="decimal" required placeholder="0,00" className={campo} />
            </label>
            <label className={rotulo}>
              Periodicidade
              <select name="periodicidade" defaultValue="mensal" className={campo}>
                {Object.entries(PERIODICIDADES).map(([v, r]) => (
                  <option key={v} value={v}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className={rotulo}>
              Próximo vencimento
              <input name="proximaData" type="date" required defaultValue={dia} className={campo} />
            </label>
            <label className={rotulo}>
              Conta
              <SelectConta contas={contas} />
            </label>
          </div>
          <label className={rotulo}>
            Categoria
            <SelectCategoria categorias={categorias} />
          </label>
          <Enviar>Adicionar</Enviar>
        </Form>
      </section>
    </>
  );
}
