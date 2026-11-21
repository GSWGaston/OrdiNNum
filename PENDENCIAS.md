# Pendências e desvios em relação à especificação

Comparação da Fase 1 entregue com a especificação (PDF) e o prompt. Cada item é independente, para decidirmos um a um.

## A. Itens da fase 1 (ou "desde a fase 1") que ficaram de fora ou parciais

| # | Item | Onde a spec pede | Situação |
| --- | --- | --- | --- |
| A1 | ~~Cartões na tela de Contas~~ | Spec, módulo "Contas e carteiras" (fase 1) | **Feito.** Cadastro de cartão, compra no cartão (à vista ou parcelada), faturas por fechamento/vencimento, limite disponível e % de uso por cartão, pagamento de fatura, faturas nos próximos vencimentos e na previsão do mês. Fica para a fase 2: tela Crédito com consolidado de todos os cartões, medidor com faixas no painel e parcelas futuras por mês. Recorrência no cartão (ex.: streaming) ainda não: recorrência só sai de conta. |
| A2 | Backups diários criptografados com teste de restauração | Spec, Segurança | **Depende de você.** Passo a passo no README ("Publicar e backups"): o Neon faz backup criptografado com restauração a qualquer ponto; teste mensal por branch. Exportar JSON em Ajustes serve de cópia extra. |
| A3 | ~~Banco gerenciado + deploy na Vercel~~ | Stack | **Feito.** No ar em https://ordinnum.vercel.app (Vercel + Neon, repositório GSWGaston/OrdiNNum). |
| A4 | ~~Tema claro/escuro com botão~~ | Prompt, Stack | **Feito.** Ajustes → Aparência: Automático, Claro ou Escuro (cookie; sem piscar). |
| A5 | ~~Recorrências automáticas~~ | Princípio "automação primeiro" | **Feito.** Cada recorrência é automática ou manual. As automáticas são lançadas ao abrir o app, com a data do vencimento, inclusive meses atrasados, sem duplicar. Sem Vercel Cron por enquanto (só faria diferença para alertas sem o usuário entrar). |
| A6 | ~~Editar recorrência / pular uma ocorrência~~ | Não explícito | **Feito.** "Editar" em cada recorrência e botão "Pular" (avança a data sem lançar). |
| A7 | ~~CSP sem `'unsafe-inline'` em scripts~~ | Spec, Segurança (CSP) | **Feito.** `src/proxy.ts` gera um nonce por requisição; só rodam scripts com o nonce. Estilos inline continuam permitidos (as cores das categorias usam `style=`). APIs recebem `default-src 'none'`. |

## B. Desvios do modelo de dados (decisões que tomei; confirmar)

| # | Desvio | Motivo |
| --- | --- | --- |
| B1 | `conta.saldo_centavos` = saldo de abertura (conta manual); saldo atual é calculado | Editar/apagar lançamento nunca deixa saldo errado; parcelas futuras só contam na data. |
| B2 | `recorrencia.conta_id` (novo campo) | Para lançar, precisa saber a conta. |
| B3 | `transacao.observacao` (novo campo) | O módulo Lançamentos da spec cita "observação". |
| B4 | `usuario.senha_hash` (novo campo) | Login por e-mail e senha. |
| B6 | `transacao.transferencia_id` (novo campo) e `conta_id` agora opcional (conta **ou** cartão, garantido por CHECK) | Pagamento de fatura é um par de lançamentos (sai da conta, entra no cartão) que não conta como receita/despesa. É o mesmo mecanismo que servirá para C1. |
| B8 | `recorrencia.automatica` e tabela `tentativa_login` (sem `usuario_id`: guarda tentativas por e-mail, não dados do usuário) | Itens A5 e C2. |
| B7 | `cartao.limite_disponivel_centavos` fica vazio em cartão manual | O disponível é calculado (limite − faturas abertas − parcelas futuras); o banco preenche na fase 3. |
| B5 | Tabelas ainda não criadas: RegraCategoria, MetaMensal, OrcamentoCategoria, Objetivo, AporteObjetivo, ConexaoBanco; colunas `transacao.id_externo` e unicidade (conexão, id_externo) | Entram nas fases que as usam (2 e 3). |

## C. Coisas que não estão na spec mas fazem falta

| # | Item | Por que importa |
| --- | --- | --- |
| C1 | ~~Transferência entre contas próprias~~ **Feito** (tela Contas → "Transferir entre contas") | Hoje mover dinheiro da corrente para a poupança vira uma despesa + uma receita e infla os totais do mês (e vai distorcer o gasto diário da fase 2). O mecanismo (`transferencia_id`) já existe por causa do pagamento de fatura; falta a tela. |
| C2 | ~~Limite de tentativas de login~~ **Feito** | 5 senhas erradas em 15 min bloqueiam o e-mail por 15 min (vale para e-mail sem cadastro também, para não revelar quem existe). Guardado no banco (tabela `tentativa_login`), funciona na Vercel. |
| C3 | Recuperar senha ("esqueci minha senha") | Exige envio de e-mail (provedor de e-mail). |
| C4 | Fuso horário por usuário | "Hoje" está fixo em São Paulo. |
| C6 | ~~Sessão de usuário apagado~~ **Feito** | Se o usuário não existe mais, a sessão é encerrada e volta para o login. |
| C5 | Lançamento futuro aparece na lista com "· futuro", mas não há visão de "agenda" | Útil quando houver muitas parcelas. |

## D. Fases seguintes (ainda não começadas, como o prompt manda)

- **Fase 2, planejamento:** meta mensal (economizar X / terminar com Y), gasto diário sugerido no painel, orçamento por categoria com alerta 80%/100%, crédito consolidado com % de uso e faixas configuráveis (medidor no painel e tela Crédito), parcelas futuras por mês, objetivos com aporte mensal e data estimada. (Cartões com fatura, fechamento, vencimento e parcelas já entraram no item A1.)
- **Fase 3, Open Finance:** `BankProvider` + `PluggyProvider` + `FakeProvider`, sandbox Pluggy e Meu Pluggy, importação sem duplicar, regras de categorização, job periódico (Vercel Cron), consentimentos/revogação, perguntar se mantém histórico ao apagar conexão, tokens criptografados, alertas.
- **Fase 4, inteligência:** gráficos (Recharts), evolução do patrimônio, comparativos, relatório PDF/CSV mensal, detecção de assinaturas, simulador, 2FA.

## F. Fase 2 (andamento)

| # | Bloco | Situação |
| --- | --- | --- |
| F1 | Meta do mês + gasto diário sugerido | **Feito.** Tela "Meta", destaque no painel, "de onde vem o número". |
| F2 | Orçamento por categoria (alertas 80%/100%) | A fazer |
| F3 | Crédito consolidado (medidor com faixas, tela Crédito, parcelas futuras por mês) | A fazer |
| F4 | Objetivos (aporte mensal, data estimada, status) | A fazer |

## G. Ideias anotadas para depois

| # | Ideia | Fase sugerida |
| --- | --- | --- |
| G1 | Subir o contracheque (PDF/foto): mostrar bruto, descontos (INSS, IR, VT, plano, consignado) e líquido, mês a mês. Complementa o Open Finance, que só vê o líquido que caiu. Precisa de leitura por IA/OCR e cuidado de privacidade (CPF, salário). | 4 |

## E. Decisões em aberto com você (do prompt)

| # | Decisão |
| --- | --- |
| E1 | Nome do produto (está "Finanças") |
| E2 | Identidade visual (está verde-esmeralda neutro, fonte do sistema) |
| E3 | Haverá plano pago no futuro? |
| E4 | Quais bancos são prioridade na fase 3? |
