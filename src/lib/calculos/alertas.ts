// Alertas do painel (spec: vencimentos, orçamento perto do limite, uso de crédito acima de um patamar, gasto diário estourado).
import { formatarReais } from "@/lib/formato";
import { formatarData } from "@/lib/formato";
import { somarDias } from "./datas";

export type Alerta = { nivel: "urgente" | "atencao"; texto: string; href: string };

export const DIAS_AVISO_VENCIMENTO = 3;
export const DIAS_AVISO_CONSENTIMENTO = 15;

export function gerarAlertas(e: {
  hoje: string;
  agora: Date;
  gastoDiario: { alcancavel: boolean; restanteHoje?: number; falta?: number } | null;
  orcamentos: { nome: string; pct: number; estado: "ok" | "alerta" | "estourado" }[];
  credito: { usoPct: number; faixa: "verde" | "amarela" | "vermelha" } | null;
  aPagar: { descricao: string; data: string; valorCentavos: number }[];
  conexoes: { banco: string; status: string; consentimentoAte: Date | null }[];
}): Alerta[] {
  const a: Alerta[] = [];
  const g = e.gastoDiario;
  if (g && !g.alcancavel) a.push({ nivel: "urgente", texto: `A meta do mês não fecha: faltam ${formatarReais(g.falta ?? 0)}`, href: "/orcamento" });
  else if (g?.restanteHoje !== undefined && g.restanteHoje < 0)
    a.push({ nivel: "urgente", texto: `Gasto de hoje passou ${formatarReais(-g.restanteHoje)} do limite`, href: "/orcamento" });

  for (const o of e.orcamentos) {
    if (o.estado === "estourado") a.push({ nivel: "urgente", texto: `${o.nome}: limite do mês estourado (${o.pct}%)`, href: "/orcamento#limites" });
    else if (o.estado === "alerta") a.push({ nivel: "atencao", texto: `${o.nome}: ${o.pct}% do limite do mês`, href: "/orcamento#limites" });
  }

  if (e.credito?.faixa === "vermelha") a.push({ nivel: "urgente", texto: `Uso do crédito alto: ${Math.round(e.credito.usoPct)}% do limite`, href: "/credito" });

  const limite = somarDias(e.hoje, DIAS_AVISO_VENCIMENTO);
  for (const p of e.aPagar) {
    if (p.valorCentavos >= 0 || p.data > limite) continue;
    const quando = p.data < e.hoje ? `atrasada desde ${formatarData(p.data)}` : p.data === e.hoje ? "vence hoje" : p.data === somarDias(e.hoje, 1) ? "vence amanhã" : `vence ${formatarData(p.data)}`;
    a.push({ nivel: p.data < e.hoje ? "urgente" : "atencao", texto: `${p.descricao} (${formatarReais(-p.valorCentavos)}) ${quando}`, href: p.descricao.startsWith("Fatura") ? "/contas" : "/recorrencias" });
  }

  for (const c of e.conexoes) {
    if (c.status === "erro" || c.status === "acao_necessaria") a.push({ nivel: "urgente", texto: `${c.banco}: a conexão precisa de atenção`, href: "/bancos" });
    else if (c.consentimentoAte && c.consentimentoAte.getTime() - e.agora.getTime() < DIAS_AVISO_CONSENTIMENTO * 86_400_000)
      a.push({ nivel: "atencao", texto: `${c.banco}: autorização vence em ${formatarData(c.consentimentoAte.toISOString().slice(0, 10))}; renove`, href: "/bancos" });
  }

  return a.sort((x, y) => (x.nivel === y.nivel ? 0 : x.nivel === "urgente" ? -1 : 1));
}
