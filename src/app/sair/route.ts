import { signOut } from "@/auth";

// Encerra uma sessão cujo usuário não existe mais (ver exigirUsuario). O botão "Sair" usa a server action.
export async function GET() {
  await signOut({ redirectTo: "/entrar" });
}
