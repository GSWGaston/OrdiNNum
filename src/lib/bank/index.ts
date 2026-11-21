import "server-only";
import { FakeProvider } from "./fake";
import { PluggyProvider } from "./pluggy";
import type { BankProvider } from "./tipos";

// Banco simulado só com o servidor de desenvolvimento (`next dev`) ou pedido explícito. Lido como
// process.env.NODE_ENV (o Next fixa no build); desestruturar process.env lia o valor do servidor da Vercel,
// que não é "production", e o simulado aparecia no site publicado.
const simuladoPermitido = () => process.env.NODE_ENV === "development" || process.env.BANK_PROVIDER === "fake";

/**
 * Provedor ativo: Pluggy se PLUGGY_CLIENT_ID/SECRET estão definidos; senão o banco simulado, só em
 * desenvolvimento. null = Open Finance não configurado.
 */
export function provedorAtivo(): BankProvider | null {
  const id = process.env.PLUGGY_CLIENT_ID?.trim();
  const segredo = process.env.PLUGGY_CLIENT_SECRET?.trim();
  if (process.env.BANK_PROVIDER !== "fake" && id && segredo) return new PluggyProvider(id, segredo);
  return simuladoPermitido() ? new FakeProvider() : null;
}

/** Provedor de uma conexão já salva (a conexão lembra com quem foi feita). */
export function provedorPorNome(nome: string): BankProvider | null {
  const ativo = provedorAtivo();
  return ativo?.nome === nome ? ativo : nome === "fake" && simuladoPermitido() ? new FakeProvider() : null;
}

export type { BankProvider } from "./tipos";
