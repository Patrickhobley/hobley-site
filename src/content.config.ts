import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";

// Each button on the home page is one file in src/content/links.
// Add, reorder or remove them from /admin (Links).
const links = defineCollection({
	loader: glob({ base: "./src/content/links", pattern: "**/*.json" }),
	schema: z.object({
		title: z.string(),
		url: z.string().url(),
		order: z.number().default(100),
		sponsored: z
			.boolean()
			.nullish()
			.transform((value) => value ?? false),
	}),
});

export const collections = { links };
