# Slava Russian Dictionary

Slava is a Manifest V3 browser extension that adds stress marks to Russian text and retrieves definitions when the user pauses over an annotated word or explicitly uses pointer, keyboard, or search lookup. Stress and morphology lookups use verified read-only indexes packaged with the extension. Definitions are not bundled or hosted by Slava.

## Product behavior

- **Local by default:** Page annotation, token normalization, morphology lookup, and stress lookup use packaged data and do not require a network request.
- **Hover and explicit online definitions:** Holding a real pointer over an annotated word for at least 100 ms opens an anchored card for the exact word form and all locally resolved lemmas. Clicking, using the keyboard, or submitting the lookup form opens the accessible dialog. Users choose and order one or more Wiktionary editions; missing pages and missing Russian entries advance to the next selected edition.
- **Reversible page changes:** Deactivation restores the original text. Slava skips form controls, editable content, code and preformatted content, hidden content, and selected text.
- **Bounded hover lookup:** Page loading, synthetic events, and background prefetch do not request definitions. A trusted pointer hover requests only locally resolved lemmas after the 100 ms delay and is cancelled when the pointer leaves.
- **Explicit definition providers:** Online definitions use only the exact English, Russian, Ukrainian, German, French, Spanish, Portuguese, Chinese, Japanese, Korean, Arabic, Hindi, Hebrew, Polish, Romanian, Turkish, Italian, Kazakh, Latvian, Estonian, and Lithuanian Wiktionary origins declared in the manifest.

See the [user guide](docs/index.md), [privacy policy](docs/privacy.md), [support and recovery guide](docs/support.md), and [security policy](SECURITY.md).

## Permissions

`activeTab` and `scripting` support one-time activation after a toolbar action. `storage` stores settings. `offscreen` isolates reduction of remote Wiktionary markup into bounded text. Twenty-one exact Wiktionary host permissions permit definition requests from the service worker. Optional `http://*/*` and `https://*/*` access is requested only when the user chooses persistent activation for a specific site; Slava stores and uses the granted exact origin.

## Languages

The interface and grammatical labels support English, Russian, Ukrainian, German, French, Spanish, Brazilian Portuguese, Simplified Chinese, Japanese, Korean, Arabic, Hindi, Hebrew, Polish, Romanian, Turkish, Italian, Kazakh, Latvian, Estonian, and Lithuanian. The default follows the browser UI language, and the options page can override it independently from the selected definition edition. Arabic and Hebrew use right-to-left layout.

Offline stress, morphology, lemma resolution, and grammatical analysis remain derived solely from the pinned English Wiktionary/Kaikki snapshot. Live definitions can use an ordered, non-empty selection of the 21 supported Wiktionary editions. English is used only when the user includes it.

## Build and test

Requirements: Node.js 22.18 or later, npm 11.19.1, and `unzip`.

```bash
npm ci
npx playwright install chromium
npm run format:check
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run release:verify
npm run test:e2e:packaged
```

`npm run release:verify` builds the Chrome ZIP, generates a CycloneDX SBOM, verifies dependency licenses, scans compiled code, enforces the package allowlist and size budgets, and writes release evidence under `artifacts/`. `npm run test:e2e:live` runs opt-in live checks against the 21 Wiktionary editions; live content is not a release input.

## Data and licensing

The stress index is derived from `russian-stress-marker` under the MIT License. The morphology index is derived from a dated Kaikki/Wiktextract extraction of English Wiktionary under CC BY-SA 4.0 and GFDL terms. Live definitions remain Wikimedia content and are shown with their source edition and link. See [third-party notices](THIRD_PARTY_NOTICES.md) and the packaged notices.

Project code retains the repository's declared [CC BY-SA 3.0 license](LICENSE.md). Third-party data and live content retain their own licenses.

## Release status

Chrome is the release target. A Firefox-compatible build is maintained as portability evidence but Firefox store signing is not release-blocking. Chrome Web Store publication is a separate maintainer action.
