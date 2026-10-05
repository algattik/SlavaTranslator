# Chrome Web Store disclosure text

## Store listing description

Slava helps you read Russian text by adding stress marks, identifying grammatical forms, and showing definitions from your preferred Wiktionary editions.

### Read Russian with stress marks

Open the Slava toolbar menu on a page containing Russian text, then enable Slava temporarily for the current tab or allow it to run automatically on that site. Slava annotates supported Russian words with stress marks, for example `предложение` becomes `предложе́ние`. Disable Slava at any time to restore the original page text.

Stress marking, word-form analysis, lemma lookup, and grammar analysis run locally from verified indexes packaged with the extension. Slava avoids editable fields, form controls, code, hidden content, and selected text.

### Look up words in context

Pause over an annotated word, click it, or use the keyboard to open its definition. Slava immediately shows locally available information while the online definition is loading, including:

- the word's lemma and stress;
- its grammatical form and part of speech;
- gender, number, case, animacy, person, tense, and other available properties;
- verb aspect and corresponding perfective or imperfective forms;
- definitions and source links from Wiktionary.

Choose and order one or more definition languages from 21 supported Wiktionary editions. Slava tries them in your chosen order and uses English only when you select it. Definition availability and detail vary between editions.

### Control where Slava runs

- **Enable temporarily on this site** activates Slava for the current tab.
- **Always enable on this site** asks Chrome for access to that exact site.
- **Disable on this site** revokes persistent access for the current site.
- The settings page lists every site with persistent access and lets you revoke it.

### Privacy and security

Slava has no advertising, analytics, telemetry, user account, or Slava-operated server. Page annotation and linguistic analysis happen locally. When you request a definition, Slava sends only the locally resolved Russian lemma to the selected Wikimedia Wiktionary API. It does not send the page URL, surrounding text, browsing history, cookies, credentials, or unrelated page content.

The extension executes only packaged code. Wiktionary responses are origin-checked, size-bounded, parsed in an isolated extension document, reduced to text, and never executed as remote code.

### Limitations

Russian stress and morphology can be ambiguous, incomplete, or context-dependent. Slava does not guarantee perfect linguistic disambiguation, definition availability, or support for every word or page. Review the displayed result in context.

Slava is a non-commercial, open-source project with no paid or hidden features.

## Single purpose

Slava helps readers of Russian text by adding stress marks locally and retrieving Wiktionary definitions when the user pauses over an annotated word or explicitly requests a lookup.

## Permission justification

- `activeTab`: temporarily activates Slava on the tab after a toolbar action.
- `scripting`: injects the reviewed page-integration script after activation.
- `storage`: stores ordered definition-language and accessibility settings.
- `offscreen`: parses bounded Wiktionary responses away from the web page and returns text-only results.
- `https://en.wiktionary.org/*`, `https://ru.wiktionary.org/*`, `https://uk.wiktionary.org/*`, `https://de.wiktionary.org/*`, `https://fr.wiktionary.org/*`, `https://es.wiktionary.org/*`, `https://pt.wiktionary.org/*`, `https://zh.wiktionary.org/*`, `https://ja.wiktionary.org/*`, `https://ko.wiktionary.org/*`, `https://ar.wiktionary.org/*`, `https://hi.wiktionary.org/*`, `https://he.wiktionary.org/*`, `https://pl.wiktionary.org/*`, `https://ro.wiktionary.org/*`, `https://tr.wiktionary.org/*`, `https://it.wiktionary.org/*`, `https://kk.wiktionary.org/*`, `https://lv.wiktionary.org/*`, `https://et.wiktionary.org/*`, and `https://lt.wiktionary.org/*`: retrieve definitions from the user-selected ordered editions after a trusted 100 ms word hover or explicit lookup.
- Optional `http://*/*` and `https://*/*`: lets the user grant persistent activation to a site of their choice. Chrome prompts for the exact requested origin; Slava does not silently grant all sites.

## Data-use disclosure

Stress and morphology lookup are local. A trusted 100 ms word hover or explicit definition lookup sends each locally resolved normalized lemma to the selected Wiktionary editions in order until one has a usable Russian entry; Wikimedia also receives the user's IP address and ordinary network metadata. Slava does not send page URLs, surrounding text, browsing history, cookies, credentials, analytics, or telemetry. Slava does not sell or use data for advertising and operates no definition or analytics service.

## Remote code

The extension executes only packaged code. Wiktionary responses are bounded, origin-checked, parsed in an extension offscreen document, reduced to text, and never executed or inserted as remote HTML.
