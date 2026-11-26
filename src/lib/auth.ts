// Password login for /manage. Passwords are hashed with PBKDF2 and never stored in plain text.
// Sessions are random tokens in an HttpOnly cookie; only a hash of each token is kept in the database.

const enc = new TextEncoder();
const COOKIE = "hobley_session";
const SESSION_DAYS = 14;
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
	});

export const envOf = (locals: any) => locals.runtime.env as { DB: any; MEDIA: any };

const toB64 = (buf: ArrayBuffer | Uint8Array) => {
	const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
	let s = "";
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function sha256Hex(text: string) {
	const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function pbkdf2(password: string, salt: Uint8Array) {
	const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 },
		key,
		256,
	);
	return toB64(bits);
}

export async function hashPassword(password: string) {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	return { salt: toB64(salt), hash: await pbkdf2(password, salt) };
}

export async function checkPassword(db: any, password: string) {
	const row = await db.prepare("SELECT salt, hash FROM auth WHERE id = 1").first();
	if (!row) return false;
	const attempt = await pbkdf2(password, fromB64(row.salt));
	return safeEqual(attempt, row.hash);
}

function safeEqual(a: string, b: string) {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

export const clientIp = (request: Request) => request.headers.get("cf-connecting-ip") || "unknown";

/** True when this address has failed too many times recently. */
export async function tooManyFails(db: any, ip: string) {
	const since = Date.now() - WINDOW_MS;
	await db.prepare("DELETE FROM attempts WHERE at < ?").bind(since).run();
	const row = await db.prepare("SELECT COUNT(*) AS n FROM attempts WHERE ip = ? AND at >= ?").bind(ip, since).first();
	return (row?.n ?? 0) >= MAX_FAILS;
}
export const recordFail = (db: any, ip: string) =>
	db.prepare("INSERT INTO attempts (ip, at) VALUES (?, ?)").bind(ip, Date.now()).run();
export const clearFails = (db: any, ip: string) => db.prepare("DELETE FROM attempts WHERE ip = ?").bind(ip).run();

export async function createSession(db: any) {
	const token = toB64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, "");
	const expires = Date.now() + SESSION_DAYS * 86400000;
	await db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(Date.now()).run();
	await db.prepare("INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)").bind(await sha256Hex(token), expires).run();
	return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_DAYS * 86400}`;
}

export const endSessionCookie = `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;

function cookieValue(request: Request) {
	const raw = request.headers.get("cookie") || "";
	for (const part of raw.split(";")) {
		const [k, ...v] = part.trim().split("=");
		if (k === COOKIE) return v.join("=");
	}
	return "";
}

export async function isLoggedIn(db: any, request: Request) {
	const token = cookieValue(request);
	if (!token) return false;
	const row = await db
		.prepare("SELECT expires_at FROM sessions WHERE token_hash = ?")
		.bind(await sha256Hex(token))
		.first();
	return !!row && row.expires_at > Date.now();
}

export async function destroySession(db: any, request: Request) {
	const token = cookieValue(request);
	if (token) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
}

/**
 * Guard for every admin endpoint. Returns a Response to send back when the request is not allowed, or null when it is.
 * Changes (POST, PATCH, DELETE) must also come from this site's own pages.
 */
export async function guard(request: Request, locals: any) {
	const { DB } = envOf(locals);
	if (!(await isLoggedIn(DB, request))) return json({ error: "Please log in." }, 401);
	if (request.method !== "GET") {
		const origin = request.headers.get("origin");
		if (!origin || new URL(origin).host !== new URL(request.url).host || request.headers.get("x-requested-with") !== "manage") {
			return json({ error: "Request not allowed." }, 403);
		}
	}
	return null;
}

/** Same origin check for the login endpoints, which have no session yet. */
export function sameSite(request: Request) {
	const origin = request.headers.get("origin");
	return !!origin && new URL(origin).host === new URL(request.url).host && request.headers.get("x-requested-with") === "manage";
}

export const slugify = (text: string) =>
	text
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
