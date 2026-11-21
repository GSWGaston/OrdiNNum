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
import { atualizarCartao, criarCartao, excluirCartao, pagarFatura } from "@/lib/dados/cartoes";
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
  diaFechamento: diaDoMes,
  diaVencimento: diaDoMes,
});

export async function salvarCartao(_: Estado, fd: FormData) {
  const p = ler(cartaoForm, fd);
  if (!p.success) return { erro: msg(p.error) };
  const { id: cid, limite, ...d } = p.data;
  const dados = { ...d, limiteTotalCentavos: limite };
  return rodar((uid) => (cid ? atualizarCartao(db, uid, cid, dados) : criarCartao(db, uid, dados)), "Cartão salvo.");
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
