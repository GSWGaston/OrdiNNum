# FinanÃ§as (nome provisÃ³rio)

Site de finanÃ§as pessoais que responde todo dia: **quanto posso gastar hoje sem comprometer minha meta do mÃªs?**
Estado atual: **Fase 1 (base)** pronta. PendÃªncias e desvios da especificaÃ§Ã£o: [PENDENCIAS.md](PENDENCIAS.md).

## Como rodar

Requisitos: Node 22+ (testado no 26).

```bash
npm install
cp .env.example .env.local     # preencha AUTH_SECRET (npx auth secret)
npm run seed                   # opcional: cria usuÃ¡rio de EXEMPLO demo@exemplo.test / exemplo123
npm run dev                    # aplica migraÃ§Ãµes e abre em http://localhost:3000
```

Sem `DATABASE_URL`, o app usa **PGlite** (Postgres de verdade, embutido, salvo em `./.pglite`): nada para instalar.
Para Neon/Supabase, coloque a URL em `DATABASE_URL` e rode `npm run db:migrate`.

| Comando | O que faz |
| --- | --- |
| `npm run check` | lint + typecheck + testes unitÃ¡rios |
| `npm run test:e2e` | Playwright (sobe um servidor na porta 3100 com banco separado `.pglite-e2e`) |
| `npm run db:generate` | gera migraÃ§Ã£o apÃ³s mudar `src/db/schema.ts` |
| `npm run seed` | recria o usuÃ¡rio de exemplo (dados fictÃ­cios, marcados "[exemplo]") |

Primeira vez com Playwright: `npx playwright install chromium`.

## VariÃ¡veis de ambiente

| VariÃ¡vel | ObrigatÃ³ria | Uso |
| --- | --- | --- |
| `AUTH_SECRET` | sim | assina/criptografa o cookie de sessÃ£o |
| `DATABASE_URL` | produÃ§Ã£o | Postgres gerenciado; vazio = PGlite local |
| `PGLITE_DIR` | nÃ£o | pasta do PGlite (padrÃ£o `./.pglite`) |
| `AUTH_TRUST_HOST` | fora da Vercel | Auth.js atrÃ¡s de proxy |

## Estrutura

```
src/
  app/
    (auth)/entrar, (auth)/cadastro      login e cadastro
    (app)/page.tsx                      painel: resumo do mÃªs, saldo, por categoria, prÃ³ximos vencimentos
    (app)/lancamentos                   lista filtrÃ¡vel, ediÃ§Ã£o rÃ¡pida, categorizar em lote
    (app)/lancamentos/novo              novo lanÃ§amento (valor, categoria, conta, data=hoje; parcelas)
    (app)/contas                        contas e carteiras com saldo
    (app)/recorrencias                  aluguel, salÃ¡rio, assinaturas; botÃ£o "LanÃ§ar"
    (app)/configuracoes                 categorias, exportar dados, excluir conta
    api/auth/[...nextauth]              Auth.js
    api/exportar                        exportaÃ§Ã£o JSON (tudo) e CSV (lanÃ§amentos)
    acoes.ts                            server actions (validaÃ§Ã£o Zod)
  auth.ts                               Auth.js: e-mail + senha (bcrypt), sessÃ£o JWT em cookie httpOnly
  db/schema.ts, db/index.ts             Drizzle (Postgres); migraÃ§Ãµes em drizzle/
  lib/calculos/                         mÃ³dulo PURO: datas, parcelas, resumo do mÃªs (+ testes)
  lib/dados/                            consultas sempre por usuario_id (+ teste de isolamento)
e2e/                                    Playwright: 2 fluxos principais
scripts/seed.ts                         dados de exemplo
```

Tabelas: `usuario`, `conta`, `cartao`, `categoria` (com `pai_id`), `transacao` (conta **ou** cartão), `recorrencia`.
As demais do modelo (cartÃ£o, metas, orÃ§amento, objetivos, conexÃµes, regras) entram nas fases em que sÃ£o usadas.

## DecisÃµes tomadas

- **Next.js 16 sem `cacheComponents`**: tudo Ã© privado e dinÃ¢mico; o modo clÃ¡ssico Ã© mais simples.
- **Auth.js v5 (Credentials)** com bcrypt custo 12, sessÃ£o JWT em cookie httpOnly. Login com hash falso quando o
  e-mail nÃ£o existe (tempo constante, nÃ£o revela cadastro).
- **Saldo da conta**: para conta manual, `saldo_centavos` Ã© o *saldo de abertura*; o saldo atual = abertura + lanÃ§amentos
  com data atÃ© hoje (lanÃ§amentos futuros, como parcelas, sÃ³ contam quando chegam). Conta do banco (fase 3) usarÃ¡ o saldo
  informado. Assim editar/apagar lanÃ§amento nunca deixa saldo inconsistente.
- **RecorrÃªncia tem `conta_id`** (nÃ£o estava no modelo): precisa saber de onde sai o dinheiro ao lanÃ§ar.
- **RecorrÃªncia Ã© lanÃ§ada por confirmaÃ§Ã£o** ("LanÃ§ar", com valor ajustÃ¡vel para contas variÃ¡veis como luz).
  Pendentes aparecem no painel como prÃ³ximos vencimentos e entram na previsÃ£o de fim do mÃªs.
- **Parcelamento**: o valor digitado Ã© o total; gera 1 transaÃ§Ã£o por mÃªs ligadas por `grupo_parcelas`,
  centavos que sobram vÃ£o na 1Âª parcela (a soma bate exato).
- **CartÃµes de crÃ©dito**: lanÃ§amento vai para uma conta **ou** um cartÃ£o (CHECK no banco). Compra no cartÃ£o Ã© despesa
  no dia da compra e nÃ£o mexe no saldo das contas. Fatura: compra antes do dia de fechamento entra na fatura do mÃªs;
  no dia do fechamento ou depois, na seguinte; vencimento no mesmo mÃªs do fechamento se o dia for maior, senÃ£o no mÃªs
  seguinte (`src/lib/calculos/cartao.ts`). Pagamentos quitam as faturas mais antigas primeiro. CartÃ£o manual:
  disponÃ­vel = limite âˆ’ faturas abertas âˆ’ parcelas futuras.
- **Pagamento de fatura = transferÃªncia**: par de lanÃ§amentos ligados por `transferencia_id` (sai da conta, entra no
  cartÃ£o), fora de receitas/despesas. NÃ£o se edita; excluir uma ponta exclui as duas.
- **TransaÃ§Ã£o ganhou `observacao`** (o mÃ³dulo LanÃ§amentos da especificaÃ§Ã£o cita "observaÃ§Ã£o").
- **Categorias padrÃ£o** criadas no cadastro (Moradia > Aluguel, Luz, Ãgua, Internet etc.).
- **Fuso fixo America/Sao_Paulo** para "hoje".
- **CabeÃ§alhos**: CSP, HSTS, nosniff, frame DENY, Referrer-Policy, Permissions-Policy (`next.config.ts`).
  CSP usa `'unsafe-inline'` em scripts (exigÃªncia do Next sem nonce).
- **CSV** com `;`, vÃ­rgula decimal e BOM (abre direto no Excel em pt-BR); cÃ©lulas de texto protegidas contra injeÃ§Ã£o de fÃ³rmula.
- Tema claro/escuro segue o sistema (`prefers-color-scheme`).

## Teste manual da fase 1

1. `npm run seed && npm run dev`, entre com `demo@exemplo.test` / `exemplo123`.
2. Painel: saldo do mÃªs, saldo em contas, previsÃ£o, despesas por categoria, prÃ³ximos vencimentos (aluguel "atrasada").
3. BotÃ£o **+** â†’ lance R$ 50,00 â†’ volta ao painel com saldo R$ 50 menor.
4. RecorrÃªncias â†’ "LanÃ§ar" no aluguel â†’ vira lanÃ§amento e a prÃ³xima data vai para o mÃªs seguinte.
5. LanÃ§amentos â†’ filtre por texto/mÃªs/conta/categoria; abra um item e edite; marque vÃ¡rios e categorize em lote.
6. Novo lanÃ§amento com 6 parcelas â†’ aparecem 1/6 â€¦ 6/6 nos meses seguintes; "Excluir todas as parcelas".
7. Contas â†’ abra "[exemplo] CartÃ£o": fatura que vence dia 10, limite disponÃ­vel e % de uso; "Registrar pagamento"
   tira o valor da conta corrente sem virar despesa e a prÃ³xima fatura assume.
8. Novo lanÃ§amento escolhendo "ðŸ’³ [exemplo] CartÃ£o" â†’ despesas do mÃªs sobem, saldo em contas nÃ£o muda.
9. Ajustes â†’ crie subcategoria; exporte JSON/CSV; crie outro usuÃ¡rio e confirme que ele nÃ£o vÃª nada do primeiro.
