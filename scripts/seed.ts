/**
 * DADOS DE EXEMPLO (fictícios). Cria/recria o usuário demo@exemplo.test com senha "exemplo123"
 * e um mês de lançamentos marcados com "[exemplo]". Uso: npm run seed
 */
import bcrypt from "bcryptjs";
import { db } from "../src/db";
import { hoje, limitesDoMes, somarMesesAoMes } from "../src/lib/calculos/datas";
import { criarCartao, listarCartoes, pagarFatura } from "../src/lib/dados/cartoes";
import { listarCategorias } from "../src/lib/dados/categorias";
import { definirMeta } from "../src/lib/dados/metas";
import { definirOrcamento } from "../src/lib/dados/orcamentos";
import { aportar, criarObjetivo, listarObjetivos } from "../src/lib/dados/objetivos";
import { criarConta, listarContas } from "../src/lib/dados/contas";
import { criarRecorrencia } from "../src/lib/dados/recorrencias";
import { criarTransacao } from "../src/lib/dados/transacoes";
import { buscarPorEmail, criarUsuario, excluirUsuario } from "../src/lib/dados/usuarios";

const EMAIL = "demo@exemplo.test";
const SENHA = "exemplo123";

async function main() {
  const antigo = await buscarPorEmail(db, EMAIL);
  if (antigo) await excluirUsuario(db, antigo.id);

  const uid = await criarUsuario(db, { nome: "Pessoa Exemplo", email: EMAIL, senhaHash: await bcrypt.hash(SENHA, 12) });
  await criarConta(db, uid, { nome: "[exemplo] Conta corrente", tipo: "corrente", saldoCentavos: 250000 });
  await criarConta(db, uid, { nome: "[exemplo] Carteira", tipo: "dinheiro", saldoCentavos: 15000 });
  await criarConta(db, uid, { nome: "[exemplo] Vale-refeição", tipo: "vale", saldoCentavos: 0 });
  const [carteira, corrente, vale] = await listarContas(db, uid, "9999-12-31");
  const cat = new Map((await listarCategorias(db, uid)).map((c) => [c.nome, c.id]));

  const mes = hoje().slice(0, 7);
  const ant = somarMesesAoMes(mes, -1);
  const d = (m: string, dia: number) => `${m}-${String(Math.min(dia, Number(limitesDoMes(m).fim.slice(8)))).padStart(2, "0")}`;

  const lancs: [string, number, string, string, string][] = [
    [d(ant, 5), 650000, "Salário", "[exemplo] Salário", corrente!.id],
    [d(ant, 10), -180000, "Aluguel", "[exemplo] Aluguel", corrente!.id],
    [d(ant, 15), -45000, "Mercado", "[exemplo] Mercado do mês", corrente!.id],
    [d(mes, 1), 80000, "Outras receitas", "[exemplo] Vale-refeição", vale!.id],
    [d(mes, 5), 650000, "Salário", "[exemplo] Salário", corrente!.id],
    [d(mes, 6), -18990, "Luz", "[exemplo] Conta de luz", corrente!.id],
    [d(mes, 7), -9990, "Internet", "[exemplo] Internet", corrente!.id],
    [d(mes, 8), -38750, "Mercado", "[exemplo] Mercado", corrente!.id],
    [d(mes, 9), -4200, "Restaurante", "[exemplo] Almoço", vale!.id],
    [d(mes, 11), -2500, "Transporte público", "[exemplo] Metrô", carteira!.id],
    [d(mes, 12), -15000, "Combustível", "[exemplo] Gasolina", corrente!.id],
    [d(mes, 14), -5590, "Assinaturas", "[exemplo] Streaming", corrente!.id],
    [d(mes, 16), -12000, "Lazer", "[exemplo] Cinema", carteira!.id],
    [d(mes, 18), -3800, "Restaurante", "[exemplo] Café", vale!.id],
  ];
  for (const [data, valorCentavos, c, descricao, contaId] of lancs)
    await criarTransacao(db, uid, { data, valorCentavos, categoriaId: cat.get(c) ?? null, descricao, contaId, cartaoId: null, observacao: null, parcelas: 1 });

  await criarTransacao(db, uid, {
    data: d(mes, 3), valorCentavos: -120000, categoriaId: cat.get("Outros") ?? null, descricao: "[exemplo] Geladeira 6x",
    contaId: corrente!.id, cartaoId: null, observacao: "parcelado no boleto", parcelas: 6,
  });

  await criarCartao(db, uid, { nome: "[exemplo] Cartão", bandeira: "Mastercard", limiteTotalCentavos: 500000, diaFechamento: 3, diaVencimento: 10 });
  const [cartao] = await listarCartoes(db, uid);
  const noCartao: [string, number, string, string, number][] = [
    [d(ant, 20), -25000, "Mercado", "[exemplo] Mercado no cartão", 1],
    [d(mes, 4), -18000, "Restaurante", "[exemplo] Jantar", 1],
    [d(mes, 12), -9990, "Assinaturas", "[exemplo] Música", 1],
    [d(mes, 15), -90000, "Outros", "[exemplo] Fone 3x", 3],
  ];
  for (const [data, valorCentavos, c, descricao, parcelas] of noCartao)
    await criarTransacao(db, uid, { data, valorCentavos, categoriaId: cat.get(c) ?? null, descricao, contaId: null, cartaoId: cartao!.id, observacao: null, parcelas });
  await pagarFatura(db, uid, { cartaoId: cartao!.id, contaId: corrente!.id, valorCentavos: 25000, data: d(mes, 10) });

  const prox = somarMesesAoMes(mes, 1);
  await criarRecorrencia(db, uid, { descricao: "[exemplo] Aluguel", valorCentavos: -180000, periodicidade: "mensal", proximaData: d(mes, 10), contaId: corrente!.id, categoriaId: cat.get("Aluguel") ?? null, automatica: true });
  await criarRecorrencia(db, uid, { descricao: "[exemplo] Salário", valorCentavos: 650000, periodicidade: "mensal", proximaData: d(prox, 5), contaId: corrente!.id, categoriaId: cat.get("Salário") ?? null, automatica: true });
  await criarRecorrencia(db, uid, { descricao: "[exemplo] Academia", valorCentavos: -11990, periodicidade: "mensal", proximaData: d(mes, 25), contaId: corrente!.id, categoriaId: cat.get("Saúde") ?? null });

  await definirMeta(db, uid, mes, { modo: "economizar", valorCentavos: 50000 });
  await definirOrcamento(db, uid, mes, cat.get("Alimentação")!, 70000);
  await definirOrcamento(db, uid, mes, cat.get("Carro")!, 20000);

  const hojeISO = hoje();
  await criarObjetivo(db, uid, { nome: "[exemplo] Viagem", valorAlvoCentavos: 600000, prazo: d(somarMesesAoMes(mes, 8), 21) }, d(somarMesesAoMes(mes, -4), 21));
  await criarObjetivo(db, uid, { nome: "[exemplo] Reserva de emergência", valorAlvoCentavos: 1500000, prazo: null }, d(somarMesesAoMes(mes, -6), 1));
  const objs = await listarObjetivos(db, uid, hojeISO);
  const viagem = objs.find((o) => o.nome.includes("Viagem"))!;
  const reserva = objs.find((o) => o.nome.includes("Reserva"))!;
  for (const m of [-3, -2, -1]) await aportar(db, uid, viagem.id, { data: d(somarMesesAoMes(mes, m), 6), valorCentavos: 50000 });
  for (const m of [-3, -2, -1]) await aportar(db, uid, reserva.id, { data: d(somarMesesAoMes(mes, m), 6), valorCentavos: 100000 });

  console.log(`Seed pronto: ${EMAIL} / ${SENHA} (dados fictícios)`);
}

main().then(() => process.exit(0), (e) => {
  console.error(e);
  process.exit(1);
});
