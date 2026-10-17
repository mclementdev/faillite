/**
 * Accès au stockage : Redis (Upstash) en production, mémoire en développement local.
 * Toutes les valeurs sont des chaînes (JSON sérialisé par l'appelant).
 */
import { Redis } from "@upstash/redis";

export interface Stockage {
  get(cle: string): Promise<string | null>;
  set(cle: string, valeur: string, expirationSecondes?: number): Promise<void>;
  del(cle: string): Promise<void>;
  /** Écrit seulement si la version stockée vaut `versionAttendue` (ou si la clé n'existe pas et versionAttendue = 0). */
  setSiVersion(cle: string, valeur: string, versionAttendue: number, expirationSecondes: number): Promise<boolean>;
  hset(cle: string, champ: string, valeur: string): Promise<void>;
  hget(cle: string, champ: string): Promise<string | null>;
  hgetall(cle: string): Promise<Record<string, string>>;
  hlen(cle: string): Promise<number>;
  expire(cle: string, secondes: number): Promise<void>;
  incr(cle: string, expirationSecondes: number): Promise<number>;
  lpush(cle: string, valeur: string, garder: number): Promise<void>;
  lrange(cle: string, debut: number, fin: number): Promise<string[]>;
}

/* ------------------------------------------------------------------ */

const SCRIPT_CAS = `
local cur = redis.call('GET', KEYS[1])
local attendue = tonumber(ARGV[2])
if cur then
  local ok, obj = pcall(cjson.decode, cur)
  if not ok or obj.version ~= attendue then return 0 end
elseif attendue ~= 0 then
  return 0
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[3]))
return 1`;

class StockageRedis implements Stockage {
  constructor(private r: Redis) {}
  async get(cle: string) {
    return (await this.r.get<string>(cle)) ?? null;
  }
  async set(cle: string, valeur: string, ex?: number) {
    if (ex) await this.r.set(cle, valeur, { ex });
    else await this.r.set(cle, valeur);
  }
  async del(cle: string) {
    await this.r.del(cle);
  }
  async setSiVersion(cle: string, valeur: string, versionAttendue: number, ex: number) {
    const r = await this.r.eval(SCRIPT_CAS, [cle], [valeur, String(versionAttendue), String(ex)]);
    return Number(r) === 1;
  }
  async hset(cle: string, champ: string, valeur: string) {
    await this.r.hset(cle, { [champ]: valeur });
  }
  async hget(cle: string, champ: string) {
    return (await this.r.hget<string>(cle, champ)) ?? null;
  }
  async hgetall(cle: string) {
    return ((await this.r.hgetall<Record<string, string>>(cle)) ?? {}) as Record<string, string>;
  }
  async hlen(cle: string) {
    return this.r.hlen(cle);
  }
  async expire(cle: string, s: number) {
    await this.r.expire(cle, s);
  }
  async incr(cle: string, ex: number) {
    const p = this.r.pipeline();
    p.incr(cle);
    p.expire(cle, ex, "NX");
    const [n] = (await p.exec()) as [number, number];
    return n;
  }
  async lpush(cle: string, valeur: string, garder: number) {
    const p = this.r.pipeline();
    p.lpush(cle, valeur);
    p.ltrim(cle, 0, garder - 1);
    await p.exec();
  }
  async lrange(cle: string, debut: number, fin: number) {
    return this.r.lrange<string>(cle, debut, fin);
  }
}

/* ------------------------------------------------------------------ */

interface Entree {
  v: string | Map<string, string> | string[];
  exp?: number;
}

/** Stockage en mémoire du processus : pour le développement local et les tests uniquement. */
export class StockageMemoire implements Stockage {
  private m = new Map<string, Entree>();
  private lire(cle: string): Entree | undefined {
    const e = this.m.get(cle);
    if (e?.exp && e.exp < Date.now()) {
      this.m.delete(cle);
      return undefined;
    }
    return e;
  }
  private exp(s?: number) {
    return s ? Date.now() + s * 1000 : undefined;
  }
  async get(cle: string) {
    const e = this.lire(cle);
    return typeof e?.v === "string" ? e.v : null;
  }
  async set(cle: string, valeur: string, ex?: number) {
    this.m.set(cle, { v: valeur, exp: this.exp(ex) });
  }
  async del(cle: string) {
    this.m.delete(cle);
  }
  async setSiVersion(cle: string, valeur: string, versionAttendue: number, ex: number) {
    const cur = await this.get(cle);
    if (cur) {
      if ((JSON.parse(cur) as { version?: number }).version !== versionAttendue) return false;
    } else if (versionAttendue !== 0) return false;
    await this.set(cle, valeur, ex);
    return true;
  }
  private hash(cle: string): Map<string, string> {
    const e = this.lire(cle);
    if (e && e.v instanceof Map) return e.v;
    const h = new Map<string, string>();
    this.m.set(cle, { v: h, exp: e?.exp });
    return h;
  }
  async hset(cle: string, champ: string, valeur: string) {
    this.hash(cle).set(champ, valeur);
  }
  async hget(cle: string, champ: string) {
    return this.hash(cle).get(champ) ?? null;
  }
  async hgetall(cle: string) {
    return Object.fromEntries(this.hash(cle));
  }
  async hlen(cle: string) {
    return this.hash(cle).size;
  }
  async expire(cle: string, s: number) {
    const e = this.m.get(cle);
    if (e) e.exp = this.exp(s);
  }
  async incr(cle: string, ex: number) {
    const e = this.lire(cle);
    const n = (typeof e?.v === "string" ? Number(e.v) : 0) + 1;
    this.m.set(cle, { v: String(n), exp: e?.exp ?? this.exp(ex) });
    return n;
  }
  async lpush(cle: string, valeur: string, garder: number) {
    const e = this.lire(cle);
    const l = Array.isArray(e?.v) ? e.v : [];
    l.unshift(valeur);
    this.m.set(cle, { v: l.slice(0, garder), exp: e?.exp });
  }
  async lrange(cle: string, debut: number, fin: number) {
    const e = this.lire(cle);
    const l = Array.isArray(e?.v) ? e.v : [];
    return l.slice(debut, fin < 0 ? undefined : fin + 1);
  }
}

/* ------------------------------------------------------------------ */

const globalPourMemoire = globalThis as unknown as { __faillite_stockage?: Stockage };

export function stockage(): Stockage {
  if (globalPourMemoire.__faillite_stockage) return globalPourMemoire.__faillite_stockage;
  // L'intégration Upstash du Marketplace Vercel fournit KV_REST_API_* ; Upstash en direct fournit UPSTASH_REDIS_REST_*.
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  let s: Stockage;
  if (url && token) {
    s = new StockageRedis(new Redis({ url, token, automaticDeserialization: false }));
  } else {
    if (process.env.VERCEL) console.warn("[faillite] Aucune base Redis configurée : stockage en mémoire, NON partagé entre instances.");
    s = new StockageMemoire();
  }
  globalPourMemoire.__faillite_stockage = s;
  return s;
}

/** Pour les tests : remplace le stockage courant. */
export function definirStockage(s: Stockage | undefined) {
  globalPourMemoire.__faillite_stockage = s;
}
