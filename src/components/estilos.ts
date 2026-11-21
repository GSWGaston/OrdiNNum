// Classes compartilhadas. Foco sempre visível (acessibilidade).
const foco = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600";

export const campo = `w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${foco}`;
export const rotulo = "flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300";
export const botao = `inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 ${foco}`;
export const botaoSecundario = `inline-flex items-center justify-center rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800 ${foco}`;
export const botaoPerigo = `inline-flex items-center justify-center rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 ${foco}`;
export const cartao = "rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900";
export const link = `underline underline-offset-2 text-emerald-800 dark:text-emerald-400 ${foco}`;
export const titulo = "text-xl font-bold";
