import type { APIRoute } from "astro";
import { envOf, guard, json } from "../../../lib/auth";

export const prerender = false;

const cleanTags = (value: unknown) =>
	Array.isArray(value)
		? [...new Set(value.map((t) => String(t).trim().slice(0, 40)).filter(Boolean))].slice(0, 12)
		: [];

export const PATCH: APIRoute = async ({ request, locals, params }) => {
	const denied = await guard(request, locals);
	if (denied) return denied;
	const body: any = await request.json().catch(() => ({}));
	const title = String(body.title ?? "").trim().slice(0, 120);
	if (!title) return json({ error: "Give it a title." }, 400);
	const res = await envOf(locals)
		.DB.prepare("UPDATE items SET title = ?, caption = ?, alt = ?, tags = ? WHERE id = ?")
		.bind(title, String(body.caption ?? "").slice(0, 1000), String(body.alt ?? "").slice(0, 300), JSON.stringify(cleanTags(body.tags)), params.id)
		.run();
	return res.meta.changes ? json({ ok: true }) : json({ error: "Not found." }, 404);
};

export const DELETE: APIRoute = async ({ request, locals, params }) => {
	const denied = await guard(request, locals);
	if (denied) return denied;
	const { DB, MEDIA } = envOf(locals);
	const row = await DB.prepare("SELECT media_key, thumb_key FROM items WHERE id = ?").bind(params.id).first();
	if (!row) return json({ error: "Not found." }, 404);
	const { metadata } = await MEDIA.getWithMetadata(row.media_key);
	const chunks = Number((metadata as any)?.chunks || 0);
	for (let i = 0; i < chunks; i++) await MEDIA.delete(`c/${params.id}.${i}`);
	await MEDIA.delete(row.media_key);
	if (row.thumb_key) await MEDIA.delete(row.thumb_key);
	await DB.prepare("DELETE FROM items WHERE id = ?").bind(params.id).run();
	return json({ ok: true });
};
