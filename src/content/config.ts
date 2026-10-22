import { defineCollection, z } from 'astro:content';

const products = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    nameEn: z.string().optional(),
    slug: z.string().optional(),
    sku: z.string().optional(),
    priceHKD: z.number().nullable().optional(),
    size: z.string().optional(),
    language: z.string().optional(),
    series: z.string().optional(),
    inStock: z.boolean().optional(),
    sourceUrl: z.string().optional(),
    images: z.array(z.string()).nullish().transform((v) => v ?? []),
    features: z.array(z.string()).nullish().transform((v) => v ?? []),
  }),
});

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    excerpt: z.string(),
    date: z.coerce.date(),
    category: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    icon: z.string().optional(),
  }),
});

export const collections = { products, blog };
