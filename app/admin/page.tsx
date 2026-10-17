import { cookies } from "next/headers";
import Backoffice, { ConnexionAdmin } from "@/components/Backoffice";
import { codeRequis, COOKIE_ADMIN, verifierJetonSession } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Faillite ! · Backoffice", robots: { index: false } };

/** La session est vérifiée côté serveur avant d'afficher quoi que ce soit. */
export default async function PageAdmin() {
  const jeton = (await cookies()).get(COOKIE_ADMIN)?.value;
  let email: string | null = null;
  try {
    email = verifierJetonSession(jeton);
  } catch {
    email = null;
  }
  if (!email) return <ConnexionAdmin avecCode={codeRequis()} />;
  return <Backoffice email={email} />;
}
