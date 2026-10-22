import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// NOTE: Astro 5 reads src/content.config.ts — NOT src/content/config.ts.
// Only ONE config file may exist or the collections get confused.
// Keep every collection declared here.

const products = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/products' }),
  schema: z.object({
    name: z.string(),
    nameEn: z.string().optional().default(''),
    slug: z.string().optional(),
    sku: z.string().optional().default(''),
    priceHKD: z.number().nullable().optional(),
    size: z.string().optional().default(''),
    language: z.string().optional().default('unknown'),
    series: z.string().optional().default('education'),
    inStock: z.boolean().optional().default(true),
    sourceUrl: z.string().optional().default(''),
    images: z.array(z.string()).nullish().transform((v) => v ?? []),
    features: z.array(z.string()).nullish().transform((v) => v ?? []),
  }),
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    excerpt: z.string(),
    date: z.coerce.date(),
    category: z.string().optional().default(''),
    tags: z.array(z.string()).optional().default([]),
    draft: z.boolean().optional().default(false),
    icon: z.string().optional().default('🌍'),
  }),
});

export const collections = { products, blog };
