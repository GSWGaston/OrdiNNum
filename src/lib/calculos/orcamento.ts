// Orçamento por categoria: limite mensal com alerta aos 80% e aos 100% (spec, módulo Orçamento).

export const ALERTA_PCT = 80;

/**
 * Quanto já foi gasto em cada categoria com limite. Limite numa categoria principal soma as subcategorias.
 * Conta toda saída do mês na categoria (inclusive fixas e compras no cartão, na data da compra); transferências não.
 */
export function progressoOrcamentos(
  orcamentos: { categoriaId: string; limiteCentavos: number }[],
  lancamentos: { valorCentavos: number; categoriaId: string | null; transferenciaId?: string | null }[],
  categorias: { id: string; paiId: string | null }[],
) {
  const pai = new Map(categorias.map((c) => [c.id, c.paiId]));
  const gastoPor = new Map<string, number>();
  for (const l of lancamentos) {
    if (l.valorCentavos >= 0 || l.transferenciaId || !l.categoriaId) continue;
    for (const id of [l.categoriaId, pai.get(l.categoriaId)]) if (id) gastoPor.set(id, (gastoPor.get(id) ?? 0) - l.valorCentavos);
  }
  return orcamentos
    .filter((o) => o.limiteCentavos > 0)
    .map((o) => {
      const gasto = gastoPor.get(o.categoriaId) ?? 0;
      const pct = Math.floor((gasto * 100) / o.limiteCentavos);
      const estado = pct >= 100 ? ("estourado" as const) : pct >= ALERTA_PCT ? ("alerta" as const) : ("ok" as const);
      return { ...o, gasto, restante: o.limiteCentavos - gasto, pct, estado };
    })
    .sort((a, b) => b.pct - a.pct);
}
