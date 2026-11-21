import Link from "next/link";
import type { Alerta } from "@/lib/calculos/alertas";
import { cartao } from "./estilos";

/** Lista de alertas do painel: ícone + texto (não só cor), cada um leva à tela onde se resolve. */
export function Alertas({ alertas }: { alertas: Alerta[] }) {
  if (!alertas.length) return null;
  return (
    <section className={`${cartao} flex flex-col gap-2`} aria-labelledby="alertas">
      <h2 id="alertas" className="text-sm font-semibold">
        Alertas ({alertas.length})
      </h2>
      <ul className="flex flex-col gap-1.5 text-sm">
        {alertas.map((a, i) => (
          <li key={i}>
            <Link
              href={a.href}
              className={`flex gap-2 rounded-md px-1 py-0.5 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:hover:bg-zinc-800 ${
                a.nivel === "urgente" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"
              }`}
            >
              <span aria-hidden>{a.nivel === "urgente" ? "✕" : "⚠"}</span>
              <span>
                <span className="sr-only">{a.nivel === "urgente" ? "Urgente: " : "Atenção: "}</span>
                {a.texto}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
