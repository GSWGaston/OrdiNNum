import { and, desc, eq, gte, inArray, lte, notInArray, sql, sum, type SQL } from "drizzle-orm";
import type { Db } from "@/db";
import { cartao, conexaoBanco, conta, transacao } from "@/db/schema";
import type { BankProvider } from "@/lib/bank/tipos";
import { hoje as hojeSP, somarDias } from "@/lib/calculos/datas";
import { DIAS_AVISO_CONSENTIMENTO } from "@/lib/calculos/alertas";
import { categorizar } from "@/lib/calculos/regras";
import { cifrar, decifrar } from "@/lib/cripto";
import { ErroDados } from "./comum";
import { listarRegras } from "./regras";

/** Conexões do usuário, sem o id do item (que fica só no servidor, criptografado). */
export const listarConexoes = (db: Db, uid: string) =>
  db
    .select({
      id: conexaoBanco.id,
      provedor: conexaoBanco.provedor,
      banco: conexaoBanco.banco,
      status: conexaoBanco.status,
      erro: conexaoBanco.erro,
      consentimentoAte: conexaoBanco.consentimentoAte,
      ultimaSincronizacao: conexaoBanco.ultimaSincronizacao,
      criadoEm: conexaoBanco.criadoEm,
    })
    .from(conexaoBanco)
    .where(eq(conexaoBanco.usuarioId, uid))
    .orderBy(desc(conexaoBanco.criadoEm));

/** Guarda a conexão (item do agregador). Se o mesmo item já está conectado, devolve a existente. */
export async function criarConexao(db: Db, uid: string, provedor: string, itemId: string) {
  const existentes = await db.select().from(conexaoBanco).where(and(eq(conexaoBanco.usuarioId, uid), eq(conexaoBanco.provedor, provedor)));
  const igual = existentes.find((c) => decifrar(c.itemIdExterno) === itemId);
  if (igual) return igual.id;
  const [c] = await db.insert(conexaoBanco).values({ usuarioId: uid, provedor, itemIdExterno: cifrar(itemId) }).returning({ id: conexaoBanco.id });
  return c!.id;
}

/**
 * Registra um item vindo do widget ou colado (Meu Pluggy) e faz a primeira sincronização.
 * Recusa item criado pelo widget para outro usuário (clientUserId diferente).
 */
export async function registrarItem(db: Db, uid: string, provedor: BankProvider, itemId: string) {
  let item;
  try {
    item = await provedor.buscarItem(itemId);
  } catch {
    throw new ErroDados("Não encontrei essa conexão no agregador. Confira o ID do item.");
  }
  if (item.clientUserId && item.clientUserId !== uid) throw new ErroDados("Essa conexão pertence a outro usuário.");
  const conexaoId = await criarConexao(db, uid, provedor.nome, itemId);
  return { conexaoId, ...(await sincronizarConexao(db, uid, conexaoId, provedor)) };
}

async function conexaoDoUsuario(db: Db, uid: string, id: string) {
  const [c] = await db.select().from(conexaoBanco).where(and(eq(conexaoBanco.id, id), eq(conexaoBanco.usuarioId, uid)));
  if (!c) throw new ErroDados("Conexão não encontrada.");
  return c;
}

export const itemIdDaConexao = async (db: Db, uid: string, id: string) => decifrar((await conexaoDoUsuario(db, uid, id)).itemIdExterno);

const excluido = (coluna: string) => sql.raw(`excluded.${coluna}`);

/**
 * Busca no banco e grava: contas (saldo do banco), cartões (limite e disponível do banco) e transações.
 * Sem duplicar: unicidade (conexão, id externo) + upsert. Categoria e transferência que o usuário ajustou ficam.
 * Na janela consultada, o que o banco não devolve mais (ex.: compra pendente cancelada) é apagado.
 * Primeira vez: 12 meses para trás; depois, desde 30 dias antes da última sincronização.
 */
export async function sincronizarConexao(db: Db, uid: string, conexaoId: string, provedor: BankProvider, agora = new Date()) {
  const cx = await conexaoDoUsuario(db, uid, conexaoId);
  const itemId = decifrar(cx.itemIdExterno);
  const dia = hojeSP(agora);
  const desde = cx.ultimaSincronizacao ? somarDias(hojeSP(cx.ultimaSincronizacao), -30) : somarDias(dia, -365);
  try {
    const [item, contasBanco, regras] = await Promise.all([provedor.buscarItem(itemId), provedor.listarContas(itemId), listarRegras(db, uid)]);
    const transacoesPorConta = await Promise.all(contasBanco.map((c) => provedor.listarTransacoes(c.idExterno, desde)));
    let importadas = 0;

    await db.transaction(async (tx) => {
      for (const [i, cb] of contasBanco.entries()) {
        let alvo: { contaId: string | null; cartaoId: string | null };
        if (cb.tipo === "conta") {
          const [c] = await tx
            .insert(conta)
            .values({ usuarioId: uid, nome: cb.nome, tipo: cb.subtipo, saldoCentavos: cb.saldoCentavos, origem: "open_finance", conexaoId, idExterno: cb.idExterno })
            .onConflictDoUpdate({ target: [conta.conexaoId, conta.idExterno], set: { saldoCentavos: cb.saldoCentavos } })
            .returning({ id: conta.id });
          alvo = { contaId: c!.id, cartaoId: null };
        } else {
          const dias = { ...(cb.diaFechamento && { diaFechamento: cb.diaFechamento }), ...(cb.diaVencimento && { diaVencimento: cb.diaVencimento }) };
          const [c] = await tx
            .insert(cartao)
            .values({
              usuarioId: uid,
              nome: cb.nome,
              bandeira: cb.bandeira,
              limiteTotalCentavos: cb.limiteTotalCentavos,
              limiteDisponivelCentavos: cb.limiteDisponivelCentavos,
              // Open Finance não informa o fechamento: começa em 1 e o usuário ajusta em Contas
              diaFechamento: cb.diaFechamento ?? 1,
              diaVencimento: cb.diaVencimento ?? 10,
              conexaoId,
              idExterno: cb.idExterno,
            })
            .onConflictDoUpdate({
              target: [cartao.conexaoId, cartao.idExterno],
              set: { limiteTotalCentavos: cb.limiteTotalCentavos, limiteDisponivelCentavos: cb.limiteDisponivelCentavos, ...dias },
            })
            .returning({ id: cartao.id });
          alvo = { contaId: null, cartaoId: c!.id };
        }

        const lista = transacoesPorConta[i]!;
        if (lista.length)
          await tx
            .insert(transacao)
            .values(
              lista.map((t) => ({
                usuarioId: uid,
                ...alvo,
                data: t.data,
                valorCentavos: t.valorCentavos,
                descricao: t.descricao,
                categoriaId: t.ehTransferencia ? null : categorizar(t.descricao, regras),
                parcelaAtual: t.parcelaAtual,
                parcelasTotal: t.parcelasTotal,
                transferenciaId: t.ehTransferencia ? crypto.randomUUID() : null,
                origem: "open_finance" as const,
                conexaoId,
                idExterno: t.idExterno,
              })),
            )
            .onConflictDoUpdate({
              target: [transacao.conexaoId, transacao.idExterno],
              set: {
                data: excluido("data"),
                valorCentavos: excluido("valor_centavos"),
                descricao: excluido("descricao"),
                parcelaAtual: excluido("parcela_atual"),
                parcelasTotal: excluido("parcelas_total"),
              },
            });
        importadas += lista.length;

        // o que sumiu do banco dentro da janela consultada sai daqui também
        const daConta: SQL = alvo.contaId ? eq(transacao.contaId, alvo.contaId) : eq(transacao.cartaoId, alvo.cartaoId!);
        const ids = lista.map((t) => t.idExterno);
        await tx
          .delete(transacao)
          .where(
            and(
              eq(transacao.usuarioId, uid),
              eq(transacao.conexaoId, conexaoId),
              daConta,
              gte(transacao.data, desde),
              ...(ids.length ? [notInArray(transacao.idExterno, ids)] : []),
            ),
          );
      }
      await tx
        .update(conexaoBanco)
        .set({ banco: item.banco, status: item.status, erro: item.erro, consentimentoAte: item.consentimentoAte, ultimaSincronizacao: agora })
        .where(eq(conexaoBanco.id, conexaoId));
    });
    return { contas: contasBanco.length, transacoes: importadas };
  } catch (e) {
    // a mensagem é nossa (sem token nem corpo de resposta do agregador)
    const msg = e instanceof Error ? e.message.slice(0, 300) : "erro desconhecido";
    await db.update(conexaoBanco).set({ status: "erro", erro: msg }).where(eq(conexaoBanco.id, conexaoId));
    throw new ErroDados(`Não foi possível sincronizar agora: ${msg}`);
  }
}

/**
 * Desconecta: revoga no agregador e apaga a conexão. Com `manterHistorico`, contas, cartões e lançamentos ficam como
 * manuais (o saldo de hoje é preservado); sem, tudo que veio dessa conexão é apagado. (spec: perguntar ao usuário)
 */
export async function desconectar(db: Db, uid: string, conexaoId: string, provedor: BankProvider | null, manterHistorico: boolean, dia = hojeSP()) {
  const cx = await conexaoDoUsuario(db, uid, conexaoId);
  if (provedor) await provedor.excluirItem(decifrar(cx.itemIdExterno));
  await db.transaction(async (tx) => {
    const contas = await tx.select().from(conta).where(and(eq(conta.usuarioId, uid), eq(conta.conexaoId, conexaoId)));
    if (manterHistorico) {
      for (const c of contas) {
        const [s] = await tx
          .select({ total: sum(transacao.valorCentavos).mapWith(Number) })
          .from(transacao)
          .where(and(eq(transacao.contaId, c.id), lte(transacao.data, dia)));
        // conta manual: saldo atual = abertura + lançamentos; a abertura que mantém o saldo de hoje é saldo - soma
        await tx.update(conta).set({ origem: "manual", conexaoId: null, idExterno: null, saldoCentavos: c.saldoCentavos - (s?.total ?? 0) }).where(eq(conta.id, c.id));
      }
      await tx.update(cartao).set({ conexaoId: null, idExterno: null, limiteDisponivelCentavos: null }).where(and(eq(cartao.usuarioId, uid), eq(cartao.conexaoId, conexaoId)));
      await tx.update(transacao).set({ conexaoId: null, idExterno: null, origem: "manual" }).where(and(eq(transacao.usuarioId, uid), eq(transacao.conexaoId, conexaoId)));
    } else {
      await tx.delete(transacao).where(and(eq(transacao.usuarioId, uid), eq(transacao.conexaoId, conexaoId)));
      if (contas.length) await tx.delete(conta).where(inArray(conta.id, contas.map((c) => c.id)));
      await tx.delete(cartao).where(and(eq(cartao.usuarioId, uid), eq(cartao.conexaoId, conexaoId)));
    }
    await tx.delete(conexaoBanco).where(eq(conexaoBanco.id, conexaoId));
  });
}

/** Rotina diária (Vercel Cron): sincroniza todas as conexões de todos os usuários. Erros ficam na conexão. */
export async function sincronizarTodas(db: Db, provedorDe: (nome: string) => BankProvider | null) {
  const todas = await db.select({ id: conexaoBanco.id, usuarioId: conexaoBanco.usuarioId, provedor: conexaoBanco.provedor }).from(conexaoBanco);
  let ok = 0;
  let falhas = 0;
  for (const c of todas) {
    const p = provedorDe(c.provedor);
    if (!p) continue;
    try {
      await sincronizarConexao(db, c.usuarioId, c.id, p);
      ok++;
    } catch {
      falhas++;
    }
  }
  return { ok, falhas };
}

/** Autorização vencendo nos próximos dias (mesmo prazo do alerta do painel). */
export const consentimentoVencendo = (ate: Date | null, agora = new Date(), dias = DIAS_AVISO_CONSENTIMENTO) =>
  !!ate && ate.getTime() - agora.getTime() < dias * 86_400_000;
