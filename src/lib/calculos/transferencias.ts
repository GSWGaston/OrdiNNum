// Transferência entre contas próprias vista dos dois lados (ex.: Pix do Inter que paga a fatura do Nubank):
// sem par, a saída vira despesa e a entrada vira receita, e os totais do mês incham.
import { somarDias } from "./datas";

export const JANELA_DIAS = 3;

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
