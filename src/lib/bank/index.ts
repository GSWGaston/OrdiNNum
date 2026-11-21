import "server-only";
import { FakeProvider } from "./fake";
import { PluggyProvider } from "./pluggy";
import type { BankProvider } from "./tipos";

/**
 * Provedor ativo: Pluggy se PLUGGY_CLIENT_ID/SECRET estão definidos; senão o banco simulado,
 * só fora de produção (ou com BANK_PROVIDER=fake). null = Open Finance não configurado.
 */
export function provedorAtivo(): BankProvider | null {
  const { PLUGGY_CLIENT_ID: id, PLUGGY_CLIENT_SECRET: segredo, BANK_PROVIDER, NODE_ENV } = process.env;
  if (BANK_PROVIDER !== "fake" && id && segredo) return new PluggyProvider(id, segredo);
  if (BANK_PROVIDER === "fake" || NODE_ENV !== "production") return new FakeProvider();
  return null;
}

/** Provedor de uma conexão já salva (a conexão lembra com quem foi feita). */
export function provedorPorNome(nome: string): BankProvider | null {
  const ativo = provedorAtivo();
  return ativo?.nome === nome ? ativo : nome === "fake" && process.env.NODE_ENV !== "production" ? new FakeProvider() : null;
}

export type { BankProvider } from "./tipos";
