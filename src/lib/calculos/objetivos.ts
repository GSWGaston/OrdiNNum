// Objetivos (spec: Regras de cálculo, item 3).
import { somarMeses, somarMesesAoMes } from "./datas";

const dia = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/** Meses entre hoje e o prazo, arredondando para cima; nunca menos que 1 (prazo vencido também dá 1). */
export function mesesRestantes(hoje: string, prazo: string) {
  const [ah, mh, dh] = hoje.split("-").map(Number) as [number, number, number];
  const [ap, mp, dp] = prazo.split("-").map(Number) as [number, number, number];
  const inteiros = (ap - ah) * 12 + (mp - mh);
  return Math.max(1, inteiros + (dp > dh ? 1 : 0));
}

/** Folga para "no ritmo": 5% do valor-alvo para mais ou para menos do esperado. */
export const TOLERANCIA = 0.05;

export type StatusObjetivo = "concluido" | "adiantado" | "no_ritmo" | "atrasado" | "sem_prazo";

/**
 * - Com prazo: AporteMensal = (alvo - guardado) / meses restantes. Esperado hoje = alvo proporcional ao tempo
 *   decorrido desde a criação até o prazo; o andamento compara o guardado com o esperado.
 * - Sem prazo: data estimada = hoje + (alvo - guardado) / média mensal dos aportes dos 3 últimos meses completos
 *   (ex.: em 21/11, agosto a outubro). Sem nada nesses meses, usa o que já foi guardado no mês atual.
 */
export function resumoObjetivo(
  o: { valorAlvoCentavos: number; prazo: string | null; criadoEm: string },
  aportes: { data: string; valorCentavos: number }[],
  hoje: string,
) {
  const guardado = aportes.reduce((s, a) => s + a.valorCentavos, 0);
  const falta = Math.max(0, o.valorAlvoCentavos - guardado);
  const pct = o.valorAlvoCentavos > 0 ? Math.min(100, Math.floor((guardado * 100) / o.valorAlvoCentavos)) : 100;
  const mesAtual = hoje.slice(0, 7);
  const desde = somarMesesAoMes(mesAtual, -3);
  const soma = (f: (mes: string) => boolean) => aportes.filter((a) => f(a.data.slice(0, 7))).reduce((s, a) => s + a.valorCentavos, 0);
  const ultimos3 = soma((m) => m >= desde && m < mesAtual);
  const mediaMensal = ultimos3 > 0 ? Math.floor(ultimos3 / 3) : Math.max(0, soma((m) => m === mesAtual));
  const base = { guardado, falta, pct, mediaMensal };

  if (falta === 0) return { ...base, andamento: "concluido" as StatusObjetivo, aporteMensal: 0, meses: null, esperadoHoje: null, dataEstimada: null };

  if (o.prazo) {
    const meses = mesesRestantes(hoje, o.prazo);
    const total = dia(o.prazo) - dia(o.criadoEm);
    const fracao = total > 0 ? Math.min(1, Math.max(0, (dia(hoje) - dia(o.criadoEm)) / total)) : 1;
    const esperadoHoje = Math.round(o.valorAlvoCentavos * fracao);
    const folga = o.valorAlvoCentavos * TOLERANCIA;
    const andamento: StatusObjetivo = guardado > esperadoHoje + folga ? "adiantado" : guardado < esperadoHoje - folga ? "atrasado" : "no_ritmo";
    return { ...base, andamento, aporteMensal: Math.ceil(falta / meses), meses, esperadoHoje, dataEstimada: null };
  }

  const dataEstimada = mediaMensal > 0 ? somarMeses(hoje, Math.ceil(falta / mediaMensal)) : null;
  return { ...base, andamento: "sem_prazo" as StatusObjetivo, aporteMensal: null, meses: null, esperadoHoje: null, dataEstimada };
}
