import type { APIRoute } from "astro";
import { clearFails, clientIp, createSession, envOf, hashPassword, json, recordFail, sameSite, sha256Hex, tooManyFails } from "../../lib/auth";

export const prerender = false;

// First-time setup: needs the one-time setup code, then you choose your password.
export const POST: APIRoute = async ({ request, locals }) => {
	if (!sameSite(request)) return json({ error: "Request not allowed." }, 403);
	const { DB } = envOf(locals);
	const ip = clientIp(request);

	if (await DB.prepare("SELECT 1 FROM auth WHERE id = 1").first()) return json({ error: "A password is already set." }, 409);
	if (await tooManyFails(DB, ip)) return json({ error: "Too many tries. Wait 15 minutes and try again." }, 429);

	const body: any = await request.json().catch(() => ({}));
	const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
	const password = String(body.password || "");
	if (password.length < 10) return json({ error: "Use at least 10 characters for the password." }, 400);

	const found = code ? await DB.prepare("SELECT 1 FROM setup WHERE code_hash = ?").bind(await sha256Hex(code)).first() : null;
	if (!found) {
		await recordFail(DB, ip);
		return json({ error: "That setup code is not right." }, 403);
	}

	const { salt, hash } = await hashPassword(password);
	await DB.prepare("INSERT INTO auth (id, salt, hash, created_at) VALUES (1, ?, ?, ?)").bind(salt, hash, Date.now()).run();
	await DB.prepare("DELETE FROM setup").run();
	await clearFails(DB, ip);
	return json({ ok: true }, 200, { "set-cookie": await createSession(DB) });
};
