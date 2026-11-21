# Finanças (nome provisório)

Site de finanças pessoais que responde todo dia: **quanto posso gastar hoje sem comprometer minha meta do mês?**
Estado atual: **Fase 1 (base)** pronta. Pendências e desvios da especificação: [PENDENCIAS.md](PENDENCIAS.md).

## Como rodar

Requisitos: Node 22+ (testado no 26).

```bash
npm install
cp .env.example .env.local     # preencha AUTH_SECRET (npx auth secret)
npm run seed                   # opcional: cria usuário de EXEMPLO demo@exemplo.test / exemplo123
npm run dev                    # aplica migrações e abre em http://localhost:3000
```

Sem `DATABASE_URL`, o app usa **PGlite** (Postgres de verdade, embutido, salvo em `./.pglite`): nada para instalar.
Para Neon/Supabase, coloque a URL em `DATABASE_URL` e rode `npm run db:migrate`.

| Comando | O que faz |
| --- | --- |
| `npm run check` | lint + typecheck + testes unitários |
| `npm run test:e2e` | Playwright (sobe um servidor na porta 3100 com banco separado `.pglite-e2e`) |
| `npm run db:generate` | gera migração após mudar `src/db/schema.ts` |
| `npm run seed` | recria o usuário de exemplo (dados fictícios, marcados "[exemplo]") |

Primeira vez com Playwright: `npx playwright install chromium`.

## Variáveis de ambiente

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `AUTH_SECRET` | sim | assina/criptografa o cookie de sessão |
| `DATABASE_URL` | produção | Postgres gerenciado; vazio = PGlite local |
| `PGLITE_DIR` | não | pasta do PGlite (padrão `./.pglite`) |
| `AUTH_TRUST_HOST` | fora da Vercel | Auth.js atrás de proxy |

## Estrutura

```
src/
  app/
    (auth)/entrar, (auth)/cadastro      login e cadastro
    (app)/page.tsx                      painel: resumo do mês, saldo, por categoria, próximos vencimentos
    (app)/lancamentos                   lista filtrável, edição rápida, categorizar em lote
    (app)/lancamentos/novo              novo lançamento (valor, categoria, conta, data=hoje; parcelas)
    (app)/contas                        contas e carteiras com saldo
    (app)/recorrencias                  aluguel, salário, assinaturas; botão "Lançar"
    (app)/configuracoes                 categorias, exportar dados, excluir conta
    api/auth/[...nextauth]              Auth.js
    api/exportar                        exportação JSON (tudo) e CSV (lançamentos)
    acoes.ts                            server actions (validação Zod)
  auth.ts                               Auth.js: e-mail + senha (bcrypt), sessão JWT em cookie httpOnly
  db/schema.ts, db/index.ts             Drizzle (Postgres); migrações em drizzle/
  lib/calculos/                         módulo PURO: datas, parcelas, resumo do mês (+ testes)
  lib/dados/                            consultas sempre por usuario_id (+ teste de isolamento)
e2e/                                    Playwright: 2 fluxos principais
scripts/seed.ts                         dados de exemplo
```

Tabelas: `usuario`, `conta`, `cartao`, `categoria` (com `pai_id`), `transacao` (conta **ou** cartão), `recorrencia`.
As demais do modelo (metas, orçamento, objetivos, conexões, regras) entram nas fases em que são usadas.

## Decisões tomadas

- **Next.js 16 sem `cacheComponents`**: tudo é privado e dinâmico; o modo clássico é mais simples.
- **Auth.js v5 (Credentials)** com bcrypt custo 12, sessão JWT em cookie httpOnly. Login com hash falso quando o
  e-mail não existe (tempo constante, não revela cadastro).
- **Saldo da conta**: para conta manual, `saldo_centavos` é o *saldo de abertura*; o saldo atual = abertura + lançamentos
  com data até hoje (lançamentos futuros, como parcelas, só contam quando chegam). Conta do banco (fase 3) usará o saldo
  informado. Assim editar/apagar lançamento nunca deixa saldo inconsistente.
- **Recorrência tem `conta_id`** (não estava no modelo): precisa saber de onde sai o dinheiro ao lançar.
- **Recorrência automática ou manual**: automática vira lançamento sozinha (verificado em `exigirUsuario()` a cada
  acesso, com a data do vencimento, inclusive atrasadas; update condicional impede duplicar). Manual espera "Lançar",
  com valor ajustável para contas variáveis como luz. Recorrências criadas antes disso ficaram manuais.
  Pendentes aparecem no painel como próximos vencimentos e entram na previsão de fim do mês.
- **Parcelamento**: o valor digitado é o total; gera 1 transação por mês ligadas por `grupo_parcelas`,
  centavos que sobram vão na 1ª parcela (a soma bate exato).
- **Cartões de crédito**: lançamento vai para uma conta **ou** um cartão (CHECK no banco). Compra no cartão é despesa
  no dia da compra e não mexe no saldo das contas. Fatura: compra antes do dia de fechamento entra na fatura do mês;
  no dia do fechamento ou depois, na seguinte; vencimento no mesmo mês do fechamento se o dia for maior, senão no mês
  seguinte (`src/lib/calculos/cartao.ts`). Pagamentos quitam as faturas mais antigas primeiro. Cartão manual:
  disponível = limite − faturas abertas − parcelas futuras.
- **Pagamento de fatura = transferência**: par de lançamentos ligados por `transferencia_id` (sai da conta, entra no
  cartão), fora de receitas/despesas. Não se edita; excluir uma ponta exclui as duas. Transferência entre contas
  próprias (Contas → "Transferir entre contas") usa o mesmo par.
- **Transação ganhou `observacao`** (o módulo Lançamentos da especificação cita "observação").
- **Categorias padrão** criadas no cadastro (Moradia > Aluguel, Luz, Água, Internet etc.).
- **Fuso fixo America/Sao_Paulo** para "hoje".
- **Cabeçalhos**: CSP, HSTS, nosniff, frame DENY, Referrer-Policy, Permissions-Policy (`next.config.ts`).
  CSP usa `'unsafe-inline'` em scripts (exigência do Next sem nonce).
- **CSV** com `;`, vírgula decimal e BOM (abre direto no Excel em pt-BR); células de texto protegidas contra injeção de fórmula.
- Tema claro/escuro segue o sistema (`prefers-color-scheme`).

## Teste manual da fase 1

1. `npm run seed && npm run dev`, entre com `demo@exemplo.test` / `exemplo123`.
2. Painel: saldo do mês, saldo em contas, previsão, despesas por categoria, próximos vencimentos (aluguel "atrasada").
3. Botão **+** → lance R$ 50,00 → volta ao painel com saldo R$ 50 menor.
4. Recorrências → "Lançar" no aluguel → vira lançamento e a próxima data vai para o mês seguinte.
5. Lançamentos → filtre por texto/mês/conta/categoria; abra um item e edite; marque vários e categorize em lote.
6. Novo lançamento com 6 parcelas → aparecem 1/6 … 6/6 nos meses seguintes; "Excluir todas as parcelas".
7. Contas → abra "[exemplo] Cartão": fatura que vence dia 10, limite disponível e % de uso; "Registrar pagamento"
   tira o valor da conta corrente sem virar despesa e a próxima fatura assume.
8. Novo lançamento escolhendo "💳 [exemplo] Cartão" → despesas do mês sobem, saldo em contas não muda.
9. Ajustes → crie subcategoria; exporte JSON/CSV; crie outro usuário e confirme que ele não vê nada do primeiro.
