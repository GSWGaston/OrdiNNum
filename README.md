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

## Publicar (Vercel + Neon) e backups

Precisa das suas contas; nada disso foi feito ainda.

1. **Banco (Neon):** crie conta em neon.tech e um projeto na região **AWS São Paulo (sa-east-1)**. Em
   *Connection string*, ligue **Pooled connection** e copie (termina com `?sslmode=require`).
2. **GitHub:** crie um repositório **privado** vazio (sem README) e me passe o endereço; eu envio o código.
3. **Vercel:** entre com o GitHub em vercel.com → *Add New → Project* → importe o repositório. Em
   *Environment Variables* adicione:
   - `DATABASE_URL` = string do Neon
   - `AUTH_SECRET` = gere com `npx auth secret` (um novo, não o do seu `.env.local`)
   Clique *Deploy*. O script `vercel-build` aplica as migrações no Neon antes de cada build.
4. **Teste:** abra o endereço `.vercel.app`, cadastre-se e lance algo. Os dados de exemplo não vão para produção.

**Backups (spec: diários, criptografados, com teste de restauração):**
- O Neon guarda histórico para restauração a qualquer ponto no tempo (o prazo depende do plano) e criptografa em
  repouso. Isso cobre o "diário e criptografado".
- Teste de restauração (faça uma vez por mês): no painel do Neon crie um *branch* a partir de um horário passado,
  aponte `DATABASE_URL` local para ele e rode `npm run dev`. Os dados daquele horário devem aparecer. Apague o branch.
- Cópia extra fora do provedor: Ajustes → "Exportar tudo (JSON)" baixa todos os seus dados.

## Open Finance (Pluggy)

Sem chaves da Pluggy, o desenvolvimento usa um **banco simulado** (Bancos → "Conectar banco simulado") e a produção
mostra "Open Finance não configurado". Para ligar de verdade:

1. Crie conta em **dashboard.pluggy.ai** e uma aplicação. Copie `CLIENT_ID` e `CLIENT_SECRET`.
2. Na Vercel (Settings → Environment Variables), adicione como **Secret**: `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`,
   `ENCRYPTION_KEY` (gere como o `AUTH_SECRET`; não troque depois) e `CRON_SECRET` (outro valor aleatório).
   Para testar com os bancos de teste da Pluggy, `PLUGGY_SANDBOX=true` (usuário `user-ok`, senha `password-ok`).
3. Redeploy. Em **Bancos**, "Conectar banco" abre o widget da Pluggy.
4. **Meu Pluggy** (gratuito para uso próprio): conecte seus bancos em meu.pluggy.ai, ligue o Meu Pluggy à sua aplicação
   no painel da Pluggy e cole o **ID do item** de cada banco em Bancos → "Já conectei pelo Meu Pluggy".

Como funciona (`src/lib/bank/` e `src/lib/dados/conexoes.ts`):
- `BankProvider` isola o agregador; `PluggyProvider` (API real) e `FakeProvider` (testes) implementam o mesmo contrato.
- A chave da API fica só no servidor; o navegador recebe só o token curto do widget (30 min). O id do item é guardado
  criptografado (AES-256-GCM) e nunca vai para a tela nem para a exportação.
- Sincronização: contas (saldo do banco), cartões (limite e disponível do banco) e transações (`/v2/transactions`).
  **Sem duplicar**: unicidade `(conexao_id, id_externo)` + upsert. Na janela consultada, o que o banco não devolve mais
  (ex.: compra pendente cancelada) é apagado. Primeira vez: 12 meses; depois, 30 dias antes da última sincronização.
- Sinal do valor pelo campo `type` (DEBIT = saída), não pelo sinal de `amount`. Pagamento de fatura e transferência
  entre contas próprias entram como transferência (fora de receitas/despesas).
- Lançamento importado: só categoria e observação são editáveis; não se exclui (voltaria). Conta importada: só o nome.
- Regras de categorização (Ajustes → Regras): aplicadas na importação; categoria escolhida à mão não é trocada.
- Rotina diária: Vercel Cron chama `/api/cron/sincronizar` às 06h (Brasília) com `Authorization: Bearer CRON_SECRET`.
  O Meu Pluggy atualiza os bancos a cada 24 h por conta própria.
- Desconectar revoga a autorização no agregador e pergunta se mantém o histórico (vira manual, com o saldo de hoje) ou
  apaga o que veio do banco.
- Alertas do painel: vencimentos em até 3 dias ou atrasados, orçamento ≥ 80%, crédito na faixa vermelha, gasto do dia
  estourado ou meta impossível, banco com erro e autorização vencendo em 15 dias.

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
- **Gasto diário** (`src/lib/calculos/gastoDiario.ts`): Disp = receitas a entrar + saldo − fixas a pagar − alvo;
  limite de hoje = (Disp + gasto variável de hoje) / dias restantes (inclui hoje), então o número de hoje não muda
  enquanto você gasta: o que muda é o "ainda pode". Saldo = contas exceto investimento. Fixas = recorrências de
  despesa pendentes + saídas futuras do mês + dívida dos cartões até o fim do mês (compra no cartão conta no dia).
  Gasto variável = saída que não é transferência, recorrência nem parcela 2+.
  **Interpretação da spec**: lida ao pé da letra, a fórmula de "economizar X" ficaria igual à de "terminar com Y".
  Adotei: economizar X → alvo = saldo no início do mês + X (menos o que já foi transferido para investimento no mês);
  terminar com Y → alvo = Y. A meta vale para os meses seguintes até ser trocada.
- **Objetivos** (`src/lib/calculos/objetivos.ts`): aporte = reserva de dinheiro que está nas suas contas (não move
  dinheiro). No gasto diário, modo "terminar com Y" passa a exigir Y + o reservado; no modo "economizar" a reserva já
  fica protegida porque a meta exige que o saldo cresça. Status com prazo: esperado = alvo proporcional ao tempo
  desde a criação; folga de 5% do alvo para "no ritmo". Sem prazo: média dos 3 últimos meses completos (ou o mês
  atual, se não houver histórico).
- **Transação ganhou `observacao`** (o módulo Lançamentos da especificação cita "observação").
- **Categorias padrão** criadas no cadastro (Moradia > Aluguel, Luz, Água, Internet etc.).
- **Fuso fixo America/Sao_Paulo** para "hoje".
- **Cabeçalhos**: CSP com nonce por requisição (`src/proxy.ts`; scripts só com o nonce, estilos inline permitidos
  por causa das cores das categorias), HSTS, nosniff, frame DENY, Referrer-Policy, Permissions-Policy (`next.config.ts`).
- **Login**: 5 senhas erradas em 15 min bloqueiam aquele e-mail por 15 min (tabela `tentativa_login`). Sessão de um
  usuário que foi apagado é encerrada (`/sair`).
- **Formulários** (`src/components/form.tsx`): com erro, o que foi digitado fica; com sucesso, o formulário recarrega
  com os valores salvos.
- **CSV** com `;`, vírgula decimal e BOM (abre direto no Excel em pt-BR); células de texto protegidas contra injeção de fórmula.
- Tema: automático (segue o sistema), claro ou escuro, escolhido em Ajustes e guardado em cookie.

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
