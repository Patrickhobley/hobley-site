import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";

// Tags are managed from /admin (Tags). The file name is the tag's id, e.g. interiors.json -> "interiors".
const tags = defineCollection({
	loader: glob({ base: "./src/content/tags", pattern: "**/*.json" }),
	schema: z.object({
		title: z.string(),
	}),
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

export const collections = { tags, gallery };
