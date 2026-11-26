import type { APIRoute } from "astro";
import { envOf } from "../../lib/auth";

export const prerender = false;

const CHUNK = 20 * 1024 * 1024; // must match the piece size used by /api/upload

// Public: serves the photos and videos you upload from /manage.
export const GET: APIRoute = async ({ request, locals, params }) => {
	const key = params.key || "";
	const match = /^(m|t)\/([a-f0-9]{16})\.[a-z0-9]{3,4}$/.exec(key);
	if (!match) return new Response("Not found", { status: 404 });
	const { MEDIA } = envOf(locals);

	const found = await MEDIA.getWithMetadata(key, "arrayBuffer");
	if (!found.value) return new Response("Not found", { status: 404 });

	const meta: any = found.metadata || {};
	const mime = meta.mime || "application/octet-stream";
	const headers: Record<string, string> = {
		"content-type": mime,
		"cache-control": "public, max-age=31536000, immutable",
		"accept-ranges": "bytes",
		"x-content-type-options": "nosniff",
	};
	const rangeHeader = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") || "");
	const wantsRange = !!rangeHeader && !!(rangeHeader[1] || rangeHeader[2]);

	// Large videos are stored as several pieces. Each reply carries at most one piece.
	if (meta.chunks) {
		const size = Number(meta.size);
		const id = match[2];
		let start = 0;
		let end = size - 1;
		if (wantsRange) {
			start = rangeHeader![1] ? Number(rangeHeader![1]) : size - Number(rangeHeader![2]);
			end = rangeHeader![1] && rangeHeader![2] ? Number(rangeHeader![2]) : size - 1;
		}
		start = Math.max(0, start);
		end = Math.min(size - 1, end);
		if (start > end || start >= size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
		const index = Math.floor(start / CHUNK);
		end = Math.min(end, (index + 1) * CHUNK - 1);
		const piece = await MEDIA.get(`c/${id}.${index}`, "arrayBuffer");
		if (!piece) return new Response("Not found", { status: 404 });
		const body = piece.slice(start - index * CHUNK, end - index * CHUNK + 1);
		return new Response(body, {
			status: 206,
			headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(body.byteLength) },
		});
	}

	const value = found.value;
	const size = value.byteLength;
	if (wantsRange) {
		let start = rangeHeader![1] ? Number(rangeHeader![1]) : size - Number(rangeHeader![2]);
		let end = rangeHeader![1] && rangeHeader![2] ? Number(rangeHeader![2]) : size - 1;
		start = Math.max(0, start);
		end = Math.min(size - 1, end);
		if (start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
		return new Response(value.slice(start, end + 1), {
			status: 206,
			headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
		});
	}
	return new Response(value, { headers: { ...headers, "content-length": String(size) } });
};
