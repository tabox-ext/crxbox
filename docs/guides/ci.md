# CI integration

crxbox runs on top of Playwright, so running your suite in CI is mostly "run
Playwright in CI" with two extension-specific wrinkles:

1. **A persistent Chromium context.** crxbox loads your unpacked extension into a
   persistent context using Playwright's bundled `chromium`. Extensions only load
   in that bundled Chromium — so install it with Playwright, don't rely on a
   system Chrome.
2. **Headless vs. headed.** crxbox works in Chromium's **new headless** mode, so
   the vast majority of specs run headless in CI with no display. The one
   exception is [`ext.popup.openForTab()`](/api#extpopupopenfortabactivetab-popuppath--promisepage)
   (the real toolbar popup), which is **headed-only** for reliability. If your
   suite uses it, run those specs headed under a virtual display — see
   [Headed specs](#headed-specs-xvfb) below.

## The four steps

Every CI config below does the same four things:

1. **Install dependencies** — `npm ci`.
2. **Build your extension** — produce the unpacked build directory that your
   `extensionPath` points at (shown here as `npm run build`; use whatever your
   project uses).
3. **Install Chromium + OS libraries** — `npx playwright install --with-deps chromium`.
   On Linux, `--with-deps` pulls in the system libraries Chromium needs.
4. **Run the tests** — `npx playwright test`.

> **Build before you test.** crxbox launches the extension from `extensionPath`
> (the directory containing `manifest.json`). If that directory is stale or
> missing, the launch fails — always build in CI before running the suite.

## GitHub Actions

```yaml
# .github/workflows/e2e.yml
name: e2e
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build                              # build your extension
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

The final step uploads Playwright's HTML report (and traces, if you enable
`trace: 'on-first-retry'` in `playwright.config.ts`) so you can debug failures
straight from the run.

## GitLab CI

Use Playwright's official image so Chromium and its OS dependencies are already
present — then you can skip `--with-deps`.

```yaml
# .gitlab-ci.yml
stages: [test]

e2e:
  stage: test
  image: mcr.microsoft.com/playwright:v1.49.0-noble   # match your Playwright version
  script:
    - npm ci
    - npm run build                                    # build your extension
    - npx playwright test
  artifacts:
    when: always
    paths:
      - playwright-report/
    expire_in: 1 week
```

> Keep the image tag in sync with the `@playwright/test` version in your
> `package-lock.json`. A mismatch can mean the browser build and the test runner
> disagree.

## CircleCI

CircleCI's Node image doesn't ship Chromium's libraries, so keep `--with-deps`.

```yaml
# .circleci/config.yml
version: 2.1

jobs:
  e2e:
    docker:
      - image: cimg/node:20.11
    steps:
      - checkout
      - run: npm ci
      - run: npm run build                             # build your extension
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
      - store_artifacts:
          path: playwright-report
          destination: playwright-report

workflows:
  test:
    jobs:
      - e2e
```

## Jenkins

A declarative pipeline using the Playwright Docker image (Chromium + OS deps
preinstalled):

```groovy
// Jenkinsfile
pipeline {
  agent {
    docker {
      image 'mcr.microsoft.com/playwright:v1.49.0-noble'  // match your Playwright version
      args  '--ipc=host'                                  // avoids Chromium OOM on /dev/shm
    }
  }
  stages {
    stage('Install') { steps { sh 'npm ci' } }
    stage('Build')   { steps { sh 'npm run build' } }     // build your extension
    stage('Test')    { steps { sh 'npx playwright test' } }
  }
  post {
    always {
      archiveArtifacts artifacts: 'playwright-report/**', allowEmptyArchive: true
    }
  }
}
```

The `--ipc=host` flag gives Chromium a larger shared-memory segment; without it,
Chromium can crash under load in containers. (Playwright's own image docs
recommend it; the alternative is launching with `--disable-dev-shm-usage`.)

## Headed specs (xvfb)

If any spec relies on `ext.popup.openForTab()` — the real toolbar popup — run it
**headed**, because in new-headless Chromium `chrome.action.openPopup` is
unreliable. On a headless Linux CI runner, supply a virtual display with
`xvfb-run`:

```bash
xvfb-run -a npx playwright test
```

On GitHub Actions, that's a one-line change to the test step:

```yaml
      - run: xvfb-run -a npx playwright test
```

If you use the Playwright Docker image (GitLab/Jenkins above), `xvfb` is already
installed, so the same `xvfb-run -a` prefix works there too. To keep the bulk of
your suite fast and headless and only pay for a display where you need it, split
the headed specs into their own Playwright project (or `--grep` tag) and run just
that subset under `xvfb-run`.

## Tips

- **Pin the Chromium version to Playwright.** Always install the browser through
  Playwright (`npx playwright install chromium`) rather than using a system
  Chrome — only Playwright's bundled Chromium loads unpacked extensions reliably.
- **Cache the browser download.** On self-hosted or matrix runs, cache
  `~/.cache/ms-playwright` keyed on your Playwright version to skip re-downloading
  Chromium every job.
- **Capture traces.** Set `use: { trace: 'on-first-retry' }` in
  `playwright.config.ts` and upload `playwright-report/` as an artifact — crxbox's
  `CrxboxError` diagnostics plus the Playwright trace make CI failures easy to
  diagnose without reproducing locally.
- **Retries for flake isolation.** `retries: process.env.CI ? 2 : 0` in your
  config is a common default; combined with `trace: 'on-first-retry'` you get a
  trace for exactly the runs that needed a retry.
