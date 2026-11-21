CREATE TYPE "public"."status_objetivo" AS ENUM('ativo', 'arquivado');--> statement-breakpoint
CREATE TABLE "aporte_objetivo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"objetivo_id" uuid NOT NULL,
	"data" date NOT NULL,
	"valor_centavos" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objetivo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"valor_alvo_centavos" bigint NOT NULL,
	"prazo" date,
	"status" "status_objetivo" DEFAULT 'ativo' NOT NULL,
	"criado_em" date NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aporte_objetivo" ADD CONSTRAINT "aporte_objetivo_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aporte_objetivo" ADD CONSTRAINT "aporte_objetivo_objetivo_id_objetivo_id_fk" FOREIGN KEY ("objetivo_id") REFERENCES "public"."objetivo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objetivo" ADD CONSTRAINT "objetivo_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aporte_objetivo_objetivo_id_index" ON "aporte_objetivo" USING btree ("objetivo_id");--> statement-breakpoint
CREATE INDEX "objetivo_usuario_id_index" ON "objetivo" USING btree ("usuario_id");