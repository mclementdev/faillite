import { routeAdmin } from "@/lib/garde-admin";
import { json } from "@/lib/http";
import { journal } from "@/lib/poids";

export const dynamic = "force-dynamic";

export const GET = routeAdmin(async () => json({ journal: await journal() }));
