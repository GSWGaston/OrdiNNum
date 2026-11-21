"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { db } from "@/db";
import { lerReais } from "@/lib/formato";
import { atualizarCategoria, criarCategoria, excluirCategoria } from "@/lib/dados/categorias";
import { ErroDados } from "@/lib/dados/comum";
import { atualizarCartao, criarCartao, excluirCartao, marcarFaturaPaga, pagarFatura } from "@/lib/dados/cartoes";
import { atualizarConta, criarConta, excluirConta, transferir } from "@/lib/dados/contas";
import {
  atualizarRecorrencia,
  criarRecorrencia,
  definirAutomatica,
  excluirRecorrencia,
  lancarRecorrencia,
  pularOcorrencia,
} from "@/lib/dados/recorrencias";
import {
  atualizarTransacao,
  categorizarEmLote,
  criarTransacao,
  excluirParcelamento,
  excluirTransacao,
} from "@/lib/dados/transacoes";
import { buscarPorEmail, criarUsuario, excluirUsuario } from "@/lib/dados/usuarios";
import { provedorAtivo, provedorPorNome } from "@/lib/bank";
import { FakeProvider } from "@/lib/bank/fake";
import { desconectar, listarConexoes, registrarItem, sincronizarConexao } from "@/lib/dados/conexoes";
import { aplicarRegrasSemCategoria, criarRegra, excluirRegra } from "@/lib/dados/regras";
import { definirFaixas } from "@/lib/dados/credito";
import { definirMeta } from "@/lib/dados/metas";
import { aportar, arquivarObjetivo, atualizarObjetivo, criarObjetivo, excluirAporte, excluirObjetivo } from "@/lib/dados/objetivos";
import { hoje } from "@/lib/calculos/datas";
import { definirOrcamento } from "@/lib/dados/orcamentos";
import { JANELA_MIN } from "@/lib/dados/tentativas";
import type { Estado } from "@/lib/estado";
import { exigirUsuario } from "@/lib/sessao";

z.config(z.locales.pt());

// ---------- validação (fronteira de confiança: tudo que vem do navegador passa por aqui) ----------

const vazioParaNulo = (v: unknown) => (v === "" || v === undefined ? null : v);
const id = z.uuid({ error: "Registro inválido." });
const idOpcional = z.preprocess(vazioParaNulo, z.uuid().nullable());
const valor = z
  .string()
  .transform(lerReais)
  .pipe(z.number({ error: "Valor inválido. Use o formato 1.234,56." }).int().positive("Informe um valor maior que zero.").max(1e11));
const dia = z.iso.date({ error: "Data inválida." });
const texto = (max: number) => z.string().trim().max(max);
const tipo = z.enum(["despesa", "receita"]);
const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida.");

const comSinal = (t: "despesa" | "receita", v: number) => (t === "despesa" ? -v : v);

// "conta:<id>" ou "cartao:<id>" (um select só para os dois)
const onde = z
  .string()
  .regex(/^(conta|cartao):[0-9a-f-]{36}$/i, "Escolha uma conta ou um cartão.")
  .transform((s) => {
    const [t, oid] = s.split(":") as [string, string];
    return t === "conta" ? { contaId: oid, cartaoId: null } : { contaId: null, cartaoId: oid };
  });
const diaDoMes = z.coerce.number().int().min(1, "Dia entre 1 e 31.").max(31, "Dia entre 1 e 31.");

const lancamento = z.object({
  tipo,
  valor,
  data: dia,
  onde,
  categoriaId: idOpcional,
  descricao: texto(200).default(""),
  observacao: z.preprocess(vazioParaNulo, texto(1000).nullable()).default(null),
});

function ler<T extends z.ZodType>(schema: T, fd: FormData) {
  return schema.safeParse(Object.fromEntries(fd));
}
const msg = (e: z.ZodError) => e.issues[0]?.message ?? "Dados inválidos.";

async function rodar(fn: (uid: string) => Promise<unknown>, ok = "Salvo."): Promise<Estado> {
  const uid = await exigirUsuario();
  try {
    await fn(uid);
  } catch (e) {
    if (e instanceof ErroDados) return { erro: e.message };
    throw e;
  }
  revalidatePath("/", "layout");
  return { ok };
}

// ---------- autenticação ----------

const cadastro = z.object({
  nome: texto(100).min(1, "Informe seu nome."),
  email: z.email("E-mail inválido.").max(200),
  senha: z.string().min(8, "A senha precisa de pelo menos 8 caracteres.").max(200),
});

export async function cadastrar(_: Estado, fd: FormData): Promise<Estado> {
  const p = ler(cadastro, fd);
  if (!p.success) return { erro: msg(p.error) };
  const email = p.data.email.toLowerCase();
  if (await buscarPorEmail(db, email)) return { erro: "Este e-mail já tem cadastro." };
  await criarUsuario(db, { nome: p.data.nome, email, senhaHash: await bcrypt.hash(p.data.senha, 12) });
  await signIn("credentials", { email, senha: p.data.senha, redirectTo: "/" });
  return null;
}

export async function entrar(_: Estado, fd: FormData): Promise<Estado> {
  try {
    await signIn("credentials", { email: fd.get("email"), senha: fd.get("senha"), redirectTo: "/" });
  } catch (e) {
    if (e instanceof AuthError)
      return {
        erro:
          (e as { code?: string }).code === "bloqueado"
            ? `Muitas tentativas erradas. Espere ${JANELA_MIN} minutos e tente de novo.`
            : "E-mail ou senha inválidos.",
      };
    throw e; // inclui o redirect de sucesso
  }
  return null;
}

export async function sair() {
  await signOut({ redirectTo: "/entrar" });
}

export async function excluirMinhaConta(_: Estado, fd: FormData): Promise<Estado> {
  const uid = await exigirUsuario();
  if (fd.get("confirmacao") !== "EXCLUIR") return { erro: 'Digite EXCLUIR para confirmar.' };
  await excluirUsuario(db, uid);
  await signOut({ redirectTo: "/entrar" });
  return null;
}

export async function definirTema(_: Estado, fd: FormData): Promise<Estado> {
  const p = z.enum(["sistema", "claro", "escuro"]).safeParse(fd.get("tema"));
  if (!p.success) return { erro: "Tema inválido." };
  const c = await cookies();
  if (p.data === "sistema") c.delete("tema");
  else c.set("tema", p.data, { maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  revalidatePath("/", "layout");
  return { ok: "Tema aplicado." };
}

// ---------- meta do mês ----------

export async function salvarMeta(_: Estado, fd: FormData) {
  const p = ler(
    z.object({
      mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido."),
      modo: z.enum(["economizar", "saldo_final"], { error: "Escolha o tipo de meta." }),
      // meta zero é válida ("terminar com R$ 0"), por isso não usa o `valor` (que exige > 0)
      valor: z.string().transform(lerReais).pipe(z.number({ error: "Valor inválido. Use o formato 1.234,56." }).int().min(0).max(1e11)),
    }),
    fd,
  );
  if (!p.success) return { erro: msg(p.error) };
  const { mes, modo, valor: v } = p.data;
  return rodar((uid) => definirMeta(db, uid, mes, { modo, valorCentavos: v }), "Meta salva.");
}

const mesTexto = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido.");

export async function salvarOrcamento(_: Estado, fd: FormData) {
  const p = ler(
    z.object({
      mes: mesTexto,
      categoriaId: z.uuid({ error: "Escolha a categoria." }),
      valor: z.string().transform((s) => (s.trim() === "" ? 0 : lerReais(s))).pipe(z.number({ error: "Valor inválido." }).int().min(0).max(1e11)),
    }),
    fd,
  );
  if (!p.success) return { erro: msg(p.error) };
  const { mes, categoriaId, valor: v } = p.data;
  return rodar((uid) => definirOrcamento(db, uid, mes, categoriaId, v), v ? "Limite salvo." : "Limite removido.");
}

export async function salvarFaixas(_: Estado, fd: FormData) {
  const pct = z.coerce.number({ error: "Informe um número." }).int().min(1).max(100);
  const p = ler(z.object({ amarelaPct: pct, vermelhaPct: pct }), fd);
  if (!p.success) return { erro: msg(p.error) };
  return rodar((uid) => definirFaixas(db, uid, p.data), "Faixas salvas.");
}

// ---------- Open Finance ----------

const SEM_OPEN_FINANCE = "Open Finance não está configurado neste servidor (veja o README: PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET).";

/** Token curto para o widget da Pluggy abrir no navegador (a chave da API nunca sai do servidor). */
export async function tokenConexaoBanco(): Promise<{ token: string | null; erro?: string }> {
  const uid = await exigirUsuario();
  const p = provedorAtivo();
  if (!p) return { token: null, erro: SEM_OPEN_FINANCE };
  try {
    return { token: await p.criarTokenConexao({ clientUserId: uid }) };
  } catch {
    return { token: null, erro: "Não foi possível falar com o agregador agora. Tente de novo em instantes." };
  }
}

const itemId = z.string().trim().regex(/^[0-9a-f-]{36}$/i, "ID do item inválido (é um código como 1a2b3c4d-...).");

async function registrar(id: string): Promise<Estado> {
  const p = provedorAtivo();
  if (!p) return { erro: SEM_OPEN_FINANCE };
  let r: { contas: number; transacoes: number } | undefined;
  const estado = await rodar(async (uid) => {
    r = await registrarItem(db, uid, p, id);
  });
  return estado?.erro ? estado : { ok: `Banco conectado: ${r?.contas} conta(s)/cartão(ões) e ${r?.transacoes} lançamento(s) importados.` };
}

/** Chamado pelo widget quando a conexão termina (ou fica pendente de autorização no banco). */
export async function registrarItemAcao(id: string): Promise<Estado> {
  const p = itemId.safeParse(id);
  return p.success ? registrar(p.data) : { erro: msg(p.error) };
}

/** Meu Pluggy: o usuário cola o ID do item que aparece no painel da Pluggy. */
export async function conectarPorItemId(_: Estado, fd: FormData) {
  const p = itemId.safeParse(fd.get("itemId"));
  return p.success ? registrar(p.data) : { erro: msg(p.error) };
}

/** Só sem Pluggy configurada (desenvolvimento): conecta o banco simulado, com dados fictícios. */
export async function conectarSimulado(): Promise<Estado> {
  if (provedorAtivo()?.nome !== "fake") return { erro: "O banco simulado só existe em desenvolvimento." };
  let r: { contas: number; transacoes: number } | undefined;
  const estado = await rodar(async (uid) => {
    r = await registrarItem(db, uid, new FakeProvider(), `00000000-0000-4000-8000-${uid.replace(/-/g, "").slice(0, 12)}`);
  });
  return estado?.erro ? estado : { ok: `Banco simulado conectado: ${r?.transacoes} lançamento(s) de exemplo importados.` };
}

async function provedorDaConexao(uid: string, conexaoId: string) {
  const c = (await listarConexoes(db, uid)).find((x) => x.id === conexaoId);
  return c ? provedorPorNome(c.provedor) : null;
}

export async function sincronizarAgora(_: Estado, fd: FormData) {
  const p = id.safeParse(fd.get("id"));
  if (!p.success) return { erro: msg(p.error) };
  return rodar(async (uid) => {
    const prov = await provedorDaConexao(uid, p.data);
    if (!prov) throw new ErroDados(SEM_OPEN_FINANCE);
    await sincronizarConexao(db, uid, p.data, prov);
  }, "Sincronizado.");
}

export async function desconectarAcao(_: Estado, fd: FormData) {
  const p = z.object({ id, historico: z.enum(["manter", "apagar"], { error: "Escolha o que fazer com o histórico." }) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { erro: msg(p.error) };
  return rodar(async (uid) => {
    const prov = await provedorDaConexao(uid, p.data.id);
    try {
      await desconectar(db, uid, p.data.id, prov, p.data.historico === "manter");
    } catch (e) {
      if (e instanceof ErroDados) throw e;
      throw new ErroDados("Não foi possível revogar a autorização no agregador agora. Tente de novo em instantes.");
    }
  }, p.data.historico === "manter" ? "Banco desconectado. Contas e lançamentos ficaram como manuais." : "Banco desconectado e dados importados apagados.");
}

// ---------- regras de categorização ----------

export async function salvarRegra(_: Estado, fd: FormData) {
  const p = ler(
    z.object({
      padraoTexto: texto(80).min(2, "Escreva ao menos 2 letras do texto que aparece na descrição."),
      categoriaId: z.uuid({ error: "Escolha a categoria." }),
      prioridade: z.coerce.number().int().min(0).max(100).default(0),
    }),
    fd,
  );
  if (!p.success) return { erro: msg(p.error) };
  return rodar((uid) => criarRegra(db, uid, p.data), "Regra criada. Vale para os próximos lançamentos importados.");
}

export async function removerRegra(_: Estado, fd: FormData) {
  const p = id.safeParse(fd.get("id"));
  if (!p.success) return { erro: msg(p.error) };
  return rodar((uid) => excluirRegra(db, uid, p.data), "Regra excluída.");
}

export async function aplicarRegrasAcao(): Promise<Estado> {
  let n = 0;
  const r = await rodar(async (uid) => {
    n = await aplicarRegrasSemCategoria(db, uid);
  });
  return r?.erro ? r : { ok: `${n} lançamento(s) sem categoria foram categorizados.` };
}

// ---------- objetivos ----------

export async function salvarObjetivo(_: Estado, fd: FormData) {
  const p = ler(
    z.object({
      id: idOpcional,
      nome: texto(80).min(1, "Dê um nome ao objetivo."),
      alvo: valor,
      prazo: z.preprocess(vazioParaNulo, dia.nullable()),
    }),
    fd,
  );
  if (!p.success) return { erro: msg(p.error) };
  const { id: oid, alvo, ...d } = p.data;
  const dados = { ...d, valorAlvoCentavos: alvo };
  return rodar((uid) => (oid ? atualizarObjetivo(db, uid, oid, dados) : criarObjetivo(db, uid, dados, hoje())), oid ? "Objetivo salvo." : "Objetivo criado.");
}

export async function aportarAcao(_: Estado, fd: FormData) {
  const p = ler(z.object({ objetivoId: id, tipo: z.enum(["guardar", "retirar"]), valor, data: dia }), fd);
  if (!p.success) return { erro: msg(p.error) };
  const { objetivoId, tipo: t, valor: v, data } = p.data;
  return rodar((uid) => aportar(db, uid, objetivoId, { data, valorCentavos: t === "retirar" ? -v : v }), t === "retirar" ? "Retirada registrada." : "Aporte registrado.");
}

export async function removerAporte(_: Estado, fd: FormData) {
  const p = id.safeParse(fd.get("id"));
  if (!p.success) return { erro: msg(p.error) };
  return rodar((uid) => excluirAporte(db, uid, p.data), "Aporte excluído.");
}

export async function arquivarObjetivoAcao(_: Estado, fd: FormData) {
  const p = z.object({ id, arquivar: z.enum(["sim", "nao"]) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { erro: msg(p.error) };
  return rodar((uid) => arquivarObjetivo(db, uid, p.data.id, p.data.arquivar === "sim"), p.data.arquivar === "sim" ? "Objetivo arquivado." : "Objetivo reativado.");
}

export async function removerObjetivo(_: Estado, fd: FormData) {
  const p = id.safeParse(fd.get("id"));
  if (!p.success) return { erro: msg(p.error) };
  return rodar((uid) => excluirObjetivo(db, uid, p.data), "Objetivo excluído.");
}

// ---------- contas ----------

const contaForm = z.object({
  id: idOpcional,
  nome: texto(80).min(1, "Informe o nome da conta."),
  tipo: z.enum(["corrente", "poupanca", "dinheiro", "vale", "investimento"]),
  saldo: z.string().transform((s) => (s.trim() === "" ? 0 : lerReais(s))).pipe(z.number({ error: "Saldo inválido." }).int()),
});

export async function salvarConta(_: Estado, fd: FormData) {
  const p = ler(contaForm, fd);
  if (!p.success) return { erro: msg(p.error) };
  const { id: contaId, saldo, ...d } = p.data;
  const dados = { ...d, saldoCentavos: saldo };
  return rodar((uid) => (contaId ? atualizarConta(db, uid, contaId, dados) : criarConta(db, uid, dados)), "Conta salva.");
}

export async function removerConta(_: Estado, fd: FormData) {
  const p = id.safeParse(fd.get("id"));
  if (!p.success) return { erro: msg(p.error) };
  return rodar((uid) => excluirConta(db, uid, p.data), "Conta excluída.");
}

// ---------- cartões ----------

const cartaoForm = z.object({
  id: idOpcional,
  nome: texto(80).min(1, "Informe o nome do cartão."),
  bandeira: texto(30).min(1, "Escolha a bandeira."),
  limite: valor,
  limitePessoal: z
    .string()
    .optional()
    .transform((s) => (s?.trim() ? lerReais(s) : null))
    .pipe(z.number({ error: "Limite pessoal inválido." }).int().positive("Limite pessoal precisa ser maior que zero.").max(1e11).nullable()),
  diaFechamento: diaDoMes,
  diaVencimento: diaDoMes,
});

export async function salvarCartao(_: Estado, fd: FormData) {
  const p = ler(cartaoForm, fd);
  if (!p.success) return { erro: msg(p.error) };
  const { id: cid, limite, limitePessoal, ...d } = p.data;
  const dados = { ...d, limiteTotalCentavos: limite, limitePessoalCentavos: limitePessoal };
  return rodar((uid) => (cid ? atualizarCartao(db, uid, cid, dados) : criarCartao(db, uid, dados)), "Cartão salvo.");
}

export async function marcarFaturaPagaAcao(_: Estado, fd: FormData) {
  const p = z.object({ id, vencimento: z.preprocess(vazioParaNulo, dia.nullable()) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { erro: msg(p.error) };
  return rodar((uid) => marcarFaturaPaga(db, uid, p.data.id, p.data.vencimento), p.data.vencimento ? "Fatura marcada como paga." : "Marcação desfeita.");
}

export async function removerCartao(_: Estado, fd: FormData) {
  const p = id.safeParse(fd.get("id"));
  if (!p.success) return { erro: msg(p.error) };
  return rodar((uid) => excluirCartao(db, uid, p.data), "Cartão excluído.");
}

export async function pagarFaturaAcao(_: Estado, fd: FormData) {
  const p = ler(z.object({ cartaoId: id, contaId: z.uuid({ error: "Escolha a conta de onde sai o pagamento." }), valor, data: dia }), fd);
  if (!p.success) return { erro: msg(p.error) };
  const { valor: v, ...d } = p.data;
  return rodar((uid) => pagarFatura(db, uid, { ...d, valorCentavos: v }), "Pagamento registrado.");
}

export async function transferirAcao(_: Estado, fd: FormData) {
  const p = ler(
    z.object({
      deContaId: z.uuid({ error: "Escolha a conta de origem." }),
      paraContaId: z.uuid({ error: "Escolha a conta de destino." }),
      valor,
      data: dia,
      descricao: texto(200).default(""),
    }),
    fd,
  );
  if (!p.success) return { erro: msg(p.error) };
  const { valor: v, ...d } = p.data;
  return rodar((uid) => transferir(db, uid, { ...d, valorCentavos: v }), "Transferência registrada.");
}

// ---------- lançamentos ----------

export async function novoLancamento(_: Estado, fd: FormData): Promise<Estado> {
  const p = ler(
    lancamento.extend({ parcelas: z.preprocess((v) => v || undefined, z.coerce.number().int().min(1).max(120).optional()) }),
    fd,
  );
  if (!p.success) return { erro: msg(p.error) };
  const { tipo: t, valor: v, parcelas, onde: o, ...d } = p.data;
  const r = await rodar((uid) => criarTransacao(db, uid, { ...d, ...o, valorCentavos: comSinal(t, v), parcelas: parcelas ?? 1 }));
  if (r?.erro) return r;
  redirect(fd.get("continuar") ? "/lancamentos/novo?salvo=1" : "/");
}

export async function editarLancamento(_: Estado, fd: FormData) {
  const p = ler(lancamento.extend({ id }), fd);
  if (!p.success) return { erro: msg(p.error) };
  const { id: tid, tipo: t, valor: v, onde: o, ...d } = p.data;
  return rodar((uid) => atualizarTransacao(db, uid, tid, { ...d, ...o, valorCentavos: comSinal(t, v) }));
}

export async function removerLancamento(_: Estado, fd: FormData) {
  const p = z.object({ id: idOpcional, grupo: idOpcional }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { erro: msg(p.error) };
  const { id: tid, grupo } = p.data;
  return rodar(async (uid) => {
    if (grupo) await excluirParcelamento(db, uid, grupo);
    else if (tid) await excluirTransacao(db, uid, tid);
  }, "Excluído.");
}

export async function categorizarLote(_: Estado, fd: FormData) {
  const p = z.object({ ids: z.array(id).min(1, "Marque ao menos um lançamento."), categoriaId: idOpcional }).safeParse({
    ids: fd.getAll("ids"),
    categoriaId: fd.get("categoriaId"),
  });
  if (!p.success) return { erro: msg(p.error) };
  return rodar((uid) => categorizarEmLote(db, uid, p.data.ids, p.data.categoriaId), `${p.data.ids.length} lançamento(s) categorizado(s).`);
}

// ---------- categorias ----------

export async function salvarCategoria(_: Estado, fd: FormData) {
  const p = ler(z.object({ nome: texto(60).min(1, "Informe o nome."), tipo, cor, paiId: idOpcional }), fd);
  if (!p.success) return { erro: msg(p.error) };
  return rodar((uid) => criarCategoria(db, uid, p.data), "Categoria criada.");
}

export async function editarCategoria(_: Estado, fd: FormData) {
  const p = ler(z.object({ id, nome: texto(60).min(1, "Informe o nome."), cor }), fd);
  if (!p.success) return { erro: msg(p.error) };
  const { id: cid, ...d } = p.data;
  return rodar((uid) => atualizarCategoria(db, uid, cid, d));
}

export async function removerCategoria(_: Estado, fd: FormData) {
  const p = id.safeParse(fd.get("id"));
  if (!p.success) return { erro: msg(p.error) };
  return rodar((uid) => excluirCategoria(db, uid, p.data), "Categoria excluída.");
}

// ---------- recorrências ----------

export async function salvarRecorrencia(_: Estado, fd: FormData) {
  const p = ler(
    z.object({
      id: idOpcional,
      tipo,
      valor,
      descricao: texto(200).min(1, "Informe a descrição."),
      periodicidade: z.enum(["semanal", "mensal", "anual"]),
      proximaData: dia,
      contaId: z.uuid({ error: "Escolha uma conta." }),
      categoriaId: idOpcional,
      automatica: z.preprocess((v) => v === "on", z.boolean()),
    }),
    fd,
  );
  if (!p.success) return { erro: msg(p.error) };
  const { id: rid, tipo: t, valor: v, ...d } = p.data;
  const dados = { ...d, valorCentavos: comSinal(t, v) };
  return rodar(
    (uid) => (rid ? atualizarRecorrencia(db, uid, rid, dados) : criarRecorrencia(db, uid, dados)),
    rid ? "Recorrência salva." : "Recorrência criada.",
  );
}

export async function pularRecorrencia(_: Estado, fd: FormData) {
  const p = id.safeParse(fd.get("id"));
  if (!p.success) return { erro: msg(p.error) };
  return rodar((uid) => pularOcorrencia(db, uid, p.data), "Ocorrência pulada.");
}

export async function alternarAutomatica(_: Estado, fd: FormData) {
  const p = z.object({ id, automatica: z.enum(["sim", "nao"]) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { erro: msg(p.error) };
  const auto = p.data.automatica === "sim";
  return rodar((uid) => definirAutomatica(db, uid, p.data.id, auto), auto ? "Agora lança sozinha no vencimento." : "Agora espera você lançar.");
}

export async function removerRecorrencia(_: Estado, fd: FormData) {
  const p = id.safeParse(fd.get("id"));
  if (!p.success) return { erro: msg(p.error) };
  return rodar((uid) => excluirRecorrencia(db, uid, p.data), "Recorrência excluída.");
}

export async function lancarRecorrenciaAcao(_: Estado, fd: FormData) {
  const p = z
    .object({ id, valor: z.preprocess((v) => v || undefined, valor.optional()) })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) return { erro: msg(p.error) };
  return rodar((uid) => lancarRecorrencia(db, uid, p.data.id, p.data.valor), "Lançado.");
}
