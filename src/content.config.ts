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

export const collections = { links, socials };
