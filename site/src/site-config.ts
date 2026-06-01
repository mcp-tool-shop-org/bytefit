import type { SiteConfig } from '@mcptoolshop/site-theme';

export const config: SiteConfig = {
  title: '@mcptoolshop/bytefit',
  description:
    'Hardware-aware local-LLM loadout planner: chooses model class, quant, KV-cache, context, and offload policy for your VRAM/RAM, and refuses configs that would silently page to disk.',
  logoBadge: 'B',
  brandName: 'bytefit',
  repoUrl: 'https://github.com/mcp-tool-shop-org/bytefit',
  npmUrl: 'https://www.npmjs.com/package/@mcptoolshop/bytefit',
  footerText:
    'MIT Licensed — built by <a href="https://github.com/mcp-tool-shop-org" style="color:var(--color-muted);text-decoration:underline">mcp-tool-shop-org</a>',

  hero: {
    badge: 'Open source · zero deps',
    headline: 'Run the biggest model',
    headlineAccent: 'your machine can actually handle.',
    description:
      'bytefit is a hardware-aware loadout planner for local LLMs. It picks the model, quant, KV-cache, context, and offload policy for your VRAM and RAM — and refuses any config that would silently page to disk.',
    primaryCta: { href: '#usage', label: 'Get started' },
    secondaryCta: { href: 'handbook/', label: 'Read the Handbook' },
    previews: [
      { label: 'Probe', code: 'bytefit probe' },
      { label: 'Recommend', code: 'bytefit recommend' },
      { label: 'Plan', code: 'bytefit plan qwen3.6:27b' },
    ],
  },

  sections: [
    {
      kind: 'features',
      id: 'features',
      title: 'Features',
      subtitle: 'A planner, not just an estimator.',
      features: [
        {
          title: 'Closes the decision loop',
          desc: 'Not just "does it fit" — bytefit chooses model class, quant family, KV-cache type, context length, and offload policy for your exact hardware.',
        },
        {
          title: 'Refuses to page',
          desc: 'Involuntary disk paging collapses decode throughput by ~78×. bytefit checks footprint against memory and refuses — with a structured reason and a non-zero exit code — rather than launch a thrashing job.',
        },
        {
          title: 'Ready-to-run output',
          desc: 'Emits llama.cpp, Ollama, and LM Studio arguments (including fractional MoE expert offload) plus a predicted tok/s. Zero runtime dependencies.',
        },
      ],
    },
    {
      kind: 'code-cards',
      id: 'usage',
      title: 'Usage',
      cards: [
        { title: 'Install', code: 'npm install -g @mcptoolshop/bytefit' },
        { title: 'See your hardware', code: 'bytefit probe' },
        { title: 'Rank your models', code: 'bytefit recommend' },
        { title: 'Plan one model', code: 'bytefit plan qwen3.6:27b --backend llama.cpp' },
      ],
    },
  ],
};
