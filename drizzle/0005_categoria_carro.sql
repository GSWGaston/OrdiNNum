-- Categoria "Carro" para quem já tinha conta (os novos já recebem no cadastro).
-- Reaproveita um "Carro" principal que o usuário tenha criado; move "Combustível" de Transporte para Carro
-- (os lançamentos continuam com a mesma categoria, só muda o pai).
INSERT INTO "categoria" ("usuario_id", "nome", "tipo", "cor")
SELECT u."id", 'Carro', 'despesa', '#f59e0b' FROM "usuario" u
WHERE NOT EXISTS (
  SELECT 1 FROM "categoria" c WHERE c."usuario_id" = u."id" AND c."pai_id" IS NULL AND c."nome" = 'Carro'
);
--> statement-breakpoint
UPDATE "categoria" f SET "pai_id" = carro."id", "cor" = carro."cor"
FROM "categoria" carro, "categoria" transp
WHERE carro."usuario_id" = f."usuario_id" AND carro."nome" = 'Carro' AND carro."pai_id" IS NULL
  AND transp."id" = f."pai_id" AND transp."nome" = 'Transporte' AND f."nome" = 'Combustível'
  AND NOT EXISTS (SELECT 1 FROM "categoria" x WHERE x."pai_id" = carro."id" AND x."nome" = 'Combustível');
--> statement-breakpoint
INSERT INTO "categoria" ("usuario_id", "nome", "tipo", "cor", "pai_id")
SELECT carro."usuario_id", s.nome, 'despesa', carro."cor", carro."id"
FROM "categoria" carro
CROSS JOIN (VALUES ('Combustível'), ('Manutenção'), ('Seguro'), ('IPVA e licenciamento'), ('Estacionamento e pedágio')) AS s(nome)
WHERE carro."nome" = 'Carro' AND carro."pai_id" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "categoria" x WHERE x."pai_id" = carro."id" AND x."nome" = s.nome);
