import type { APIRoute } from "astro";
import { envOf, isLoggedIn, json } from "../../lib/auth";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
	const { DB } = envOf(locals);
	const row = await DB.prepare("SELECT 1 AS ok FROM auth WHERE id = 1").first();
	return json({ configured: !!row, loggedIn: await isLoggedIn(DB, request) });
};
