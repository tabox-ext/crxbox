---
layout: home
hero:
  name: crxbox
  text: Playwright, but extension-aware
  tagline: A lightweight toolkit for end-to-end testing Chrome (MV3) extensions. Zero runtime dependencies — Playwright is a peer you provide.
  image:
    src: /crxbox-logo.png
    alt: crxbox
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: API Reference
      link: /api
    - theme: alt
      text: View on GitHub
      link: https://github.com/tabox-ext/crxbox
features:
  - title: Real extension, real browser
    details: Drives the actual installed extension in a real Chromium — not mocked chrome.* APIs. Catches the bugs mocks hide.
  - title: First-class extension surfaces
    details: Helpers for the popup, content-script UI (Shadow DOM / iframes / injection timing), the MV3 service worker (including forced restart), storage, and the extension ID / URLs.
  - title: A thin layer on Playwright
    details: You keep all of Playwright — locators, assertions, traces, parallelism. crxbox just ships the extension-specific parts so you stop hand-rolling that 150-line fixtures file.
  - title: Diagnostic errors
    details: CrxboxError with a machine-readable diagnostic.code (e.g. content-ui/not-injected) and a fix hint, instead of a vague TimeoutError.
---
