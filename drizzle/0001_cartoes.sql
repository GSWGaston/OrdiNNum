CREATE TABLE "cartao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"bandeira" text NOT NULL,
	"limite_total_centavos" bigint NOT NULL,
	"limite_disponivel_centavos" bigint,
	"dia_fechamento" integer NOT NULL,
	"dia_vencimento" integer NOT NULL,
	"conexao_id" uuid
);
--> statement-breakpoint
ALTER TABLE "transacao" ALTER COLUMN "conta_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transacao" ADD COLUMN "cartao_id" uuid;--> statement-breakpoint
ALTER TABLE "transacao" ADD COLUMN "transferencia_id" uuid;--> statement-breakpoint
ALTER TABLE "cartao" ADD CONSTRAINT "cartao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cartao_usuario_id_index" ON "cartao" USING btree ("usuario_id");--> statement-breakpoint
ALTER TABLE "transacao" ADD CONSTRAINT "transacao_cartao_id_cartao_id_fk" FOREIGN KEY ("cartao_id") REFERENCES "public"."cartao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacao" ADD CONSTRAINT "conta_ou_cartao" CHECK (num_nonnulls("transacao"."conta_id", "transacao"."cartao_id") = 1);