import { cookies } from "next/headers";
import { definirTema, editarCategoria, excluirMinhaConta, removerCategoria, salvarCategoria } from "@/app/acoes";
import { botaoPerigo, botaoSecundario, campo, cartao, link, rotulo, titulo } from "@/components/estilos";
import { Enviar, Form } from "@/components/form";
import { Tipo } from "@/components/ui";
import { db } from "@/db";
import { emArvore, listarCategorias } from "@/lib/dados/categorias";
import { exigirUsuario } from "@/lib/sessao";

export const metadata = { title: "Ajustes" };

export default async function Configuracoes() {
  const uid = await exigirUsuario();
  const categorias = await listarCategorias(db, uid);
  const arvore = emArvore(categorias);
  const principais = categorias.filter((c) => !c.paiId);
  const tema = (await cookies()).get("tema")?.value ?? "sistema";

  return (
    <>
      <h1 className={titulo}>Ajustes</h1>

      <section className={cartao} aria-labelledby="aparencia">
        <h2 id="aparencia" className="mb-3 font-semibold">
          Aparência
        </h2>
        <Form action={definirTema} className="flex flex-wrap items-end gap-2">
          <label className={rotulo}>
            Tema
            <select name="tema" defaultValue={tema} className={campo}>
              <option value="sistema">Automático (igual ao celular/computador)</option>
              <option value="claro">Claro</option>
              <option value="escuro">Escuro</option>
            </select>
          </label>
          <Enviar className={botaoSecundario}>Aplicar</Enviar>
        </Form>
      </section>

      <section className={cartao} aria-labelledby="cats">
        <h2 id="cats" className="mb-3 font-semibold">
          Categorias
        </h2>
        {(["despesa", "receita"] as const).map((tipo) => (
          <div key={tipo} className="mb-4">
            <h3 className="mb-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400">{tipo === "despesa" ? "Despesas" : "Receitas"}</h3>
            <ul className="flex flex-col gap-1">
              {arvore
                .filter((c) => c.tipo === tipo)
                .map((c) => (
                  <li key={c.id} className={c.nivel ? "ml-6" : ""}>
                    <details>
                      <summary className="cursor-pointer py-1">
                        <span aria-hidden className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: c.cor }} />
                        {c.nome}
                      </summary>
                      <div className="my-2 flex flex-wrap items-end gap-2">
                        <Form action={editarCategoria} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="id" value={c.id} />
                          <label className={rotulo}>
                            Nome
                            <input name="nome" required maxLength={60} defaultValue={c.nome} className={campo} />
                          </label>
                          <label className={rotulo}>
                            Cor
                            <input name="cor" type="color" defaultValue={c.cor} className="h-10 w-14 rounded border border-zinc-300 dark:border-zinc-700" />
                          </label>
                          <Enviar className={botaoSecundario}>Salvar</Enviar>
                        </Form>
                        <Form action={removerCategoria}>
                          <input type="hidden" name="id" value={c.id} />
                          <Enviar
                            className={botaoPerigo}
                            confirmar={`Excluir "${c.nome}"${c.nivel ? "" : " e suas subcategorias"}? Os lançamentos ficam sem categoria.`}
                          >
                            Excluir
                          </Enviar>
                        </Form>
                      </div>
                    </details>
                  </li>
                ))}
            </ul>
          </div>
        ))}

        <h3 className="mb-2 font-semibold">Nova categoria</h3>
        <Form action={salvarCategoria} className="flex flex-col gap-3">
          <Tipo />
          <div className="grid grid-cols-2 gap-3">
            <label className={rotulo}>
              Nome
              <input name="nome" required maxLength={60} className={campo} />
            </label>
            <label className={rotulo}>
              Dentro de (opcional)
              <select name="paiId" defaultValue="" className={campo}>
                <option value="">— principal —</option>
                {principais.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} ({c.tipo})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={rotulo}>
            Cor
            <input name="cor" type="color" defaultValue="#64748b" className="h-10 w-14 rounded border border-zinc-300 dark:border-zinc-700" />
          </label>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">Subcategoria herda o tipo (receita/despesa) da principal.</p>
          <Enviar>Criar categoria</Enviar>
        </Form>
      </section>

      <section className={cartao} aria-labelledby="dados">
        <h2 id="dados" className="mb-2 font-semibold">
          Seus dados
        </h2>
        <p className="mb-2 text-sm">Os dados são seus. Baixe tudo quando quiser:</p>
        <ul className="mb-4 flex flex-col gap-1 text-sm">
          <li>
            <a href="/api/exportar?formato=json" className={link}>
              Exportar tudo (JSON)
            </a>
          </li>
          <li>
            <a href="/api/exportar?formato=csv" className={link}>
              Exportar lançamentos (CSV, abre no Excel)
            </a>
          </li>
        </ul>
        <h3 className="mb-1 font-semibold text-red-700 dark:text-red-400">Excluir minha conta</h3>
        <p className="mb-2 text-sm">Apaga para sempre seu cadastro, contas, categorias, recorrências e lançamentos. Não tem volta.</p>
        <Form action={excluirMinhaConta} className="flex flex-wrap items-end gap-2">
          <label className={rotulo}>
            Digite EXCLUIR para confirmar
            <input name="confirmacao" required autoComplete="off" className={campo} />
          </label>
          <Enviar className={botaoPerigo} confirmar="Tem certeza? Todos os seus dados serão apagados.">
            Excluir conta e dados
          </Enviar>
        </Form>
      </section>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">Regras de categorização e bancos conectados chegam na fase 3.</p>
    </>
  );
}
