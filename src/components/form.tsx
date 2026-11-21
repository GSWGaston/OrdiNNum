"use client";

import { createContext, startTransition, useActionState, useContext, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { Estado } from "@/lib/estado";
import { botao } from "./estilos";

const Pendente = createContext(false);

/**
 * Formulário ligado a uma server action que devolve { erro } ou { ok }.
 * O React normalmente reseta o formulário depois de toda ação: com erro, isso apagaria o que foi digitado; com
 * sucesso, os <select> voltariam ao valor antigo. Aqui o envio é feito à mão (sem reset) e o formulário só é
 * remontado (key) quando dá certo, já com os valores novos vindos do servidor.
 * Sem JavaScript, o atributo action continua enviando normalmente.
 */
export function Form({
  action,
  children,
  className,
  id,
}: {
  action: (anterior: Estado, fd: FormData) => Promise<Estado>;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const [estado, acao, pendente] = useActionState(async (anterior: (Estado & { n?: number }) | null, fd: FormData) => {
    const r = await action(anterior, fd);
    const n = anterior?.n ?? 0;
    return { ...r, n: r?.ok ? n + 1 : n };
  }, null);
  return (
    <form
      key={estado?.n ?? 0}
      action={acao}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => acao(fd));
      }}
      className={className}
      id={id}
    >
      <Pendente value={pendente}>{children}</Pendente>
      {estado?.erro && (
        <p role="alert" className="w-full text-sm font-medium text-red-700 dark:text-red-400">
          ⚠ {estado.erro}
        </p>
      )}
      {estado?.ok && (
        <p role="status" className="w-full text-sm text-emerald-700 dark:text-emerald-400">
          ✓ {estado.ok}
        </p>
      )}
    </form>
  );
}

export function Enviar({
  children,
  className = botao,
  confirmar,
  name,
  value,
}: {
  children: ReactNode;
  className?: string;
  confirmar?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  const pendente = useContext(Pendente) || pending;
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pendente}
      aria-busy={pendente}
      className={className}
      onClick={(e) => {
        if (confirmar && !window.confirm(confirmar)) e.preventDefault();
      }}
    >
      {pendente ? "Salvando…" : children}
    </button>
  );
}
