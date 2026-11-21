import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { aporteObjetivo, cartao, categoria, conta, metaMensal, objetivo, orcamentoCategoria, recorrencia, transacao, usuario } from "@/db/schema";

const PADRAO: [string, "receita" | "despesa", string, string[]][] = [
  ["Moradia", "despesa", "#8b5cf6", ["Aluguel", "Luz", "Água", "Internet"]],
  ["Alimentação", "despesa", "#f97316", ["Mercado", "Restaurante"]],
  ["Transporte", "despesa", "#0ea5e9", ["Transporte público", "Aplicativo e táxi"]],
  ["Carro", "despesa", "#f59e0b", ["Combustível", "Manutenção", "Seguro", "IPVA e licenciamento", "Estacionamento e pedágio"]],
  ["Saúde", "despesa", "#ef4444", []],
  ["Educação", "despesa", "#14b8a6", []],
  ["Lazer", "despesa", "#ec4899", []],
  ["Assinaturas", "despesa", "#6366f1", []],
  ["Outros", "despesa", "#64748b", []],
  ["Salário", "receita", "#16a34a", []],
  ["Outras receitas", "receita", "#22c55e", []],
];

/** Cria o usuário já com categorias padrão. Lança erro de unicidade se o e-mail existir. */
export function criarUsuario(db: Db, d: { nome: string; email: string; senhaHash: string }) {
  return db.transaction(async (tx) => {
    const [u] = await tx.insert(usuario).values(d).returning({ id: usuario.id });
    for (const [nome, tipo, cor, filhas] of PADRAO) {
      const [pai] = await tx.insert(categoria).values({ usuarioId: u!.id, nome, tipo, cor }).returning({ id: categoria.id });
      if (filhas.length)
        await tx.insert(categoria).values(filhas.map((n) => ({ usuarioId: u!.id, nome: n, tipo, cor, paiId: pai!.id })));
    }
    return u!.id;
  });
}

export const buscarPorEmail = async (db: Db, email: string) =>
  (await db.select().from(usuario).where(eq(usuario.email, email)))[0];

export const usuarioExiste = async (db: Db, uid: string) =>
  (await db.select({ id: usuario.id }).from(usuario).where(eq(usuario.id, uid))).length > 0;

/** Tudo do usuário (LGPD: portabilidade). Nunca inclui o hash da senha. */
export async function exportarDados(db: Db, uid: string) {
  const [u] = await db
    .select({ id: usuario.id, nome: usuario.nome, email: usuario.email, criadoEm: usuario.criadoEm })
    .from(usuario)
    .where(eq(usuario.id, uid));
  return {
    usuario: u,
    contas: await db.select().from(conta).where(eq(conta.usuarioId, uid)),
    cartoes: await db.select().from(cartao).where(eq(cartao.usuarioId, uid)),
    categorias: await db.select().from(categoria).where(eq(categoria.usuarioId, uid)),
    recorrencias: await db.select().from(recorrencia).where(eq(recorrencia.usuarioId, uid)),
    metas: await db.select().from(metaMensal).where(eq(metaMensal.usuarioId, uid)),
    orcamentos: await db.select().from(orcamentoCategoria).where(eq(orcamentoCategoria.usuarioId, uid)),
    objetivos: await db.select().from(objetivo).where(eq(objetivo.usuarioId, uid)),
    aportes: await db.select().from(aporteObjetivo).where(eq(aporteObjetivo.usuarioId, uid)),
    transacoes: await db.select().from(transacao).where(eq(transacao.usuarioId, uid)).orderBy(asc(transacao.data)),
  };
}

/** Apaga o usuário; o cascade das FKs leva todos os dados juntos. */
export const excluirUsuario = (db: Db, uid: string) => db.delete(usuario).where(eq(usuario.id, uid));
