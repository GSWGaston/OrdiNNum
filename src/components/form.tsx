"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { Estado } from "@/lib/estado";
import { botao } from "./estilos";

/** Formulário ligado a uma server action que devolve { erro } ou { ok }. */
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
  const [estado, acao] = useActionState(action, null);
  return (
    <form action={acao} className={className} id={id}>
      {children}
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
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      aria-busy={pending}
      className={className}
      onClick={(e) => {
        if (confirmar && !window.confirm(confirmar)) e.preventDefault();
      }}
    >
      {pending ? "Salvando…" : children}
    </button>
  );
}
