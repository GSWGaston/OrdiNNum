import { expect, test, type Page } from "@playwright/test";

const SENHA = "senha-de-teste-e2e";

async function cadastrar(page: Page) {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@exemplo.test`;
  await page.goto("/cadastro");
  await page.getByLabel("Nome").fill("Pessoa Teste");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel(/Senha/).fill(SENHA);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText("Bem-vindo! Comece criando uma conta.")).toBeVisible();
  return email;
}

async function criarConta(page: Page, nome: string, saldo: string) {
  await page.goto("/contas");
  const form = page.locator("section", { has: page.getByRole("heading", { name: /conta/i }) });
  await form.getByLabel("Nome").fill(nome);
  await form.getByLabel(/Saldo de abertura/).fill(saldo);
  await form.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByText(nome).first()).toBeVisible();
}

async function lancar(page: Page, valor: string, opcoes: { receita?: boolean; descricao?: string } = {}) {
  await page.getByRole("link", { name: "Novo lançamento" }).click();
  if (opcoes.receita) await page.getByText("+ Receita").click();
  await page.getByLabel("Valor (R$)").fill(valor);
  if (opcoes.descricao) await page.getByLabel(/Descrição/).fill(opcoes.descricao);
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("cadastro → conta → lançamentos → painel mostra o saldo certo", async ({ page }) => {
  await cadastrar(page);
  await criarConta(page, "Conta Teste", "1.000,00");
  await page.goto("/");
  await lancar(page, "3.000", { receita: true, descricao: "Salário teste" });
  await lancar(page, "123,45", { descricao: "Mercado teste" });
  await expect(page.getByTestId("saldo-mes")).toHaveText(/\+R\$\s2\.876,55/);
  await expect(page.getByTestId("saldo-contas")).toHaveText(/\+R\$\s3\.876,55/);
});

test("login, filtro e categorização em lote; outro usuário não vê nada", async ({ page, browser }) => {
  const email = await cadastrar(page);
  await criarConta(page, "Conta Lote", "0");
  await page.goto("/");
  await lancar(page, "10", { descricao: "café lote" });
  await lancar(page, "20", { descricao: "pão lote" });

  await page.getByRole("button", { name: "Sair" }).click();
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByTestId("saldo-mes")).toBeVisible();

  await page.goto("/lancamentos?q=lote");
  for (const cb of await page.getByRole("checkbox").all()) await cb.check();
  await page.locator("#lote select").selectOption({ label: "Alimentação" });
  await page.getByRole("button", { name: "Aplicar aos marcados" }).click();
  await expect(page.getByText("2 lançamento(s) categorizado(s).")).toBeVisible();
  await expect(page.getByText(/· Alimentação ·/)).toHaveCount(2);

  // segundo usuário, sessão separada: não enxerga nada do primeiro
  const outro = await browser.newPage();
  await cadastrar(outro);
  await outro.goto("/lancamentos?q=lote");
  await expect(outro.getByText("Nenhum lançamento aqui")).toBeVisible();
  await outro.close();
});

test("cartão: compra é despesa no dia e não mexe no saldo da conta", async ({ page }) => {
  await cadastrar(page);
  await criarConta(page, "Conta C", "500,00");
  const form = page.locator("section", { has: page.getByRole("heading", { name: "Adicionar cartão de crédito" }) });
  await form.getByLabel("Nome").fill("Cartão Teste");
  await form.getByLabel("Limite total (R$)").fill("2.000");
  await form.getByLabel("Dia do fechamento").fill("3");
  await form.getByLabel("Dia do vencimento").fill("10");
  await form.getByRole("button", { name: "Adicionar cartão" }).click();
  await expect(page.getByText("💳 Cartão Teste")).toBeVisible();

  await page.goto("/");
  await page.getByRole("link", { name: "Novo lançamento" }).click();
  await page.getByLabel("Valor (R$)").fill("80");
  await page.getByLabel("Conta/cartão").selectOption({ label: "💳 Cartão Teste" });
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByTestId("saldo-mes")).toHaveText(/-R\$\s80,00/);
  await expect(page.getByTestId("saldo-contas")).toHaveText(/\+R\$\s500,00/);
  await expect(page.getByText(/Fatura Cartão Teste/)).toBeVisible();
});

test("login bloqueia depois de 5 senhas erradas", async ({ page }) => {
  const email = await cadastrar(page);
  await page.getByRole("button", { name: "Sair" }).click();
  for (let i = 0; i < 5; i++) {
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(`errada-${i}`);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
  }
  // até a senha certa é recusada durante o bloqueio
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText(/Muitas tentativas erradas/)).toBeVisible();
});

test("meta do mês: painel mostra o gasto diário e ele muda a cada lançamento", async ({ page }) => {
  await cadastrar(page);
  await criarConta(page, "Conta Meta", "3.000,00");
  await page.goto("/");
  await page.getByRole("link", { name: "Definir minha meta" }).click();
  await page.getByText("Quero terminar o mês com").click();
  await page.getByLabel("Valor (R$)").fill("500");
  await page.getByRole("button", { name: "Salvar meta" }).click();
  await expect(page.getByText("Meta salva.")).toBeVisible();

  await page.goto("/");
  const valor = async () => Number((await page.getByTestId("gasto-diario").innerText()).replace(/[^\d,]/g, "").replace(",", "."));
  const antes = await valor();
  expect(antes).toBeGreaterThan(0);
  await page.getByRole("link", { name: "Novo lançamento" }).click();
  await page.getByLabel("Valor (R$)").fill("10");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(valor).toBeCloseTo(antes - 10, 2);
});
