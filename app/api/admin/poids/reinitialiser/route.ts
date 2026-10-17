import { routeAdmin } from "@/lib/garde-admin";
import { json } from "@/lib/http";
import { reinitialiserPoids } from "@/lib/poids";

export const dynamic = "force-dynamic";

export const POST = routeAdmin(async (req, email) => {
  let type: "carte" | "evenement" | undefined;
  try {
    const b = (await req.json()) as { type?: string };
    if (b.type === "carte" || b.type === "evenement") type = b.type;
  } catch {}
  await reinitialiserPoids(email, type);
  return json({ ok: true });
});
