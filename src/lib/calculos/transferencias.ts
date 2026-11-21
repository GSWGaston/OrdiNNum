// Transferência entre contas próprias vista dos dois lados (ex.: Pix do Inter que paga a fatura do Nubank):
// sem par, a saída vira despesa e a entrada vira receita, e os totais do mês incham.
import { somarDias } from "./datas";

export const JANELA_DIAS = 3;

/**
 * Sugestões de reembolso para um lançamento: sinal oposto, valor até 20% diferente, até 30 dias de distância,
 * mais parecidos primeiro. Só sugere; quem vincula é o usuário (valor parecido sozinho não prova nada).
 */
export function sugerirReembolsos<T extends { id: string; data: string; valorCentavos: number; transferenciaId?: string | null }>(alvo: T, todos: T[], max = 3) {
  const dias = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
  return todos
    .filter(
      (l) =>
        l.id !== alvo.id &&
        !l.transferenciaId &&
        Math.sign(l.valorCentavos) === -Math.sign(alvo.valorCentavos) &&
        Math.abs(Math.abs(l.valorCentavos) - Math.abs(alvo.valorCentavos)) <= Math.abs(alvo.valorCentavos) * 0.2 &&
        dias(l.data, alvo.data) <= 30,
    )
    .sort(
      (a, b) =>
        Math.abs(Math.abs(a.valorCentavos) - Math.abs(alvo.valorCentavos)) - Math.abs(Math.abs(b.valorCentavos) - Math.abs(alvo.valorCentavos)) ||
        dias(a.data, alvo.data) - dias(b.data, alvo.data),
    )
    .slice(0, max);
}

export type Candidato = { id: string; data: string; valorCentavos: number; contaId: string | null; cartaoId: string | null };

/**
 * Pares (saída, entrada) com o mesmo valor, em contas/cartões diferentes do usuário e até JANELA_DIAS de distância.
 * Saída só de conta (cartão não "envia" dinheiro). Cada lançamento entra em no máximo um par; para cada saída vale a
 * entrada mais próxima na data. Valores iguais por coincidência podem parear errado: o usuário desfaz na tela.
 */
export function parearTransferencias(lancs: Candidato[]): [string, string][] {
  const onde = (l: Candidato) => l.contaId ?? l.cartaoId;
  const saidas = lancs.filter((l) => l.valorCentavos < 0 && l.contaId).sort((a, b) => a.data.localeCompare(b.data));
  const entradas = lancs.filter((l) => l.valorCentavos > 0);
  const usadas = new Set<string>();
  const pares: [string, string][] = [];
  for (const s of saidas) {
    const dist = (e: Candidato) => Math.abs(Date.parse(e.data) - Date.parse(s.data));
    const candidata = entradas
      .filter(
        (e) =>
          !usadas.has(e.id) &&
          e.valorCentavos === -s.valorCentavos &&
          onde(e) !== onde(s) &&
          e.data >= somarDias(s.data, -JANELA_DIAS) &&
          e.data <= somarDias(s.data, JANELA_DIAS),
      )
      .sort((a, b) => dist(a) - dist(b))[0];
    if (!candidata) continue;
    usadas.add(candidata.id);
    pares.push([s.id, candidata.id]);
  }
  return pares;
}
