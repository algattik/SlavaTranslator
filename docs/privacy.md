# Privacy policy

Slava performs stress marking and morphology lookup locally with indexes packaged in the extension. It has no analytics, advertising, telemetry, user account, Slava-operated definition server, or persistent definition cache.

## Data sent for a hover or explicit definition lookup

After a real pointer remains over an annotated word for at least 100 ms, or after an explicit pointer, keyboard, or search action, Slava resolves the exact surface form locally and sends each resulting normalized Russian lemma to the user-selected MediaWiki Action API origins in order:

- `https://en.wiktionary.org`
- `https://ru.wiktionary.org`
- `https://uk.wiktionary.org`
- `https://de.wiktionary.org`
- `https://fr.wiktionary.org`
- `https://es.wiktionary.org`
- `https://pt.wiktionary.org`
- `https://zh.wiktionary.org`
- `https://ja.wiktionary.org`
- `https://ko.wiktionary.org`
- `https://ar.wiktionary.org`
- `https://hi.wiktionary.org`
- `https://he.wiktionary.org`
- `https://pl.wiktionary.org`
- `https://ro.wiktionary.org`
- `https://tr.wiktionary.org`
- `https://it.wiktionary.org`
- `https://kk.wiktionary.org`
- `https://lv.wiktionary.org`
- `https://et.wiktionary.org`
- `https://lt.wiktionary.org`

Wikimedia receives each resolved lemma, the edition implied by the host, the user's IP address, and ordinary network metadata such as headers and timing. A missing page or missing Russian entry can cause a request to the next selected edition. English is requested only when selected. Wikimedia processes those requests under its own terms and privacy policy.

Slava does not add the page URL, surrounding page text, browsing history, unrelated tokens, cookies, credentials, analytics identifiers, or telemetry to definition requests. The hovered surface form remains local unless it is itself the only lemma candidate. Browser-managed network infrastructure can still expose ordinary connection metadata to the browser, network operator, and Wikimedia.

## Local storage

Chrome storage contains the ordered definition-edition selection, accessibility preferences, and exact origins granted for persistent activation. Bounded in-memory caches contain local lookup results and verified index chunks; they are not browsing history and disappear with the extension process. Definitions are not persistently cached by Slava.

Exported diagnostics contain selected settings and bounded technical state. They exclude persistent site origins, page URLs, surrounding text, browsing history, IP addresses, raw definitions, and lookup history.

## Control and deletion

Revoke a persistent site from Slava's options page or Chrome's extension site-access settings. Uninstalling the extension removes its Chrome-managed settings and grants. Slava has no server-side account or retained telemetry to delete.

## Guarantees and limits

The implementation and automated tests enforce the stated request fields, origins, credential omission, explicit-action boundary, response limits, and packaged-code policy. This policy does not claim anonymity, guaranteed Wikimedia availability, perfect correctness, fully offline definitions, or absolute security.
