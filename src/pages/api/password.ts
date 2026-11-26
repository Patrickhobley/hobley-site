import type { APIRoute } from "astro";
import { checkPassword, createSession, envOf, guard, hashPassword, json } from "../../lib/auth";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
	const denied = await guard(request, locals);
	if (denied) return denied;
	const { DB } = envOf(locals);
	const body: any = await request.json().catch(() => ({}));
	if (!(await checkPassword(DB, String(body.current || "")))) return json({ error: "Your current password is not right." }, 403);
	const next = String(body.next || "");
	if (next.length < 10) return json({ error: "Use at least 10 characters for the new password." }, 400);
	const { salt, hash } = await hashPassword(next);
	await DB.prepare("UPDATE auth SET salt = ?, hash = ? WHERE id = 1").bind(salt, hash).run();
	// Sign out everywhere else, then keep this device signed in.
	await DB.prepare("DELETE FROM sessions").run();
	return json({ ok: true }, 200, { "set-cookie": await createSession(DB) });
};
