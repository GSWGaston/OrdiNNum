import "server-only";
import { converterContaPluggy, converterItemPluggy, converterTransacaoPluggy, type ContaPluggy, type ItemPluggy, type TransacaoPluggy } from "./pluggy-converter";
import type { BankProvider } from "./tipos";

// Documentação: https://docs.pluggy.ai (lida em 21/11/2026). Chaves só no servidor (env), nunca no navegador.
const API = "https://api.pluggy.ai";

let cache: { chave: string; expira: number } | null = null;

export class PluggyProvider implements BankProvider {
  readonly nome = "pluggy" as const;
  constructor(
    private clientId: string,
    private clientSecret: string,
  ) {}

  /** API key vale 2 h; reaproveita por 1h50 (recomendação da Pluggy). */
  private async apiKey() {
    if (cache && cache.expira > Date.now()) return cache.chave;
    const r = await fetch(`${API}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: this.clientId, clientSecret: this.clientSecret }),
    });
    if (!r.ok) throw new Error(`Pluggy auth falhou (${r.status})`); // sem corpo: pode conter dados sensíveis
    const { apiKey } = (await r.json()) as { apiKey: string };
    cache = { chave: apiKey, expira: Date.now() + 110 * 60_000 };
    return apiKey;
  }

  private async chamar<T>(caminho: string, init: RequestInit = {}): Promise<T> {
    const r = await fetch(`${API}${caminho}`, {
      ...init,
      headers: { "Content-Type": "application/json", "X-API-KEY": await this.apiKey(), ...init.headers },
    });
    if (!r.ok) throw new Error(`Pluggy ${init.method ?? "GET"} ${caminho.split("?")[0]} falhou (${r.status})`);
    return (r.status === 204 ? undefined : await r.json()) as T;
  }

  /** clientUserId vai dentro de "options" (na raiz a Pluggy descarta em silêncio). */
  async criarTokenConexao(o: { clientUserId: string; itemId?: string }) {
    const { accessToken } = await this.chamar<{ accessToken: string }>("/connect_token", {
      method: "POST",
      body: JSON.stringify({ ...(o.itemId && { itemId: o.itemId }), options: { clientUserId: o.clientUserId } }),
    });
    return accessToken;
  }

  async buscarItem(itemId: string) {
    return converterItemPluggy(await this.chamar<ItemPluggy>(`/items/${encodeURIComponent(itemId)}`));
  }

  async listarContas(itemId: string) {
    const r = await this.chamar<{ results: ContaPluggy[] }>(`/accounts?itemId=${encodeURIComponent(itemId)}&pageSize=500`);
    return r.results.map(converterContaPluggy);
  }

  /** /v2/transactions com cursor (o /transactions antigo sai do ar em 31/12/2026). */
  async listarTransacoes(contaIdExterna: string, desde: string) {
    const todas: TransacaoPluggy[] = [];
    let caminho: string | null = `/v2/transactions?accountId=${encodeURIComponent(contaIdExterna)}&dateFrom=${desde}`;
    for (let i = 0; caminho && i < 100; i++) {
      const r: { results: TransacaoPluggy[]; next: string | null } = await this.chamar(caminho);
      todas.push(...r.results);
      caminho = r.next ? `/v2/transactions${r.next.startsWith("?") ? r.next : `?${r.next}`}` : null;
    }
    return todas.map(converterTransacaoPluggy);
  }

  async excluirItem(itemId: string) {
    await this.chamar(`/items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
  }
}
