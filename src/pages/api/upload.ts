import type { APIRoute } from "astro";
import { envOf, guard, json } from "../../lib/auth";

export const prerender = false;

const MAX_BYTES = 25 * 1024 * 1024;
const KINDS: Record<string, { kind: "image" | "video"; ext: string }> = {
	"image/jpeg": { kind: "image", ext: "jpg" },
	"image/png": { kind: "image", ext: "png" },
	"image/webp": { kind: "image", ext: "webp" },
	"image/gif": { kind: "image", ext: "gif" },
	"image/avif": { kind: "image", ext: "avif" },
	"video/mp4": { kind: "video", ext: "mp4" },
	"video/webm": { kind: "video", ext: "webm" },
	"video/quicktime": { kind: "video", ext: "mov" },
};

const newId = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");

// The browser sends the file itself as the request body.
//   POST /api/upload?name=beach.jpg            adds a photo or video (returns its id)
//   POST /api/upload?thumb=<id>                adds the small preview picture for that item
export const POST: APIRoute = async ({ request, locals }) => {
	const denied = await guard(request, locals);
	if (denied) return denied;
	const { DB, MEDIA } = envOf(locals);
	const url = new URL(request.url);
	const type = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();

	const declared = Number(request.headers.get("content-length") || 0);
	if (declared > MAX_BYTES) return json({ error: "That file is over 25 MB. Make it smaller and try again." }, 413);
	const data = await request.arrayBuffer();
	if (data.byteLength === 0) return json({ error: "The file was empty." }, 400);
	if (data.byteLength > MAX_BYTES) return json({ error: "That file is over 25 MB. Make it smaller and try again." }, 413);

	const thumbFor = url.searchParams.get("thumb");
	if (thumbFor) {
		if (type !== "image/jpeg" && type !== "image/webp") return json({ error: "Preview must be a JPEG or WebP." }, 415);
		const item = await DB.prepare("SELECT id, thumb_key FROM items WHERE id = ?").bind(thumbFor).first();
		if (!item) return json({ error: "Not found." }, 404);
		const key = `t/${item.id}.${type === "image/webp" ? "webp" : "jpg"}`;
		await MEDIA.put(key, data, { metadata: { mime: type } });
		await DB.prepare("UPDATE items SET thumb_key = ? WHERE id = ?").bind(key, item.id).run();
		return json({ ok: true });
	}

	const info = KINDS[type];
	if (!info) return json({ error: "Photos (JPEG, PNG, WebP, GIF) and videos (MP4, WebM, MOV) only." }, 415);

	const id = newId();
	const key = `m/${id}.${info.ext}`;
	const rawName = decodeURIComponent(url.searchParams.get("name") || "Untitled");
	const title =
		rawName
			.replace(/\.[^.]+$/, "")
			.replace(/[-_]+/g, " ")
			.trim()
			.slice(0, 120) || "Untitled";
	const now = Date.now();

	await MEDIA.put(key, data, { metadata: { mime: type } });
	await DB.prepare("INSERT INTO items (id, title, kind, media_key, mime, created_at, sort) VALUES (?, ?, ?, ?, ?, ?, ?)")
		.bind(id, title[0].toUpperCase() + title.slice(1), info.kind, key, type, now, now)
		.run();
	return json({ ok: true, id, kind: info.kind });
};
