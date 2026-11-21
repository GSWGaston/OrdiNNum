import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM para identificadores do agregador guardados no banco (spec: criptografados em repouso).
// Chave: ENCRYPTION_KEY; sem ela, deriva do AUTH_SECRET.
// shortcut: trocar o AUTH_SECRET sem ENCRYPTION_KEY definida impede ler as conexões salvas (basta reconectar);
// defina ENCRYPTION_KEY própria em produção.
function chave() {
  const base = process.env.ENCRYPTION_KEY ?? process.env.AUTH_SECRET;
  if (!base) throw new Error("ENCRYPTION_KEY ou AUTH_SECRET não definido");
  return createHash("sha256").update(base).digest();
}

/** "v1:iv:tag:dados" em base64url */
export function cifrar(texto: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv, c.getAuthTag(), dados].map((x) => (typeof x === "string" ? x : x.toString("base64url"))).join(":");
}

export function decifrar(cifrado: string) {
  const [v, iv, tag, dados] = cifrado.split(":");
  if (v !== "v1" || !iv || !tag || !dados) throw new Error("formato inválido");
  const d = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(dados, "base64url")), d.final()]).toString("utf8");
}
