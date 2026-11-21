import { db } from "@/db";
import { hoje } from "@/lib/calculos/datas";
import { exportarDados } from "@/lib/dados/usuarios";
import { centavosParaTexto } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";

// Texto começando com = + - @ vira fórmula no Excel; o apóstrofo neutraliza (injeção de CSV).
const cel = (s: string | null | undefined) => `"${(s ?? "").replace(/^([=+\-@\t\r])/, "'$1").replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const uid = await exigirUsuario();
  const dados = await exportarDados(db, uid);
  const csv = new URL(req.url).searchParams.get("formato") === "csv";
  const nome = `financas-${hoje()}.${csv ? "csv" : "json"}`;
  const cabecalhos = {
    "Content-Disposition": `attachment; filename="${nome}"`,
    "Cache-Control": "no-store",
  };

  if (!csv) return Response.json(dados, { headers: cabecalhos });

  const conta = new Map([...dados.contas, ...dados.cartoes].map((c) => [c.id, c.nome]));
  const cat = new Map(dados.categorias.map((c) => [c.id, c.nome]));
  const linhas = dados.transacoes.map((t) =>
    [
      t.data,
      cel(t.descricao),
      centavosParaTexto(t.valorCentavos),
      cel(conta.get((t.contaId ?? t.cartaoId)!)),
      cel(t.categoriaId ? cat.get(t.categoriaId) : ""),
      t.parcelasTotal ? `${t.parcelaAtual}/${t.parcelasTotal}` : "",
      cel(t.observacao),
    ].join(";"),
  );
  // BOM + ";" + vírgula decimal: abre direto no Excel em português.
  const corpo = "﻿" + ["data;descricao;valor;conta_ou_cartao;categoria;parcela;observacao", ...linhas].join("\r\n");
  return new Response(corpo, { headers: { ...cabecalhos, "Content-Type": "text/csv; charset=utf-8" } });
}
