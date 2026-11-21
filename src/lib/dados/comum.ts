import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { categoria, conta } from "@/db/schema";

/** Erro com mensagem segura para mostrar ao usuário. */
export class ErroDados extends Error {}

// Toda referência vinda do formulário é conferida contra o usuario_id: ninguém lança na conta de outro.
export async function contaDoUsuario(db: Db, uid: string, id: string) {
  const [c] = await db.select({ id: conta.id }).from(conta).where(and(eq(conta.id, id), eq(conta.usuarioId, uid)));
  if (!c) throw new ErroDados("Conta não encontrada.");
}

export async function categoriaDoUsuario(db: Db, uid: string, id: string) {
  const [c] = await db
    .select({ id: categoria.id, tipo: categoria.tipo, paiId: categoria.paiId })
    .from(categoria)
    .where(and(eq(categoria.id, id), eq(categoria.usuarioId, uid)));
  if (!c) throw new ErroDados("Categoria não encontrada.");
  return c;
}
