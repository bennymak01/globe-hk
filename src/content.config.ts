import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const products = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/products' }),
  schema: z.object({
    name: z.string(),
    nameEn: z.string().optional().default(''),
    slug: z.string().optional(),
    sku: z.string().optional().default(''),
    priceHKD: z.number().optional().default(0),
    size: z.string().optional().default(''),
    language: z.string().optional().default('unknown'),
    series: z.string().optional().default('education'),
    inStock: z.boolean().optional().default(true),
    sourceUrl: z.string().optional().default(''),
    images: z.array(z.string()).optional().default([]),
    features: z.array(z.string()).optional().default([]),
  }),
});

export const collections = { products };
