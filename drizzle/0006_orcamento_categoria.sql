CREATE TABLE "orcamento_categoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"categoria_id" uuid NOT NULL,
	"mes" text NOT NULL,
	"limite_centavos" bigint NOT NULL,
	CONSTRAINT "orcamento_categoria_usuarioId_categoriaId_mes_unique" UNIQUE("usuario_id","categoria_id","mes")
);
--> statement-breakpoint
ALTER TABLE "orcamento_categoria" ADD CONSTRAINT "orcamento_categoria_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamento_categoria" ADD CONSTRAINT "orcamento_categoria_categoria_id_categoria_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categoria"("id") ON DELETE cascade ON UPDATE no action;