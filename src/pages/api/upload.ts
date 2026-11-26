import type { APIRoute } from "astro";
import { envOf, guard, json } from "../../lib/auth";

export const prerender = false;

const MAX_BYTES = 25 * 1024 * 1024; // photos, and the preview pictures
const CHUNK = 20 * 1024 * 1024; // videos are stored in pieces this size (KV allows 25 MB per value)
const MAX_CHUNKS = 8; // 8 pieces = up to 160 MB per video
const MAX_VIDEO = 150 * 1024 * 1024;
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
//   POST /api/upload?uid=<16 hex>&chunk=<i>&chunks=<n>&name=clip.mp4
//                                              adds one piece of a video; the item appears when the last piece lands
//   DELETE /api/upload?uid=<16 hex>            throws away the pieces of an upload that failed
const UID = /^[a-f0-9]{16}$/;

export const DELETE: APIRoute = async ({ request, locals }) => {
	const denied = await guard(request, locals);
	if (denied) return denied;
	const { DB, MEDIA } = envOf(locals);
	const uid = new URL(request.url).searchParams.get("uid") || "";
	if (!UID.test(uid)) return json({ error: "Bad request." }, 400);
	if (await DB.prepare("SELECT 1 FROM items WHERE id = ?").bind(uid).first()) return json({ ok: true });
	await Promise.all(Array.from({ length: MAX_CHUNKS }, (_, i) => MEDIA.delete(`c/${uid}.${i}`)));
	return json({ ok: true });
};

export const POST: APIRoute = async ({ request, locals }) => {
	const denied = await guard(request, locals);
	if (denied) return denied;
	const { DB, MEDIA } = envOf(locals);
	const url = new URL(request.url);
	const type = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();

	const uid = url.searchParams.get("uid");
	if (uid) {
		const info = KINDS[type];
		const chunk = Number(url.searchParams.get("chunk"));
		const chunks = Number(url.searchParams.get("chunks"));
		if (!info || info.kind !== "video") return json({ error: "Videos must be MP4, WebM or MOV." }, 415);
		if (!UID.test(uid) || !Number.isInteger(chunk) || !Number.isInteger(chunks) || chunks < 1 || chunks > MAX_CHUNKS || chunk < 0 || chunk >= chunks)
			return json({ error: "Bad request." }, 400);
		if (Number(request.headers.get("content-length") || 0) > CHUNK) return json({ error: "Piece too large." }, 413);
		if (await DB.prepare("SELECT 1 FROM items WHERE id = ?").bind(uid).first()) return json({ error: "Already uploaded." }, 409);
		const part = await request.arrayBuffer();
		const last = chunk === chunks - 1;
		if (part.byteLength === 0 || part.byteLength > CHUNK || (!last && part.byteLength !== CHUNK)) return json({ error: "Piece has the wrong size." }, 400);
		await MEDIA.put(`c/${uid}.${chunk}`, part);
		if (!last) return json({ ok: true });

		const size = (chunks - 1) * CHUNK + part.byteLength;
		if (size > MAX_VIDEO) return json({ error: "That video is over 150 MB. Compress or trim it and try again." }, 413);
		const key = `m/${uid}.${info.ext}`;
		const rawName = decodeURIComponent(url.searchParams.get("name") || "Untitled");
		const title =
			rawName
				.replace(/\.[^.]+$/, "")
				.replace(/[-_]+/g, " ")
				.trim()
				.slice(0, 120) || "Untitled";
		const now = Date.now();
		// The small "manifest" value lives at the public key; the media route reads the pieces it points to.
		await MEDIA.put(key, "chunked", { metadata: { mime: type, chunks, size } });
		await DB.prepare("INSERT INTO items (id, title, kind, media_key, mime, created_at, sort) VALUES (?, ?, 'video', ?, ?, ?, ?)")
			.bind(uid, title[0].toUpperCase() + title.slice(1), key, type, now, now)
			.run();
		return json({ ok: true, id: uid, kind: "video" });
	}

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
	if (info.kind === "video") return json({ error: "Videos are uploaded in pieces. Reload the page and try again." }, 400);

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
