import { getCollection } from "astro:content";
import { embedUrl, videoThumb } from "./media";
import { slugify } from "./auth";

export interface GalleryTag {
	slug: string;
	title: string;
}

export interface GalleryItem {
	id: string;
	title: string;
	kind: "image" | "video";
	caption: string;
	alt: string;
	image: string | null;
	thumb: string | null;
	embed: string | null;
	videoFile: string | null;
	featured: boolean;
	date: Date | null;
	tags: GalleryTag[];
}

/** All gallery items (newest first) plus the tags that at least one item uses. */
export async function getGallery() {
	const [entries, tagEntries] = await Promise.all([
		getCollection("gallery"),
		getCollection("tags"),
	]);

	const tagTitles = new Map(tagEntries.map((tag) => [tag.id, tag.data.title]));

	const items: GalleryItem[] = entries.map((entry) => {
		const data = entry.data;
		return {
			id: entry.id,
			title: data.title,
			kind: data.kind,
			caption: data.caption ?? "",
			alt: data.alt || data.title,
			image: data.image || null,
			thumb: data.image || videoThumb(data.video_url) || null,
			embed: embedUrl(data.video_url),
			videoFile: data.video_file || null,
			featured: data.featured,
			date: data.date ?? null,
			tags: data.tags.map((slug) => ({ slug, title: tagTitles.get(slug) ?? slug })),
		};
	});

	items.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));

	const used = new Map<string, GalleryTag>();
	for (const item of items) {
		for (const tag of item.tags) used.set(tag.slug, tag);
	}
	const usedTags = [...used.values()].sort((a, b) => a.title.localeCompare(b.title));

	return { items, usedTags };
}

/**
 * Items uploaded from /manage (stored in the database). Returns null when there are none yet,
 * so the page can fall back to the sample items until the first upload.
 */
export async function getManagedGallery(db: any) {
	if (!db) return null;
	let rows: any[] = [];
	try {
		rows = (await db.prepare("SELECT * FROM items ORDER BY sort DESC").all()).results;
	} catch {
		return null;
	}
	if (rows.length === 0) return null;

	const items: GalleryItem[] = rows.map((r) => {
		const url = `/media/${r.media_key}`;
		const thumb = r.thumb_key ? `/media/${r.thumb_key}` : r.kind === "image" ? url : null;
		const titles: string[] = JSON.parse(r.tags || "[]");
		return {
			id: r.id,
			title: r.title,
			kind: r.kind,
			caption: r.caption ?? "",
			alt: r.alt || r.title,
			image: r.kind === "image" ? url : thumb,
			thumb,
			embed: null,
			videoFile: r.kind === "video" ? url : null,
			featured: false,
			date: new Date(r.created_at),
			tags: titles.map((title) => ({ slug: slugify(title) || title, title })),
		};
	});

	const used = new Map<string, GalleryTag>();
	for (const item of items) for (const tag of item.tags) used.set(tag.slug, tag);
	const usedTags = [...used.values()].sort((a, b) => a.title.localeCompare(b.title));
	return { items, usedTags };
}
