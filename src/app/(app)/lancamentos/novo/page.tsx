import { novoLancamento } from "@/app/acoes";
import { botaoSecundario, campo, rotulo, titulo } from "@/components/estilos";
import { Enviar, Form } from "@/components/form";
import { SelectCategoria, SelectOnde, Tipo, Vazio } from "@/components/ui";
import { db } from "@/db";
import { hoje } from "@/lib/calculos/datas";
import { listarCartoes } from "@/lib/dados/cartoes";
import { listarCategorias } from "@/lib/dados/categorias";
import { listarContas } from "@/lib/dados/contas";
import { exigirUsuario } from "@/lib/sessao";

export const metadata = { title: "Novo lançamento" };

export default async function NovoLancamento({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  const uid = await exigirUsuario();
  const dia = hoje();
  const [contas, cartoes, categorias] = await Promise.all([listarContas(db, uid, dia), listarCartoes(db, uid), listarCategorias(db, uid)]);
  const { salvo } = await searchParams;

  if (!contas.length)
    return <Vazio titulo="Antes, crie uma conta" texto="Todo lançamento sai de (ou entra em) uma conta." href="/contas" acao="Criar conta" />;

  return (
    <>
      <h1 className={titulo}>Novo lançamento</h1>
      {salvo && (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          ✓ Lançamento salvo. Pode lançar o próximo.
        </p>
      )}
      <Form action={novoLancamento} className="flex flex-col gap-4">
        <Tipo />
        <label className={rotulo}>
          Valor (R$)
          <input name="valor" inputMode="decimal" placeholder="0,00" required autoFocus autoComplete="off" className={`${campo} text-2xl`} />
        </label>
        <label className={rotulo}>
          Categoria
          <SelectCategoria categorias={categorias} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={rotulo}>
            Conta/cartão
            <SelectOnde contas={contas} cartoes={cartoes} />
          </label>
          <label className={rotulo}>
            Data
            <input name="data" type="date" defaultValue={dia} required className={campo} />
          </label>
        </div>
        <label className={rotulo}>
          Descrição (opcional)
          <input name="descricao" maxLength={200} placeholder="Ex.: padaria" className={campo} />
        </label>
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Mais opções: parcelas e observação</summary>
          <div className="mt-3 flex flex-col gap-3">
            <label className={rotulo}>
              Parcelas (o valor acima é o total; gera uma por mês)
              <input name="parcelas" type="number" min={1} max={120} defaultValue={1} className={campo} />
            </label>
            <label className={rotulo}>
              Observação
              <textarea name="observacao" maxLength={1000} rows={2} className={campo} />
            </label>
          </div>
        </details>
        <div className="flex flex-wrap gap-2">
          <Enviar>Salvar</Enviar>
          <Enviar className={botaoSecundario} name="continuar" value="1">
            Salvar e lançar outro
          </Enviar>
        </div>
      </Form>
    </>
  );
}
