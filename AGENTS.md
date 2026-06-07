# Agent guide

This repo uses **crxbox** for Chrome-extension tests. The authoritative, token-efficient
reference is the bundled skill: `node_modules/crxbox/skill/SKILL.md`. Read it before
writing or editing extension tests. Key rules: one import (`crxbox`), helpers auto-wait
(never `waitForTimeout`), and failures carry `err.diagnostic.code` for self-correction.
