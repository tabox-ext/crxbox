import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'crxbox',
  description: 'Playwright, but extension-aware. A toolkit for E2E testing Chrome (MV3) extensions.',
  base: '/crxbox/',
  lastUpdated: true,
  cleanUrls: true,
  // Brainstorming specs live under docs/superpowers — never ship them.
  srcExclude: ['superpowers/**', '**/README.md'],
  head: [
    ['link', { rel: 'icon', href: '/crxbox/crxbox-logo.png' }],
  ],
  themeConfig: {
    logo: '/crxbox-logo.png',
    search: { provider: 'local' },
    nav: [
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'API', link: '/api' },
      { text: 'Guides', link: '/guides/fixture-extension' },
      { text: 'Changelog', link: '/changelog' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting Started', link: '/getting-started' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'API', link: '/api' },
        ],
      },
      {
        text: 'Guides',
        items: [
          { text: 'Fixture extension', link: '/guides/fixture-extension' },
          { text: 'CI integration', link: '/guides/ci' },
        ],
      },
      {
        text: 'Changelog',
        items: [
          { text: 'Changelog', link: '/changelog' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/tabox-ext/crxbox' },
    ],
    editLink: {
      pattern: 'https://github.com/tabox-ext/crxbox/edit/master/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
});
