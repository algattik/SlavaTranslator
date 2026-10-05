# Chrome Web Store disclosure text

## Single purpose description

> Slava helps readers understand Russian text by adding stress marks and grammatical information locally, then retrieving definitions from the user's selected Wiktionary editions when the user requests a word lookup.

## activeTab justification

> The activeTab permission lets the user activate Slava temporarily on the current tab after choosing the toolbar action. Access is limited to that tab and activation; Slava does not use activeTab for passive browsing observation.

## Host permission justification

> Slava uses scripting to inject its packaged page-integration code after user activation and offscreen to parse bounded definition responses away from the web page. The exact host patterns https://en.wiktionary.org/*, https://ru.wiktionary.org/*, https://uk.wiktionary.org/*, https://de.wiktionary.org/*, https://fr.wiktionary.org/*, https://es.wiktionary.org/*, https://pt.wiktionary.org/*, https://zh.wiktionary.org/*, https://ja.wiktionary.org/*, https://ko.wiktionary.org/*, https://ar.wiktionary.org/*, https://hi.wiktionary.org/*, https://he.wiktionary.org/*, https://pl.wiktionary.org/*, https://ro.wiktionary.org/*, https://tr.wiktionary.org/*, https://it.wiktionary.org/*, https://kk.wiktionary.org/*, https://lv.wiktionary.org/*, https://et.wiktionary.org/*, and https://lt.wiktionary.org/* are used to request definitions from the user's selected editions. The optional http://*/* and https://*/* capabilities let a user request persistent activation for a site, but Chrome prompts only for the exact user-selected origin and Slava does not silently gain access to every site.

## Remote code justification

> Slava does not use remote code. It executes only code packaged with the extension. Bounded responses from the selected Wiktionary hosts are treated as data, origin-checked, parsed in an isolated extension document, reduced to text, and never executed or inserted as remote HTML.

## storage justification

> The storage permission holds the user's interface language, ordered definition languages, stress-mark and definition-popup accessibility preferences, and the exact origins the user selected for persistent activation. Slava does not store browsing history, page content, definition queries, cookies, credentials, analytics, or telemetry.

## Required dashboard actions

1. Upload the new Manifest V3 ZIP first so it replaces the currently evaluated Manifest V2 package.
2. Under Settings, enter and verify the publisher contact email.
3. Complete the privacy-practices fields using the answers above.
4. Certify compliance with the Developer Program Policies.
5. Submit the updated package and disclosures for review.

## Store listing description

> Slava helps you read Russian text by adding stress marks, identifying grammatical forms, and showing definitions from your preferred Wiktionary editions.
>
> Read Russian with stress marks
>
> Open the Slava toolbar menu on a page containing Russian text, then enable Slava temporarily for the current tab or allow it to run automatically on that site. Slava annotates supported Russian words with stress marks, for example предложение becomes предложе́ние. Disable Slava at any time to restore the original page text.
>
> Stress marking, word-form analysis, lemma lookup, and grammar analysis run locally from verified indexes packaged with the extension. Slava avoids editable fields, form controls, code, hidden content, and selected text.
>
> Look up words in context
>
> Pause over an annotated word, click it, or use the keyboard to open its definition. Slava immediately shows locally available information while the online definition is loading, including the word's lemma and stress; its grammatical form and part of speech; gender, number, case, animacy, person, tense, and other available properties; verb aspect and corresponding perfective or imperfective forms; and definitions and source links from Wiktionary.
>
> Choose and order one or more definition languages from 21 supported Wiktionary editions. Slava tries them in your chosen order and uses English only when you select it. Definition availability and detail vary between editions.
>
> Control where Slava runs
>
> Enable temporarily on this site activates Slava for the current tab. Always enable on this site asks Chrome for access to that exact site. Disable on this site revokes persistent access for the current site. The settings page lists every site with persistent access and lets you revoke it.
>
> Privacy and security
>
> Slava has no advertising, analytics, telemetry, user account, or Slava-operated server. Page annotation and linguistic analysis happen locally. When you request a definition, Slava sends only the locally resolved Russian lemma to the selected Wikimedia Wiktionary API. It does not send the page URL, surrounding text, browsing history, cookies, credentials, or unrelated page content.
>
> The extension executes only packaged code. Wiktionary responses are origin-checked, size-bounded, parsed in an isolated extension document, reduced to text, and never executed as remote code.
>
> Limitations
>
> Russian stress and morphology can be ambiguous, incomplete, or context-dependent. Slava does not guarantee perfect linguistic disambiguation, definition availability, or support for every word or page. Review the displayed result in context.
>
> Slava is a non-commercial, open-source project with no paid or hidden features.

## Data-use disclosure

Stress and morphology lookup are local. A trusted 100 ms word hover or explicit definition lookup sends each locally resolved normalized lemma to the selected Wiktionary editions in order until one has a usable Russian entry; Wikimedia also receives the user's IP address and ordinary network metadata. Slava does not send page URLs, surrounding text, browsing history, cookies, credentials, analytics, or telemetry. Slava does not sell or use data for advertising and operates no definition or analytics service.
