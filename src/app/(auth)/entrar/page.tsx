import Link from "next/link";
import { entrar } from "@/app/acoes";
import { Enviar, Form } from "@/components/form";
import { campo, link, rotulo } from "@/components/estilos";

export const metadata = { title: "Entrar" };

export default function Entrar() {
  return (
    <>
      <h1 className="text-xl font-bold">Entrar</h1>
      <Form action={entrar} className="flex flex-col gap-4">
        <label className={rotulo}>
          E-mail
          <input name="email" type="email" autoComplete="email" required className={campo} />
        </label>
        <label className={rotulo}>
          Senha
          <input name="senha" type="password" autoComplete="current-password" required className={campo} />
        </label>
        <Enviar>Entrar</Enviar>
      </Form>
      <p className="text-sm">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className={link}>
          Cadastre-se
        </Link>
      </p>
    </>
  );
}
