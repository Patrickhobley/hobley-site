import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";

const address = z
	.string()
	.refine((value) => /^(https?:\/\/|mailto:).+/.test(value), "Start with https:// or mailto:");

// Each button on the home page is one file in src/content/links.
// Add, reorder or remove them from /admin (Buttons).
const links = defineCollection({
	loader: glob({ base: "./src/content/links", pattern: "**/*.json" }),
	schema: z.object({
		title: z.string(),
		url: address,
		order: z.number().default(100),
		sponsored: z
			.boolean()
			.nullish()
			.transform((value) => value ?? false),
	}),
});

// Each icon in the row at the bottom is one file in src/content/socials.
// Add, reorder or remove them from /admin (Social icons).
const socials = defineCollection({
	loader: glob({ base: "./src/content/socials", pattern: "**/*.json" }),
	schema: z.object({
		title: z.string(),
		url: address,
		platform: z
			.enum(["instagram", "x", "youtube", "twitch", "steam", "spotify", "linkedin", "email", "website"])
			.default("website"),
		order: z.number().default(100),
	}),
});

// Tags are the gallery menu categories. The file name is the id, e.g. interiors.json -> "interiors".
const tags = defineCollection({
	loader: glob({ base: "./src/content/tags", pattern: "**/*.json" }),
	schema: z.object({ title: z.string() }),
});

// Gallery items are managed from /admin (Gallery). One JSON file per photo or video.
const gallery = defineCollection({
	loader: glob({ base: "./src/content/gallery", pattern: "**/*.json" }),
	schema: z.object({
		title: z.string(),
		kind: z.enum(["image", "video"]).default("image"),
		image: z.string().nullish(),
		alt: z.string().nullish(),
		video_url: z.string().nullish(),
		video_file: z.string().nullish(),
		caption: z.string().nullish(),
		tags: z
			.array(z.string())
			.nullish()
			.transform((value) => value ?? []),
		date: z.coerce.date().nullish(),
		featured: z.boolean().nullish().transform((value) => value ?? false),
	}),
});

export const collections = { links, socials, tags, gallery };
