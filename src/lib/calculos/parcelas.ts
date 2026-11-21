import { somarMeses } from "./datas";

/**
 * Divide um valor (centavos, com sinal) em n parcelas mensais a partir de `dataInicial`.
 * A sobra da divisão vai para a primeira parcela, então a soma bate exatamente com o total.
 */
export function gerarParcelas(totalCentavos: number, n: number, dataInicial: string) {
  if (!Number.isInteger(totalCentavos) || !Number.isInteger(n) || n < 1) throw new Error("parcelas inválidas");
  const base = Math.trunc(totalCentavos / n);
  const sobra = totalCentavos - base * n;
  return Array.from({ length: n }, (_, i) => ({
    parcela: i + 1,
    valorCentavos: i === 0 ? base + sobra : base,
    data: somarMeses(dataInicial, i),
  }));
}
