"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { criarCategoriaRapida } from "@/app/acoes";
import { campo } from "./estilos";

export type CatSeletor = { id: string; nome: string; paiId: string | null; tipo: "receita" | "despesa"; cor: string };

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
const ordem = (a: CatSeletor, b: CatSeletor) => a.nome.localeCompare(b.nome, "pt-BR");
const foco = "focus-visible:outline-2 focus-visible:outline-emerald-600";

function Bolinha({ cor }: { cor: string }) {
  return <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cor }} />;
}

/**
 * Seletor de categoria no padrão do site: grupos (categorias principais) recolhidos que abrem com ▸, busca,
 * e criação de categoria ou grupo sem sair do formulário. O valor vai num input escondido (`name`), então funciona
 * dentro de qualquer <form> do app, inclusive o de filtro (GET).
 */
export function SeletorCategoria({
  categorias,
  name = "categoriaId",
  defaultValue,
  vazio = "Sem categoria",
  id,
}: {
  categorias: CatSeletor[];
  name?: string;
  defaultValue?: string | null;
  vazio?: string;
  id?: string;
}) {
  const [valor, setValor] = useState(defaultValue ?? "");
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [criando, setCriando] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const porId = new Map(categorias.map((c) => [c.id, c]));
  const selecionada = porId.get(valor);
  const pai = selecionada?.paiId ? porId.get(selecionada.paiId) : undefined;
  const grupos = (tipo: CatSeletor["tipo"]) => categorias.filter((c) => !c.paiId && c.tipo === tipo).sort(ordem);
  const filhos = (gid: string) => categorias.filter((c) => c.paiId === gid).sort(ordem);
  const casa = (c: CatSeletor) => normalizar(c.nome).includes(normalizar(busca.trim()));

  function abrir() {
    // abre já mostrando o grupo da categoria escolhida
    if (!aberto && selecionada?.paiId) setExpandidos((s) => new Set(s).add(selecionada.paiId!));
    setAberto(!aberto);
    setBusca("");
    setCriando(false);
  }
  function escolher(v: string) {
    setValor(v);
    setAberto(false);
  }
  const alternar = (gid: string) =>
    setExpandidos((s) => {
      const n = new Set(s);
      if (n.has(gid)) n.delete(gid);
      else n.add(gid);
      return n;
    });

  const opcao = (c: CatSeletor | null, recuo = false) => {
    const v = c?.id ?? "";
    const sel = valor === v;
    return (
      <button
        type="button"
        role="option"
        aria-selected={sel}
        onClick={() => escolher(v)}
        className={`flex w-full min-w-0 items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-sm ${recuo ? "pl-8" : "pl-2"} ${
          sel ? "bg-emerald-50 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
        } ${foco}`}
      >
        {c ? <Bolinha cor={c.cor} /> : <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-zinc-400" />}
        <span className="truncate">{c?.nome ?? vazio}</span>
        {sel && <span className="ml-auto" aria-hidden>✓</span>}
      </button>
    );
  };

  return (
    <div ref={raiz} className="relative">
      <input type="hidden" name={name} value={valor} />
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onClick={abrir}
        className={`${campo} flex items-center justify-between gap-2 text-left`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selecionada && <Bolinha cor={selecionada.cor} />}
          <span className={`truncate ${selecionada ? "" : "text-zinc-500"}`}>
            {selecionada ? (pai ? `${pai.nome} › ${selecionada.nome}` : selecionada.nome) : vazio}
          </span>
        </span>
        <span aria-hidden className="text-zinc-500">
          ▾
        </span>
      </button>

      {aberto && (
        <div className="absolute z-30 mt-1 w-full min-w-64 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
          <input
            autoFocus
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            placeholder="Buscar categoria…"
            aria-label="Buscar categoria"
            className={`${campo} mb-2 py-1.5 text-sm`}
          />
          <div role="listbox" aria-label="Categorias" className="max-h-72 overflow-y-auto">
            {!busca && opcao(null)}
            {(["despesa", "receita"] as const).map((tipo) => {
              const gs = grupos(tipo).filter((g) => !busca || casa(g) || filhos(g.id).some(casa));
              if (!gs.length) return null;
              return (
                <div key={tipo} role="group" aria-label={tipo === "despesa" ? "Despesas" : "Receitas"}>
                  <p className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
                    {tipo === "despesa" ? "Despesas" : "Receitas"}
                  </p>
                  {gs.map((g) => {
                    const fs = filhos(g.id);
                    const visiveis = busca ? fs.filter((f) => casa(f) || casa(g)) : fs;
                    const exp = !!busca || expandidos.has(g.id);
                    return (
                      <div key={g.id}>
                        <div className="flex items-center gap-1">
                          {opcao(g)}
                          {fs.length > 0 && !busca && (
                            <button
                              type="button"
                              onClick={() => alternar(g.id)}
                              aria-expanded={exp}
                              aria-label={`${exp ? "Recolher" : "Mostrar"} categorias de ${g.nome}`}
                              className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${foco}`}
                            >
                              {fs.length} <span aria-hidden>{exp ? "▾" : "▸"}</span>
                            </button>
                          )}
                        </div>
                        {exp && visiveis.map((f) => <div key={f.id}>{opcao(f, true)}</div>)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
            {criando ? (
              <NovaCategoria
                grupos={categorias.filter((c) => !c.paiId).sort(ordem)}
                nomeInicial={busca}
                onCriada={(nova) => {
                  setValor(nova);
                  setCriando(false);
                  setAberto(false);
                }}
                onCancelar={() => setCriando(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setCriando(true)}
                className={`w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium text-emerald-800 hover:bg-zinc-100 dark:text-emerald-400 dark:hover:bg-zinc-800 ${foco}`}
              >
                + Nova categoria ou grupo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Mini-formulário dentro do seletor. Não é <form> (estaria dentro de outro form): chama a ação direto. */
function NovaCategoria({
  grupos,
  nomeInicial,
  onCriada,
  onCancelar,
}: {
  grupos: CatSeletor[];
  nomeInicial: string;
  onCriada: (id: string) => void;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(nomeInicial);
  const [paiId, setPaiId] = useState("");
  const [tipo, setTipo] = useState<CatSeletor["tipo"]>("despesa");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const criar = () =>
    iniciar(async () => {
      const r = await criarCategoriaRapida({ nome, paiId: paiId || null, tipo });
      if (r.id) onCriada(r.id);
      else setErro(r.erro ?? "Não foi possível criar.");
    });

  return (
    <div className="flex flex-col gap-2 text-sm">
      <input
        autoFocus
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            criar();
          }
        }}
        maxLength={60}
        placeholder="Nome (ex.: Pet, Farmácia)"
        aria-label="Nome da nova categoria"
        className={`${campo} py-1.5 text-sm`}
      />
      <select value={paiId} onChange={(e) => setPaiId(e.target.value)} aria-label="Grupo da nova categoria" className={`${campo} py-1.5 text-sm`}>
        <option value="">É um grupo novo</option>
        {grupos.map((g) => (
          <option key={g.id} value={g.id}>
            Dentro de {g.nome}
          </option>
        ))}
      </select>
      {!paiId && (
        <div className="flex gap-3" role="radiogroup" aria-label="Tipo do grupo">
          {(["despesa", "receita"] as const).map((t) => (
            <label key={t} className="flex items-center gap-1">
              <input type="radio" checked={tipo === t} onChange={() => setTipo(t)} className="accent-emerald-700" />
              {t === "despesa" ? "Despesa" : "Receita"}
            </label>
          ))}
        </div>
      )}
      {erro && (
        <p role="alert" className="text-red-700 dark:text-red-400">
          ⚠ {erro}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={criar}
          disabled={pendente || !nome.trim()}
          className={`rounded-lg bg-emerald-700 px-3 py-1.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 ${foco}`}
        >
          {pendente ? "Criando…" : "Criar e usar"}
        </button>
        <button type="button" onClick={onCancelar} className={`rounded-lg px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${foco}`}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
