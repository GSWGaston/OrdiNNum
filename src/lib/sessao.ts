import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Id do usuário logado; manda para o login se não houver sessão. Toda leitura/escrita parte daqui. */
export async function exigirUsuario() {
  const id = (await auth())?.user?.id;
  if (!id) redirect("/entrar");
  return id;
}
