import { connexion, cookieSession, ipDe } from "@/lib/admin";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let b: { email?: unknown; code?: unknown } = {};
  try {
    b = await req.json();
  } catch {}
  const r = await connexion(b.email, b.code, ipDe(req));
  if (!r.ok) return json({ erreur: r.message }, { status: r.statut });
  return json({ ok: true, email: r.email }, { headers: { "Set-Cookie": cookieSession(r.jeton) } });
}
