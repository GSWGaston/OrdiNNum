const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const formatarReais = (centavos: number) => brl.format(centavos / 100);

/** "2026-11-21" -> "21/11/2026" */
export const formatarData = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Converte texto digitado em centavos sem passar por float.
 * Vírgula é decimal ("1.234,56"); sem vírgula, um ponto seguido de 1-2 dígitos é decimal ("12.5").
 * Retorna NaN se inválido.
 */
export function lerReais(texto: string): number {
  let s = texto.replace(/R\$|\s/g, "");
  const negativo = s.startsWith("-");
  if (negativo) s = s.slice(1);
  let inteiro: string;
  let frac = "";
  if (s.includes(",")) {
    [inteiro, frac] = s.split(",", 2) as [string, string];
    inteiro = inteiro.replace(/\./g, "");
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    [inteiro, frac] = s.split(".") as [string, string];
  } else {
    inteiro = s.replace(/\./g, "");
  }
  if (!/^\d+$/.test(inteiro) || !/^\d{0,2}$/.test(frac)) return NaN;
  const c = Number(inteiro) * 100 + Number(frac.padEnd(2, "0"));
  return negativo ? -c : c;
}

/** Centavos -> texto editável "1234,56" (sem separador de milhar). */
export const centavosParaTexto = (c: number) =>
  `${c < 0 ? "-" : ""}${Math.floor(Math.abs(c) / 100)},${String(Math.abs(c) % 100).padStart(2, "0")}`;
