import {
  bigint,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
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
  criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

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
    categoriaId: uuid().references(() => categoria.id, { onDelete: "set null" }),
    contaId: uuid()
      .notNull()
      .references(() => conta.id, { onDelete: "cascade" }),
  },
  (t) => [index().on(t.usuarioId)],
);

export const transacao = pgTable(
  "transacao",
  {
    id: id(),
    usuarioId: dono(),
    contaId: uuid()
      .notNull()
      .references(() => conta.id, { onDelete: "cascade" }),
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
  (t) => [index().on(t.usuarioId, t.data)],
);
