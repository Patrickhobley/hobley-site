import type { APIRoute } from "astro";
import { checkPassword, clearFails, clientIp, createSession, envOf, json, recordFail, sameSite, tooManyFails } from "../../lib/auth";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
	if (!sameSite(request)) return json({ error: "Request not allowed." }, 403);
	const { DB } = envOf(locals);
	const ip = clientIp(request);

	if (await tooManyFails(DB, ip)) return json({ error: "Too many wrong passwords. Wait 15 minutes and try again." }, 429);

	const body: any = await request.json().catch(() => ({}));
	if (!(await checkPassword(DB, String(body.password || "")))) {
		await recordFail(DB, ip);
		return json({ error: "Wrong password." }, 401);
	}
	await clearFails(DB, ip);
	return json({ ok: true }, 200, { "set-cookie": await createSession(DB) });
};
