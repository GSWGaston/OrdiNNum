@AGENTS.md

# Convenções do projeto (finanças pessoais)

- Interface e código de domínio em português do Brasil. R$ 1.234,56 e dd/mm/aaaa (`src/lib/formato.ts`).
- Dinheiro sempre em **centavos inteiros** (`*_centavos`, `valorCentavos`). Nunca float para valor. Negativo = saída.
- Datas como texto ISO `AAAA-MM-DD`; meses `AAAA-MM`. "Hoje" vem de `hoje()` (fuso de São Paulo).
- **Cálculos puros** em `src/lib/calculos/`: sem banco, sem rede, cada regra com teste em Vitest.
- **Acesso a dados** em `src/lib/dados/`: toda função recebe `(db, uid, ...)` e filtra por `usuario_id`;
  ids vindos do navegador (conta, categoria) são conferidos com `contaDoUsuario`/`categoriaDoUsuario`.
  Toda função nova entra no teste de isolamento (`src/lib/dados/dados.test.ts`).
- Server actions em `src/app/acoes.ts`: validam com Zod, pegam o usuário com `exigirUsuario()`.
- Segredos só no servidor (`.env.local`). Nunca logar tokens, senhas ou transações.
- Mudou `src/db/schema.ts`? Rode `npm run db:generate` e commite a migração em `drizzle/`.
- Antes de dar algo como pronto: `npm run check` (lint + typecheck + testes) e `npm run test:e2e`.
- Integração bancária (fase 3) fica atrás da interface `BankProvider` em `src/lib/bank/`.
