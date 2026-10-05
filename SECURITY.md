# Security policy

Report a suspected vulnerability through [GitHub private vulnerability reporting](https://github.com/algattik/SlavaTranslator/security/advisories/new). Do not disclose exploit details, sensitive page content, credentials, or personal data in a public issue.

Include the affected Slava version, Chrome version, reproduction steps, impact, and the smallest safe proof. Reports about upstream Wiktionary content should distinguish a Slava parser or rendering defect from content hosted and controlled by Wikimedia.

Supported security fixes target the current Chrome Manifest V3 release line. The project does not promise absolute security or a response time, but it will not intentionally convert initialization, integrity, origin, content-type, parser, or package-policy failures into successful results.

Security boundaries include exact definition origins, credential-free requests, trusted explicit actions, replay and concurrency limits, bounded responses and timeouts, detached text-only parsing, verified packaged indexes, no remote executable code, package allowlisting, dependency review, CodeQL, and immutable workflow action pins.
