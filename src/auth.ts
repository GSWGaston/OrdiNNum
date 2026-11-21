import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { db } from "@/db";
import { buscarPorEmail } from "@/lib/dados/usuarios";

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
        const u = await buscarPorEmail(db, p.data.email.toLowerCase());
        const ok = await bcrypt.compare(p.data.senha, u?.senhaHash ?? HASH_FALSO);
        return u && ok ? { id: u.id, name: u.nome, email: u.email } : null;
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
