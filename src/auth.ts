import bcrypt from "bcryptjs";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { db } from "@/db";
import { limparFalhas, loginBloqueado, registrarFalha } from "@/lib/dados/tentativas";
import { buscarPorEmail } from "@/lib/dados/usuarios";

/** Erro com código próprio para a tela de login dizer "muitas tentativas" em vez de "senha inválida". */
export class LoginBloqueado extends CredentialsSignin {
  code = "bloqueado";
}

// Compara contra um hash falso quando o e-mail não existe, para o tempo de resposta não revelar quem tem cadastro.
const HASH_FALSO = "$2b$12$WkUQZh9tFxTt8Z/rP7oZ4eSKJRXbNydd94SqjevkvBMCXosJnBzfi";

const credenciais = z.object({ email: z.email().max(200), senha: z.string().min(1).max(200) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" }, // cookie de sessão httpOnly, assinado e criptografado pelo Auth.js
  pages: { signIn: "/entrar" },
  providers: [
    Credentials({
      credentials: { email: {}, senha: {} },
      async authorize(raw) {
        const p = credenciais.safeParse(raw);
        if (!p.success) return null;
        const email = p.data.email.toLowerCase();
        // vale também para e-mail sem cadastro: o bloqueio não revela quem existe
        if (await loginBloqueado(db, email)) throw new LoginBloqueado();
        const u = await buscarPorEmail(db, email);
        const ok = await bcrypt.compare(p.data.senha, u?.senhaHash ?? HASH_FALSO);
        if (!u || !ok) {
          await registrarFalha(db, email);
          return null;
        }
        await limparFalhas(db, email);
        return { id: u.id, name: u.nome, email: u.email };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid as string;
      return session;
    },
  },
});
