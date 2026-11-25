// Helpers for turning a pasted YouTube or Vimeo link into something the gallery can show.

function youtubeId(url: string): string | null {
	try {
		const u = new URL(url);
		const host = u.hostname.replace(/^www\./, "");
		if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
		if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
			if (u.pathname === "/watch") return u.searchParams.get("v");
			const match = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/);
			return match ? match[1] : null;
		}
	} catch {
		// not a valid URL
	}
	return null;
}

function vimeoId(url: string): string | null {
	try {
		const u = new URL(url);
		const host = u.hostname.replace(/^www\./, "");
		if (host === "vimeo.com" || host === "player.vimeo.com") {
			const match = u.pathname.match(/(\d{5,})/);
			return match ? match[1] : null;
		}
	} catch {
		// not a valid URL
	}
	return null;
}

/** Embeddable player address for a YouTube or Vimeo link, or null if the link isn't recognised. */
export function embedUrl(url?: string | null): string | null {
	if (!url) return null;
	const yt = youtubeId(url);
	if (yt) return `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0`;
	const vm = vimeoId(url);
	if (vm) return `https://player.vimeo.com/video/${vm}?autoplay=1`;
	return null;
}

/** Cover image for a YouTube link. Vimeo has no stable thumbnail address, so those need an uploaded cover. */
export function videoThumb(url?: string | null): string | null {
	if (!url) return null;
	const yt = youtubeId(url);
	return yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null;
}
