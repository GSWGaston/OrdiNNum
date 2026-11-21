# Pendências e desvios em relação à especificação

Comparação da Fase 1 entregue com a especificação (PDF) e o prompt. Cada item é independente, para decidirmos um a um.

## A. Itens da fase 1 (ou "desde a fase 1") que ficaram de fora ou parciais

| # | Item | Onde a spec pede | Situação |
| --- | --- | --- | --- |
| A1 | Cartões na tela de Contas | Spec, módulo "Contas e carteiras" (fase 1) lista cartões | O prompt joga cartões com fatura para a fase 2; não fiz nada de cartão ainda. Decidir se entra já. |
| A2 | Backups diários criptografados com teste de restauração | Spec, Segurança | Depende do provedor (Neon/Supabase têm backup gerenciado). Nada configurado. |
| A3 | Banco gerenciado + deploy na Vercel | Stack | Roda local com PGlite. Falta criar o Neon/Supabase e o projeto na Vercel (precisam da sua conta). |
| A4 | Tema claro/escuro com botão | Prompt, Stack | Segue o tema do sistema automaticamente; não há botão para trocar. |
| A5 | Recorrências automáticas | Princípio "automação primeiro" | Recorrência só vira lançamento quando você toca "Lançar". Alternativa: lançar sozinha no vencimento (Vercel Cron). |
| A6 | Editar recorrência / pular uma ocorrência | Não explícito | Hoje só dá para excluir e recriar. |
| A7 | CSP sem `'unsafe-inline'` | Spec, Segurança (CSP) | CSP existe, mas aceita scripts inline. Endurecer com nonce exige `proxy.ts`. |

## B. Desvios do modelo de dados (decisões que tomei; confirmar)

| # | Desvio | Motivo |
| --- | --- | --- |
| B1 | `conta.saldo_centavos` = saldo de abertura (conta manual); saldo atual é calculado | Editar/apagar lançamento nunca deixa saldo errado; parcelas futuras só contam na data. |
| B2 | `recorrencia.conta_id` (novo campo) | Para lançar, precisa saber a conta. |
| B3 | `transacao.observacao` (novo campo) | O módulo Lançamentos da spec cita "observação". |
| B4 | `usuario.senha_hash` (novo campo) | Login por e-mail e senha. |
| B5 | Tabelas ainda não criadas: Cartao, RegraCategoria, MetaMensal, OrcamentoCategoria, Objetivo, AporteObjetivo, ConexaoBanco; colunas `transacao.cartao_id`, `id_externo` e unicidade (conexão, id_externo) | Entram nas fases que as usam (2 e 3). |

## C. Coisas que não estão na spec mas fazem falta

| # | Item | Por que importa |
| --- | --- | --- |
| C1 | Transferência entre contas próprias | Hoje mover dinheiro da corrente para a poupança vira uma despesa + uma receita e infla os totais do mês (e vai distorcer o gasto diário da fase 2). |
| C2 | Limite de tentativas de login | Proteção contra força bruta na senha. |
| C3 | Recuperar senha ("esqueci minha senha") | Exige envio de e-mail (provedor de e-mail). |
| C4 | Fuso horário por usuário | "Hoje" está fixo em São Paulo. |
| C5 | Lançamento futuro aparece na lista com "· futuro", mas não há visão de "agenda" | Útil quando houver muitas parcelas. |

## D. Fases seguintes (ainda não começadas, como o prompt manda)

- **Fase 2, planejamento:** meta mensal (economizar X / terminar com Y), gasto diário sugerido no painel, orçamento por categoria com alerta 80%/100%, cartões com fatura/fechamento/vencimento e parcelas, crédito consolidado com % de uso e faixas configuráveis, objetivos com aporte mensal e data estimada.
- **Fase 3, Open Finance:** `BankProvider` + `PluggyProvider` + `FakeProvider`, sandbox Pluggy e Meu Pluggy, importação sem duplicar, regras de categorização, job periódico (Vercel Cron), consentimentos/revogação, perguntar se mantém histórico ao apagar conexão, tokens criptografados, alertas.
- **Fase 4, inteligência:** gráficos (Recharts), evolução do patrimônio, comparativos, relatório PDF/CSV mensal, detecção de assinaturas, simulador, 2FA.

## E. Decisões em aberto com você (do prompt)

| # | Decisão |
| --- | --- |
| E1 | Nome do produto (está "Finanças") |
| E2 | Identidade visual (está verde-esmeralda neutro, fonte do sistema) |
| E3 | Haverá plano pago no futuro? |
| E4 | Quais bancos são prioridade na fase 3? |
