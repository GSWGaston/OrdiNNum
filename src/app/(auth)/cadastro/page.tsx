import Link from "next/link";
import { cadastrar } from "@/app/acoes";
import { Enviar, Form } from "@/components/form";
import { campo, link, rotulo } from "@/components/estilos";

export const metadata = { title: "Cadastro" };

export default function Cadastro() {
  return (
    <>
      <h1 className="text-xl font-bold">Criar conta</h1>
      <Form action={cadastrar} className="flex flex-col gap-4">
        <label className={rotulo}>
          Nome
          <input name="nome" autoComplete="name" required maxLength={100} className={campo} />
        </label>
        <label className={rotulo}>
          E-mail
          <input name="email" type="email" autoComplete="email" required className={campo} />
        </label>
        <label className={rotulo}>
          Senha (mínimo 8 caracteres)
          <input name="senha" type="password" autoComplete="new-password" required minLength={8} className={campo} />
        </label>
        <Enviar>Criar conta</Enviar>
      </Form>
      <p className="text-sm">
        Já tem conta?{" "}
        <Link href="/entrar" className={link}>
          Entrar
        </Link>
      </p>
    </>
  );
}
