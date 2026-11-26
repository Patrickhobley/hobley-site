import type { APIRoute } from "astro";
import { envOf } from "../../lib/auth";

export const prerender = false;

// Public: serves the photos and videos you upload from /manage.
export const GET: APIRoute = async ({ request, locals, params }) => {
	const key = params.key || "";
	if (!/^(m|t)\/[a-f0-9]{16}\.[a-z0-9]{3,4}$/.test(key)) return new Response("Not found", { status: 404 });

	const { value, metadata } = await envOf(locals).MEDIA.getWithMetadata(key, "arrayBuffer");
	if (!value) return new Response("Not found", { status: 404 });

	const mime = (metadata as any)?.mime || "application/octet-stream";
	const size = value.byteLength;
	const headers: Record<string, string> = {
		"content-type": mime,
		"cache-control": "public, max-age=31536000, immutable",
		"accept-ranges": "bytes",
		"x-content-type-options": "nosniff",
	};

	// Video needs byte ranges so people can skip around.
	const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") || "");
	if (range && (range[1] || range[2])) {
		let start = range[1] ? Number(range[1]) : size - Number(range[2]);
		let end = range[1] && range[2] ? Number(range[2]) : size - 1;
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
