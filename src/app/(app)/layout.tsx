import Link from "next/link";
import { auth } from "@/auth";
import { Nav } from "@/components/nav";
import { sair } from "@/app/acoes";
import { exigirUsuario } from "@/lib/sessao";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await exigirUsuario();
  const nome = (await auth())?.user?.name;
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 pb-24 md:pb-8">
      <header className="flex items-center justify-between gap-2 py-3">
        <Link href="/" className="text-lg font-black tracking-tight">
          Finanças
        </Link>
        <div className="hidden md:block">
          <Nav />
        </div>
        <form action={sair} className="flex items-center gap-2 text-sm">
          <span className="hidden text-zinc-600 sm:inline dark:text-zinc-400">{nome}</span>
          <button className="rounded px-2 py-1 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-600">Sair</button>
        </form>
      </header>
      <main className="flex flex-1 flex-col gap-4">{children}</main>
      <div className="md:hidden">
        <Nav />
      </div>
      <Link
        href="/lancamentos/novo"
        aria-label="Novo lançamento"
        className="fixed right-4 bottom-20 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-700 text-3xl text-white shadow-lg hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 md:bottom-8"
      >
        +
      </Link>
    </div>
  );
}
