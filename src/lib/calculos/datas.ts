// Datas como texto ISO "AAAA-MM-DD" / meses "AAAA-MM": sem fuso, sem objetos Date mutáveis.

export type Periodicidade = "semanal" | "mensal" | "anual";

const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");

/** Soma meses mantendo o dia, limitado ao último dia do mês (31/01 + 1 = 28 ou 29/02). */
export function somarMeses(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number) as [number, number, number];
  const total = a * 12 + (m - 1) + n;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  return `${ano}-${pad(mes)}-${pad(Math.min(d, ultimoDia(ano, mes)))}`;
}

export function somarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// shortcut: mensal a partir de 31/01 vira 28/02 e depois 28/03 (perde o dia original); guardar dia-âncora se incomodar.
export function proximaData(iso: string, p: Periodicidade): string {
  if (p === "semanal") return somarDias(iso, 7);
  return somarMeses(iso, p === "mensal" ? 1 : 12);
}

/** Datas de uma recorrência a partir de `inicio` até `fim` (inclusive). */
export function ocorrenciasAte(inicio: string, p: Periodicidade, fim: string): string[] {
  const datas: string[] = [];
  for (let d = inicio; d <= fim; d = proximaData(d, p)) datas.push(d);
  return datas;
}

export function limitesDoMes(mes: string) {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  return { inicio: `${mes}-01`, fim: `${mes}-${pad(ultimoDia(a, m))}` };
}

export const somarMesesAoMes = (mes: string, n: number) => somarMeses(`${mes}-01`, n).slice(0, 7);

export const mesValido = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

// shortcut: fuso fixo de São Paulo; virar preferência do usuário se houver gente fora dele.
export const hoje = (agora = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);

const NOMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** "2026-12-07" ou "2026-12" -> "dezembro" */
export const mesPorExtenso = (data: string) => NOMES[Number(data.slice(5, 7)) - 1]!;

export const nomeDoMes = (mes: string) => {
  const n = NOMES[Number(mes.slice(5)) - 1]!;
  return `${n[0]!.toUpperCase()}${n.slice(1)} de ${mes.slice(0, 4)}`;
};
