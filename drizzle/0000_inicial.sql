CREATE TYPE "public"."origem" AS ENUM('manual', 'open_finance');--> statement-breakpoint
CREATE TYPE "public"."periodicidade" AS ENUM('semanal', 'mensal', 'anual');--> statement-breakpoint
CREATE TYPE "public"."tipo_categoria" AS ENUM('receita', 'despesa');--> statement-breakpoint
CREATE TYPE "public"."tipo_conta" AS ENUM('corrente', 'poupanca', 'dinheiro', 'vale', 'investimento');--> statement-breakpoint
CREATE TABLE "categoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"pai_id" uuid,
	"tipo" "tipo_categoria" NOT NULL,
	"cor" text DEFAULT '#64748b' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"tipo" "tipo_conta" NOT NULL,
	"saldo_centavos" bigint DEFAULT 0 NOT NULL,
	"origem" "origem" DEFAULT 'manual' NOT NULL,
	"conexao_id" uuid
);
--> statement-breakpoint
CREATE TABLE "recorrencia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"periodicidade" "periodicidade" NOT NULL,
	"proxima_data" date NOT NULL,
	"categoria_id" uuid,
	"conta_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"data" date NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"observacao" text,
	"categoria_id" uuid,
	"parcela_atual" integer,
	"parcelas_total" integer,
	"grupo_parcelas" uuid,
	"recorrencia_id" uuid,
	"origem" "origem" DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuario_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "categoria" ADD CONSTRAINT "categoria_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categoria" ADD CONSTRAINT "categoria_pai_id_categoria_id_fk" FOREIGN KEY ("pai_id") REFERENCES "public"."categoria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conta" ADD CONSTRAINT "conta_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencia" ADD CONSTRAINT "recorrencia_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencia" ADD CONSTRAINT "recorrencia_categoria_id_categoria_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categoria"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencia" ADD CONSTRAINT "recorrencia_conta_id_conta_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."conta"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacao" ADD CONSTRAINT "transacao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacao" ADD CONSTRAINT "transacao_conta_id_conta_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."conta"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacao" ADD CONSTRAINT "transacao_categoria_id_categoria_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categoria"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacao" ADD CONSTRAINT "transacao_recorrencia_id_recorrencia_id_fk" FOREIGN KEY ("recorrencia_id") REFERENCES "public"."recorrencia"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categoria_usuario_id_index" ON "categoria" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "conta_usuario_id_index" ON "conta" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "recorrencia_usuario_id_index" ON "recorrencia" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "transacao_usuario_id_data_index" ON "transacao" USING btree ("usuario_id","data");