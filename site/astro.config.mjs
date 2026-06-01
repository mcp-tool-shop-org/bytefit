// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://mcp-tool-shop-org.github.io',
  base: '/bytefit',
  integrations: [
    starlight({
      title: 'bytefit',
      logo: { src: './src/assets/logo.png', alt: 'bytefit', href: '/bytefit/', replacesTitle: true },
      description: 'Hardware-aware local-LLM loadout planner: chooses model class, quant, KV-cache, context, and offload policy for your VRAM/RAM, and refuses configs that would silently page to disk.',
      disable404Route: true,
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/mcp-tool-shop-org/bytefit' },
      ],
      sidebar: [
        {
          label: 'Handbook',
          autogenerate: { directory: 'handbook' },
        },
      ],
      customCss: ['./src/styles/starlight-custom.css'],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
