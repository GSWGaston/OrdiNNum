"use client";

import { useState, useTransition } from "react";
import { registrarItemAcao, tokenConexaoBanco } from "@/app/acoes";
import { botao } from "./estilos";

/** Abre o widget da Pluggy (iframe de connect.pluggy.ai). O token é curto e só serve para abrir o widget. */
export function ConectarPluggy({ sandbox }: { sandbox: boolean }) {
  const [msg, setMsg] = useState<{ erro?: string; ok?: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const registrar = (itemId: string, aviso?: string) =>
    iniciar(async () => {
      const r = await registrarItemAcao(itemId);
      setMsg(r?.erro ? r : { ok: aviso ?? r?.ok });
    });

  async function abrir() {
    setMsg(null);
    const r = await tokenConexaoBanco();
    if (!r.token) return setMsg({ erro: r.erro ?? "Não foi possível abrir a conexão." });
    const { PluggyConnect } = await import("pluggy-connect-sdk");
    const widget = new PluggyConnect({
      connectToken: r.token,
      includeSandbox: sandbox,
      language: "pt",
      onSuccess: ({ item }) => registrar(item.id),
      onError: ({ message, data }) => {
        // ex.: autorização pendente no app do banco: o item existe e a próxima sincronização traz os dados
        if (data?.item?.id) registrar(data.item.id, "Conexão criada; os dados chegam quando o banco liberar a autorização.");
        else setMsg({ erro: `A conexão não foi concluída: ${message}` });
      },
    });
    await widget.init();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" onClick={abrir} disabled={pendente} className={botao}>
        {pendente ? "Importando…" : "Conectar banco"}
      </button>
      {msg?.erro && (
        <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
          ⚠ {msg.erro}
        </p>
      )}
      {msg?.ok && (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          ✓ {msg.ok}
        </p>
      )}
    </div>
  );
}
