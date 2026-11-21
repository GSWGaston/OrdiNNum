CREATE TABLE "conexao_banco" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"provedor" text NOT NULL,
	"item_id_externo" text NOT NULL,
	"banco" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"erro" text,
	"consentimento_ate" timestamp with time zone,
	"ultima_sincronizacao" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regra_categoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"padrao_texto" text NOT NULL,
	"categoria_id" uuid NOT NULL,
	"prioridade" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cartao" ADD COLUMN "id_externo" text;--> statement-breakpoint
ALTER TABLE "conta" ADD COLUMN "id_externo" text;--> statement-breakpoint
ALTER TABLE "transacao" ADD COLUMN "conexao_id" uuid;--> statement-breakpoint
ALTER TABLE "transacao" ADD COLUMN "id_externo" text;--> statement-breakpoint
ALTER TABLE "conexao_banco" ADD CONSTRAINT "conexao_banco_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regra_categoria" ADD CONSTRAINT "regra_categoria_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regra_categoria" ADD CONSTRAINT "regra_categoria_categoria_id_categoria_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categoria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conexao_banco_usuario_id_index" ON "conexao_banco" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "regra_categoria_usuario_id_index" ON "regra_categoria" USING btree ("usuario_id");--> statement-breakpoint
ALTER TABLE "cartao" ADD CONSTRAINT "cartao_conexao_id_conexao_banco_id_fk" FOREIGN KEY ("conexao_id") REFERENCES "public"."conexao_banco"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conta" ADD CONSTRAINT "conta_conexao_id_conexao_banco_id_fk" FOREIGN KEY ("conexao_id") REFERENCES "public"."conexao_banco"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacao" ADD CONSTRAINT "transacao_conexao_id_conexao_banco_id_fk" FOREIGN KEY ("conexao_id") REFERENCES "public"."conexao_banco"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartao" ADD CONSTRAINT "cartao_conexaoId_idExterno_unique" UNIQUE("conexao_id","id_externo");--> statement-breakpoint
ALTER TABLE "conta" ADD CONSTRAINT "conta_conexaoId_idExterno_unique" UNIQUE("conexao_id","id_externo");--> statement-breakpoint
ALTER TABLE "transacao" ADD CONSTRAINT "transacao_conexao_externo" UNIQUE("conexao_id","id_externo");