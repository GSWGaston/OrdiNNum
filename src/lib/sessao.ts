import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { hoje } from "@/lib/calculos/datas";
import { lancarVencidas } from "@/lib/dados/recorrencias";
import { usuarioExiste } from "@/lib/dados/usuarios";

/**
 * Id do usuário logado; manda para o login se não houver sessão. Toda leitura/escrita parte daqui.
 * Antes de devolver, lança as recorrências automáticas vencidas, para toda tela já mostrar o mês em dia.
 */
export async function exigirUsuario() {
  const id = (await auth())?.user?.id;
  if (!id) redirect("/entrar");
  // conta apagada (em outro aparelho, por exemplo) com o cookie ainda válido: encerra a sessão
  if (!(await usuarioExiste(db, id))) redirect("/sair");
  // shortcut: roda ao abrir o app (o lançamento sai com a data do vencimento, então o resultado é o mesmo);
  // trocar por Vercel Cron se um dia houver alerta/notificação que precise disparar sem o usuário entrar.
  await lancarVencidas(db, id, hoje());
  return id;
}
