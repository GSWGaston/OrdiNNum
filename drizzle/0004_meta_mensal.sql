CREATE TYPE "public"."modo_meta" AS ENUM('economizar', 'saldo_final');--> statement-breakpoint
CREATE TABLE "meta_mensal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"mes" text NOT NULL,
	"modo" "modo_meta" NOT NULL,
	"valor_centavos" bigint NOT NULL,
	CONSTRAINT "meta_mensal_usuarioId_mes_unique" UNIQUE("usuario_id","mes")
);
--> statement-breakpoint
ALTER TABLE "meta_mensal" ADD CONSTRAINT "meta_mensal_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;