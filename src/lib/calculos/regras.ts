// Categorização automática por regras (spec: regras editáveis, sem IA no início).

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Primeira regra (maior prioridade; empate: texto mais longo, mais específico) cujo texto aparece na descrição. */
export function categorizar(descricao: string, regras: { padraoTexto: string; categoriaId: string; prioridade: number }[]) {
  const d = normalizar(descricao);
  const ordenadas = [...regras].sort((a, b) => b.prioridade - a.prioridade || b.padraoTexto.length - a.padraoTexto.length);
  return ordenadas.find((r) => normalizar(r.padraoTexto) && d.includes(normalizar(r.padraoTexto)))?.categoriaId ?? null;
}
