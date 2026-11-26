import type { APIRoute } from "astro";
import { envOf, guard, json } from "../../../lib/auth";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
	const denied = await guard(request, locals);
	if (denied) return denied;
	const { results } = await envOf(locals).DB.prepare("SELECT * FROM items ORDER BY sort DESC").all();
	return json({
		items: results.map((r: any) => ({
			id: r.id,
			title: r.title,
			kind: r.kind,
			caption: r.caption ?? "",
			alt: r.alt ?? "",
			tags: JSON.parse(r.tags || "[]"),
			url: `/media/${r.media_key}`,
			thumb: r.thumb_key ? `/media/${r.thumb_key}` : r.kind === "image" ? `/media/${r.media_key}` : null,
		})),
	});
};
