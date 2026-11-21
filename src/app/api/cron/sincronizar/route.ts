import { timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { provedorPorNome } from "@/lib/bank";
import { sincronizarTodas } from "@/lib/dados/conexoes";

export const maxDuration = 60;

/** Vercel Cron (vercel.json): sincroniza todas as conexões uma vez por dia. A Vercel manda "Bearer CRON_SECRET". */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  if (!segredo || recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado))
    return new Response("não autorizado", { status: 401 });
  return Response.json(await sincronizarTodas(db, provedorPorNome));
}
