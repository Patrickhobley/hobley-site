import type { APIRoute } from "astro";
import { destroySession, endSessionCookie, envOf, json, sameSite } from "../../lib/auth";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
	if (!sameSite(request)) return json({ error: "Request not allowed." }, 403);
	await destroySession(envOf(locals).DB, request);
	return json({ ok: true }, 200, { "set-cookie": endSessionCookie });
};
