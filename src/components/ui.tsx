import Link from "next/link";
import { emArvore, type Categoria } from "@/lib/dados/categorias";
import { formatarReais } from "@/lib/formato";
import { botao, campo, cartao } from "./estilos";

/** Valor com sinal escrito (+/−), não só pela cor. */
export function Valor({ centavos, className = "" }: { centavos: number; className?: string }) {
  const cor = centavos < 0 ? "text-red-700 dark:text-red-400" : centavos > 0 ? "text-emerald-700 dark:text-emerald-400" : "";
  return (
    <span className={`tabular whitespace-nowrap ${cor} ${className}`}>
      {centavos > 0 ? "+" : ""}
      {formatarReais(centavos)}
    </span>
  );
}

export function SelectCategoria({
  categorias,
  name = "categoriaId",
  defaultValue,
  vazio = "Sem categoria",
  id,
}: {
  categorias: Categoria[];
  name?: string;
  defaultValue?: string | null;
  vazio?: string;
  id?: string;
}) {
  const arvore = emArvore(categorias);
  return (
    <select name={name} id={id} defaultValue={defaultValue ?? ""} className={campo}>
      <option value="">{vazio}</option>
      {(["despesa", "receita"] as const).filter((t) => arvore.some((c) => c.tipo === t)).map((t) => (
        <optgroup key={t} label={t === "despesa" ? "Despesas" : "Receitas"}>
          {arvore
            .filter((c) => c.tipo === t)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nivel ? `  — ${c.nome}` : c.nome}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

export function SelectConta({
  contas,
  name = "contaId",
  defaultValue,
  vazio,
}: {
  contas: { id: string; nome: string }[];
  name?: string;
  defaultValue?: string;
  vazio?: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue ?? ""} className={campo} required={!vazio}>
      {vazio && <option value="">{vazio}</option>}
      {contas.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nome}
        </option>
      ))}
    </select>
  );
}

/** Conta ou cartão num select só; valor "conta:<id>" ou "cartao:<id>". */
export function SelectOnde({
  contas,
  cartoes,
  defaultValue,
}: {
  contas: { id: string; nome: string }[];
  cartoes: { id: string; nome: string }[];
  defaultValue?: string;
}) {
  return (
    <select name="onde" defaultValue={defaultValue} className={campo} required>
      <optgroup label="Contas">
        {contas.map((c) => (
          <option key={c.id} value={`conta:${c.id}`}>
            {c.nome}
          </option>
        ))}
      </optgroup>
      {cartoes.length > 0 && (
        <optgroup label="Cartões de crédito">
          {cartoes.map((c) => (
            <option key={c.id} value={`cartao:${c.id}`}>
              💳 {c.nome}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

export const ondeDe = (t: { contaId: string | null; cartaoId: string | null }) =>
  t.contaId ? `conta:${t.contaId}` : `cartao:${t.cartaoId}`;

/** Estado vazio que ensina o próximo passo. */
export function Vazio({ titulo, texto, href, acao }: { titulo: string; texto: string; href: string; acao: string }) {
  return (
    <div className={`${cartao} flex flex-col items-start gap-2`}>
      <p className="font-semibold">{titulo}</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{texto}</p>
      <Link href={href} className={botao}>
        {acao}
      </Link>
    </div>
  );
}

export const TIPOS_CONTA = {
  corrente: "Conta corrente",
  poupanca: "Poupança",
  dinheiro: "Dinheiro",
  vale: "Vale-refeição/alimentação",
  investimento: "Investimento",
} as const;

export const PERIODICIDADES = { semanal: "Semanal", mensal: "Mensal", anual: "Anual" } as const;

/** Radio Despesa/Receita. */
export function Tipo({ defaultValue = "despesa" }: { defaultValue?: "despesa" | "receita" }) {
  return (
    <fieldset className="flex gap-2">
      <legend className="sr-only">Tipo</legend>
      {(["despesa", "receita"] as const).map((t) => (
        <label
          key={t}
          className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium has-checked:border-emerald-700 has-checked:bg-emerald-50 has-focus-visible:outline-2 has-focus-visible:outline-emerald-600 dark:border-zinc-700 dark:has-checked:bg-emerald-950"
        >
          <input type="radio" name="tipo" value={t} defaultChecked={t === defaultValue} className="accent-emerald-700" />
          {t === "despesa" ? "− Despesa" : "+ Receita"}
        </label>
      ))}
    </fieldset>
  );
}
