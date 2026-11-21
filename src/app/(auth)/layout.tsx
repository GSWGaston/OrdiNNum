import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if ((await auth())?.user?.id) redirect("/");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div>
        <p className="text-2xl font-black tracking-tight">Finanças</p>
        <p className="text-zinc-600 dark:text-zinc-400">Quanto posso gastar hoje sem comprometer minha meta do mês?</p>
      </div>
      {children}
    </main>
  );
}
