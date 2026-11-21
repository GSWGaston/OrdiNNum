import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Convenções: valores em centavos (inteiro), todo registro tem usuario_id. Colunas viram snake_case (casing).

export const tipoConta = pgEnum("tipo_conta", ["corrente", "poupanca", "dinheiro", "vale", "investimento"]);
export const origem = pgEnum("origem", ["manual", "open_finance"]);
export const tipoCategoria = pgEnum("tipo_categoria", ["receita", "despesa"]);
export const periodicidade = pgEnum("periodicidade", ["semanal", "mensal", "anual"]);

const id = () => uuid().primaryKey().defaultRandom();
const centavos = () => bigint({ mode: "number" });
const dono = () =>
  uuid()
    .notNull()
    .references(() => usuario.id, { onDelete: "cascade" });

export const usuario = pgTable("usuario", {
  id: id(),
  nome: text().notNull(),
  email: text().notNull().unique(),
  senhaHash: text().notNull(),
  // faixas do medidor de uso do crédito (spec: configuráveis; padrão 30% e 60%)
  faixaAmarelaPct: integer().notNull().default(30),
  faixaVermelhaPct: integer().notNull().default(60),
  criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// Falhas de login recentes por e-mail (proteção contra força bruta). Não é dado do usuário: não tem usuario_id.
export const tentativaLogin = pgTable(
  "tentativa_login",
  {
    id: id(),
    email: text().notNull(),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.email, t.criadoEm)],
);

export const conta = pgTable(
  "conta",
  {
    id: id(),
    usuarioId: dono(),
    nome: text().notNull(),
    tipo: tipoConta().notNull(),
    // manual: saldo de abertura (o saldo atual soma os lançamentos); open_finance: saldo informado pelo banco.
    saldoCentavos: centavos().notNull().default(0),
    origem: origem().notNull().default("manual"),
    conexaoId: uuid(),
  },
  (t) => [index().on(t.usuarioId)],
);

export const categoria = pgTable(
  "categoria",
  {
    id: id(),
    usuarioId: dono(),
    nome: text().notNull(),
    paiId: uuid(),
    tipo: tipoCategoria().notNull(),
    cor: text().notNull().default("#64748b"),
  },
  (t) => [
    index().on(t.usuarioId),
    foreignKey({ columns: [t.paiId], foreignColumns: [t.id] }).onDelete("cascade"),
  ],
);

export const recorrencia = pgTable(
  "recorrencia",
  {
    id: id(),
    usuarioId: dono(),
    descricao: text().notNull(),
    valorCentavos: centavos().notNull(), // negativo = saída
    periodicidade: periodicidade().notNull(),
    proximaData: date().notNull(),
    // true: vira lançamento sozinha no vencimento; false: espera o usuário tocar "Lançar" (contas de valor variável)
    automatica: boolean().notNull().default(false),
    categoriaId: uuid().references(() => categoria.id, { onDelete: "set null" }),
    contaId: uuid()
      .notNull()
      .references(() => conta.id, { onDelete: "cascade" }),
  },
  (t) => [index().on(t.usuarioId)],
);

export const modoMeta = pgEnum("modo_meta", ["economizar", "saldo_final"]);

export const metaMensal = pgTable(
  "meta_mensal",
  {
    id: id(),
    usuarioId: dono(),
    mes: text().notNull(), // AAAA-MM
    modo: modoMeta().notNull(),
    valorCentavos: centavos().notNull(),
  },
  (t) => [unique().on(t.usuarioId, t.mes)],
);

export const orcamentoCategoria = pgTable(
  "orcamento_categoria",
  {
    id: id(),
    usuarioId: dono(),
    categoriaId: uuid()
      .notNull()
      .references(() => categoria.id, { onDelete: "cascade" }),
    mes: text().notNull(), // AAAA-MM; vale para os meses seguintes até outro registro
    limiteCentavos: centavos().notNull(), // 0 = sem limite a partir deste mês
  },
  (t) => [unique().on(t.usuarioId, t.categoriaId, t.mes)],
);

export const cartao = pgTable(
  "cartao",
  {
    id: id(),
    usuarioId: dono(),
    nome: text().notNull(),
    bandeira: text().notNull(),
    limiteTotalCentavos: centavos().notNull(),
    // null = cartão manual: o disponível é calculado (limite - faturas abertas - parcelas futuras)
    limiteDisponivelCentavos: centavos(),
    diaFechamento: integer().notNull(),
    diaVencimento: integer().notNull(),
    conexaoId: uuid(),
  },
  (t) => [index().on(t.usuarioId)],
);

export const transacao = pgTable(
  "transacao",
  {
    id: id(),
    usuarioId: dono(),
    // exatamente um dos dois (check abaixo)
    contaId: uuid().references(() => conta.id, { onDelete: "cascade" }),
    cartaoId: uuid().references(() => cartao.id, { onDelete: "cascade" }),
    // par de lançamentos que só move dinheiro (ex.: pagamento de fatura): fora de receitas/despesas
    transferenciaId: uuid(),
    data: date().notNull(),
    valorCentavos: centavos().notNull(), // negativo = saída
    descricao: text().notNull().default(""),
    observacao: text(),
    categoriaId: uuid().references(() => categoria.id, { onDelete: "set null" }),
    parcelaAtual: integer(),
    parcelasTotal: integer(),
    grupoParcelas: uuid(),
    recorrenciaId: uuid().references(() => recorrencia.id, { onDelete: "set null" }),
    origem: origem().notNull().default("manual"),
  },
  (t) => [
    index().on(t.usuarioId, t.data),
    check("conta_ou_cartao", sql`num_nonnulls(${t.contaId}, ${t.cartaoId}) = 1`),
  ],
);
