import { getCollection } from "astro:content";
import { embedUrl, videoThumb } from "./media";

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
