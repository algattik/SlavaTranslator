import {
  DEFINITION_CONTRACT_VERSION,
  DEFINITION_EDITIONS,
  getWiktionaryOrigin,
  type DefinitionFailure,
  type DefinitionResult,
} from "../contracts/definition";
import type { RuntimeRequest, RuntimeResponse } from "../contracts/messages";
import type { GrammarTag, LemmaCandidate } from "../contracts/local-index";
import { normalizeStressForm } from "../indexes/stress-fsa";
import {
  aspectLabel,
  definitionErrorMessage,
  grammarLabel,
  localeDirection,
  message,
  resolveUiLocale,
  type UiLocale,
} from "../i18n/catalog";
import type { Settings } from "../settings/settings";

export interface DefinitionPopupDependencies {
  sendMessage(request: RuntimeRequest): Promise<RuntimeResponse | undefined>;
  createRequestId(): string;
}

type PopupPresentation =
  { kind: "dialog" } | { kind: "hover"; anchor: HTMLElement };

interface LemmaDefinition {
  candidate: LemmaCandidate;
  result: DefinitionResult;
}

interface LemmaFailure {
  lemma: string;
  failure: DefinitionFailure;
}

const LEMMA_SPECIFIC_FAILURES = new Set<DefinitionFailure["code"]>([
  "missing",
  "no-russian-entry",
]);

function isCyrillicToken(value: string): boolean {
  return /^[\p{Script=Cyrillic}\p{Mark}]+(?:[-'’][\p{Script=Cyrillic}\p{Mark}]+)*$/u.test(
    value.normalize("NFC").trim(),
  );
}

function editDistance(left: string, right: string): number {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      current.push(
        Math.min(
          (current[rightIndex] ?? 0) + 1,
          (previous[rightIndex + 1] ?? 0) + 1,
          (previous[rightIndex] ?? 0) +
            (left[leftIndex] === right[rightIndex] ? 0 : 1),
        ),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? 0;
}

function rankLemmaCandidates(
  surfaceForm: string,
  candidates: LemmaCandidate[],
): LemmaCandidate[] {
  const normalizedSurface = normalizeStressForm(surfaceForm);
  const surfaceStartsUppercase =
    surfaceForm[0] !== surfaceForm[0]?.toLocaleLowerCase("ru");
  return [...candidates].sort((left, right) => {
    const leftDistance = editDistance(
      normalizedSurface,
      normalizeStressForm(left.lemma),
    );
    const rightDistance = editDistance(
      normalizedSurface,
      normalizeStressForm(right.lemma),
    );
    const leftCasePenalty =
      (left.lemma[0] !== left.lemma[0]?.toLocaleLowerCase("ru")) ===
      surfaceStartsUppercase
        ? 0
        : 1;
    const rightCasePenalty =
      (right.lemma[0] !== right.lemma[0]?.toLocaleLowerCase("ru")) ===
      surfaceStartsUppercase
        ? 0
        : 1;
    return (
      leftDistance - rightDistance ||
      leftCasePenalty - rightCasePenalty ||
      left.lemma.localeCompare(right.lemma, "ru")
    );
  });
}

export class DefinitionPopupController {
  private host: HTMLElement | null = null;
  private readonly activeRequestIds = new Set<string>();
  private generation = 0;
  private hoverCloseTimer: number | null = null;
  private presentation: PopupPresentation | null = null;
  private returnFocus: HTMLElement | null = null;
  private settings: Settings | null = null;
  private locale: UiLocale = "en";
  private readonly handleDocumentKeydown = (event: KeyboardEvent) => {
    if (!event.isTrusted || this.host === null) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      return;
    }
  };

  constructor(
    private readonly document: Document,
    private readonly dependencies: DefinitionPopupDependencies,
  ) {
    this.document.addEventListener("keydown", this.handleDocumentKeydown);
  }

  async open(token: string | null): Promise<void> {
    await this.openWithPresentation(token, { kind: "dialog" });
  }

  async openHover(token: string, anchor: HTMLElement): Promise<void> {
    this.cancelHoverClose();
    await this.openWithPresentation(token, { kind: "hover", anchor });
  }

  scheduleHoverClose(): void {
    if (this.presentation?.kind !== "hover") {
      return;
    }
    this.cancelHoverClose();
    this.hoverCloseTimer = window.setTimeout(() => {
      this.hoverCloseTimer = null;
      if (this.presentation?.kind === "hover") {
        this.close();
      }
    }, 150);
  }

  cancelHoverClose(): void {
    if (this.hoverCloseTimer !== null) {
      window.clearTimeout(this.hoverCloseTimer);
      this.hoverCloseTimer = null;
    }
  }

  close(): void {
    this.cancelHoverClose();
    const shouldReturnFocus = this.presentation?.kind === "dialog";
    this.presentation = null;
    this.generation += 1;
    for (const requestId of this.activeRequestIds) {
      void this.dependencies.sendMessage({
        kind: "definition.cancel",
        requestId,
      });
    }
    this.activeRequestIds.clear();
    this.host?.remove();
    this.host = null;
    if (shouldReturnFocus) {
      this.returnFocus?.focus({ preventScroll: true });
    }
    this.returnFocus = null;
  }

  deactivate(): void {
    this.close();
    this.document.removeEventListener("keydown", this.handleDocumentKeydown);
  }

  private async openWithPresentation(
    token: string | null,
    presentation: PopupPresentation,
  ): Promise<void> {
    this.close();
    const generation = ++this.generation;
    this.presentation = presentation;
    this.returnFocus =
      presentation.kind === "dialog" &&
      this.document.activeElement instanceof HTMLElement
        ? this.document.activeElement
        : null;
    this.settings = await this.loadSettings();
    this.locale = resolveUiLocale(
      this.settings.interfaceLocale,
      browser.i18n.getUILanguage(),
    );
    if (generation !== this.generation) {
      return;
    }
    const normalizedToken =
      token !== null && isCyrillicToken(token)
        ? token.normalize("NFC").trim()
        : null;
    const root = this.createDialog(presentation, normalizedToken);
    if (token === null || !isCyrillicToken(token)) {
      this.renderSearch(root);
      return;
    }
    await this.resolveToken(root, normalizedToken ?? token);
  }

  private async loadSettings(): Promise<Settings> {
    const response = await this.dependencies.sendMessage({
      kind: "settings.get",
      requestId: this.dependencies.createRequestId(),
    });
    if (response?.kind !== "settings.result") {
      throw new Error("Settings are unavailable");
    }
    return response.settings;
  }

  private createDialog(
    presentation: PopupPresentation,
    surfaceForm: string | null,
  ): ShadowRoot {
    const host = this.document.createElement("div");
    host.setAttribute("data-slava-root", "");
    host.dataset.presentation = presentation.kind;
    host.dataset.fontScale = this.settings?.accessibility.fontScale ?? "medium";
    host.dataset.highContrast = String(
      this.settings?.accessibility.highContrast ?? false,
    );
    host.dataset.reducedMotion = String(
      this.settings?.accessibility.reducedMotion ?? false,
    );
    host.lang = this.locale;
    host.dir = localeDirection(this.locale);
    const shadow = host.attachShadow({ mode: "open" });
    const style = this.document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      :host { --slava-font-size: 1rem; }
      :host([data-font-scale="small"]) { --slava-font-size: .875rem; }
      :host([data-font-scale="large"]) { --slava-font-size: 1.25rem; }
      .backdrop { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 1rem; background: rgb(0 0 0 / 45%); font: var(--slava-font-size)/1.5 system-ui, sans-serif; color: #161616; }
      .dialog { width: min(32rem, 100%); max-height: min(80vh, 48rem); overflow: auto; box-sizing: border-box; padding: .75rem 1rem; border: 1px solid rgb(0 0 0 / 20%); border-radius: .35rem; background: #fff; box-shadow: 0 .35rem 1rem rgb(0 0 0 / 22%); }
      .header { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
      h2, h3, h4 { margin: 0 0 .45rem; line-height: 1.3; }
      h2 { font-size: 1.1rem; font-weight: 600; }
      h3 { margin-top: .65rem; font-size: 1rem; }
      h4 { margin-top: .5rem; font-size: .9rem; font-variant: small-caps; }
      p, ol { margin: .35rem 0; }
      ol { padding-inline-start: 1.4rem; }
      a { color: #0645ad; }
      button, input { box-sizing: border-box; min-height: 2.75rem; font: inherit; }
      button { border: 2px solid #174ea6; border-radius: .25rem; padding: .4rem .75rem; color: #fff; background: #174ea6; cursor: pointer; }
      button:focus-visible, input:focus-visible, a:focus-visible { outline: 3px solid #ffbf47; outline-offset: 2px; }
      .close { min-width: 2rem; min-height: 2rem; border: 0; padding: 0; color: #666; background: transparent; font-size: 1.35rem; line-height: 1; }
      .candidate { display: block; width: 100%; margin: .5rem 0; text-align: left; }
      .focus-sentinel { position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
      form { display: grid; gap: .75rem; }
      input { width: 100%; border: 2px solid #555; padding: .5rem; }
      .meta { color: #666; font-size: .85rem; }
      .fallback { display: inline-block; margin: 0 0 .35rem; color: #666; font-size: .8rem; }
      :host([data-high-contrast="true"]) .dialog { border-width: 4px; color: #000; }
      :host([data-high-contrast="true"]) button { border-color: #000; background: #000; }
      :host([data-reduced-motion="true"]) * { scroll-behavior: auto !important; transition: none !important; animation: none !important; }
      :host([data-presentation="hover"]) .backdrop { inset: 0; display: block; padding: 0; background: none; pointer-events: none; }
      :host([data-presentation="hover"]) .dialog { position: fixed; z-index: 2147483647; width: min(30rem, calc(100vw - 1rem)); max-height: min(70vh, 36rem); padding: 1rem; pointer-events: auto; }
      :host([data-presentation="hover"]) .focus-sentinel { display: none; }
      @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
    `;
    const backdrop = this.document.createElement("div");
    backdrop.className = "backdrop";
    const dialog = this.document.createElement("section");
    dialog.className = "dialog";
    dialog.setAttribute("role", "dialog");
    if (presentation.kind === "dialog") {
      dialog.setAttribute("aria-modal", "true");
    }
    dialog.setAttribute("aria-labelledby", "slava-title");
    const header = this.document.createElement("div");
    header.className = "header";
    const title = this.document.createElement("h2");
    title.id = "slava-title";
    if (surfaceForm !== null) {
      title.dir = "auto";
    }
    title.textContent =
      surfaceForm ?? message(this.locale, "russianDefinition");
    const close = this.document.createElement("button");
    close.className = "close";
    close.type = "button";
    close.setAttribute("aria-label", message(this.locale, "closeDefinition"));
    close.textContent = "×";
    close.addEventListener("click", (event) => {
      if (event.isTrusted) {
        this.close();
      }
    });
    const before = this.document.createElement("span");
    const after = this.document.createElement("span");
    for (const sentinel of [before, after]) {
      sentinel.className = "focus-sentinel";
      sentinel.tabIndex = 0;
      sentinel.setAttribute("aria-hidden", "true");
    }
    const focusable = () => [
      ...dialog.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), a[href]",
      ),
    ];
    before.addEventListener("focus", () => focusable().at(-1)?.focus());
    after.addEventListener("focus", () => focusable()[0]?.focus());
    header.append(title, close);
    dialog.append(header);
    backdrop.append(before, dialog, after);
    shadow.append(style, backdrop);
    this.document.body.append(host);
    this.host = host;
    if (presentation.kind === "hover") {
      host.addEventListener("pointerenter", () => this.cancelHoverClose());
      host.addEventListener("pointerleave", () => this.scheduleHoverClose());
      this.positionHoverCard(dialog, presentation.anchor);
    } else {
      close.focus();
    }
    return shadow;
  }

  private positionHoverCard(dialog: HTMLElement, anchor: HTMLElement): void {
    const margin = 8;
    const anchorBounds = anchor.getBoundingClientRect();
    const dialogBounds = dialog.getBoundingClientRect();
    const left = Math.min(
      Math.max(margin, anchorBounds.left),
      Math.max(margin, window.innerWidth - dialogBounds.width - margin),
    );
    const below = anchorBounds.bottom + margin;
    const top =
      below + dialogBounds.height <= window.innerHeight - margin
        ? below
        : Math.max(margin, anchorBounds.top - dialogBounds.height - margin);
    dialog.style.left = `${left}px`;
    dialog.style.top = `${top}px`;
  }

  private renderSearch(root: ShadowRoot): void {
    const dialog = root.querySelector(".dialog");
    if (!(dialog instanceof HTMLElement)) {
      return;
    }
    const form = this.document.createElement("form");
    const label = this.document.createElement("label");
    label.htmlFor = "slava-search";
    label.textContent = message(this.locale, "russianWord");
    const input = this.document.createElement("input");
    input.id = "slava-search";
    input.required = true;
    input.autocomplete = "off";
    input.spellcheck = false;
    const submit = this.document.createElement("button");
    submit.type = "submit";
    submit.textContent = message(this.locale, "lookUp");
    form.append(label, input, submit);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (event.isTrusted && isCyrillicToken(input.value)) {
        void this.resolveToken(root, input.value.normalize("NFC").trim());
      }
    });
    dialog.append(form);
    input.focus();
  }

  private async resolveToken(root: ShadowRoot, token: string): Promise<void> {
    const generation = this.generation;
    this.renderStatus(root, message(this.locale, "findingLemmas", { token }));
    const response = await this.dependencies.sendMessage({
      kind: "local.lookup",
      requestId: this.dependencies.createRequestId(),
      token,
    });
    if (generation !== this.generation || response?.kind !== "local.result") {
      return;
    }
    const candidates = rankLemmaCandidates(token, [
      ...new Map(
        response.morphology.candidates.map((candidate) => [
          candidate.lemma,
          candidate,
        ]),
      ).values(),
    ]);
    await this.lookupDefinitions(
      root,
      token,
      candidates.length === 0
        ? [{ lemma: token, source: "surface-form" }]
        : candidates,
    );
  }

  private async lookupDefinitions(
    root: ShadowRoot,
    surfaceForm: string,
    candidates: LemmaCandidate[],
  ): Promise<void> {
    const generation = ++this.generation;
    const definitions: LemmaDefinition[] = [];
    const failures: LemmaFailure[] = [];
    let stop = false;
    this.renderLocalCandidates(
      root,
      surfaceForm,
      candidates,
      message(this.locale, "loadingDefinition"),
    );
    for (
      let candidateIndex = 0;
      candidateIndex < candidates.length && !stop;
      candidateIndex += 2
    ) {
      const batch = candidates.slice(candidateIndex, candidateIndex + 2);
      const outcomes = await Promise.all(
        batch.map(async (candidate) => {
          const requestId = this.dependencies.createRequestId();
          this.activeRequestIds.add(requestId);
          try {
            const response = await this.dependencies.sendMessage({
              kind: "definition.lookup",
              payload: {
                contractVersion: DEFINITION_CONTRACT_VERSION,
                requestId,
                lemma: candidate.lemma,
                editions: this.settings?.definitionEditions ?? ["en"],
              },
            });
            return { candidate, requestId, response };
          } finally {
            this.activeRequestIds.delete(requestId);
          }
        }),
      );
      if (generation !== this.generation) {
        return;
      }
      for (const { candidate, requestId, response } of outcomes) {
        const { lemma } = candidate;
        if (response?.kind !== "definition.result") {
          failures.push({
            lemma,
            failure: {
              contractVersion: DEFINITION_CONTRACT_VERSION,
              requestId,
              code: "invalid-response",
            },
          });
          stop = true;
          break;
        } else if ("code" in response.payload) {
          failures.push({ lemma, failure: response.payload });
          if (!LEMMA_SPECIFIC_FAILURES.has(response.payload.code)) {
            stop = true;
            break;
          }
        } else {
          definitions.push({ candidate, result: response.payload });
          this.renderDefinitions(root, surfaceForm, definitions, failures);
        }
      }
    }
    if (definitions.length === 0) {
      const failure =
        failures[0]?.failure ??
        ({
          contractVersion: DEFINITION_CONTRACT_VERSION,
          requestId: this.dependencies.createRequestId(),
          code: "missing",
        } satisfies DefinitionFailure);
      const suffix =
        failure.code === "throttled" && failure.retryAfterSeconds !== undefined
          ? ` ${message(this.locale, "retryAfter", {
              seconds: failure.retryAfterSeconds,
            })}`
          : "";
      this.renderLocalCandidates(
        root,
        surfaceForm,
        candidates,
        `${definitionErrorMessage(this.locale, failure.code)}${suffix}`,
      );
      return;
    }
    this.renderDefinitions(root, surfaceForm, definitions, failures);
  }

  private resetContent(root: ShadowRoot): HTMLElement {
    const dialog = root.querySelector(".dialog");
    if (!(dialog instanceof HTMLElement)) {
      throw new Error("Definition dialog is unavailable");
    }
    for (const child of [...dialog.children].slice(1)) {
      child.remove();
    }
    return dialog;
  }

  private renderStatus(root: ShadowRoot, message: string): void {
    const dialog = this.resetContent(root);
    const status = this.document.createElement("p");
    status.setAttribute("role", "status");
    status.textContent = message;
    dialog.append(status);
    if (this.presentation?.kind === "hover") {
      this.positionHoverCard(dialog, this.presentation.anchor);
    }
  }

  private renderLocalCandidates(
    root: ShadowRoot,
    surfaceForm: string,
    candidates: LemmaCandidate[],
    statusText: string,
  ): void {
    const dialog = this.resetContent(root);
    const title = dialog.querySelector("#slava-title");
    if (title !== null) {
      title.textContent = surfaceForm;
    }
    for (const candidate of candidates) {
      const lemmaHeading = this.document.createElement("h3");
      lemmaHeading.dir = "auto";
      lemmaHeading.textContent = candidate.lemma;
      dialog.append(lemmaHeading);
      this.renderGrammar(dialog, candidate);
      this.renderAspect(dialog, candidate);
    }
    const status = this.document.createElement("p");
    status.className = "meta";
    status.setAttribute("role", "status");
    status.textContent = statusText;
    dialog.append(status);
    if (this.presentation?.kind === "hover") {
      this.positionHoverCard(dialog, this.presentation.anchor);
    }
  }

  private renderDefinitions(
    root: ShadowRoot,
    surfaceForm: string,
    definitions: LemmaDefinition[],
    failures: LemmaFailure[],
  ): void {
    const dialog = this.resetContent(root);
    const title = dialog.querySelector("#slava-title");
    if (title !== null) {
      title.textContent = surfaceForm;
    }
    for (const { candidate, result } of definitions) {
      const { lemma } = candidate;
      const lemmaHeading = this.document.createElement("h3");
      lemmaHeading.dir = "auto";
      const source = this.createSourceLink(result, lemma);
      if (source === null) {
        this.renderStatus(root, message(this.locale, "invalidSource"));
        return;
      }
      lemmaHeading.append(source);
      dialog.append(lemmaHeading);
      this.renderGrammar(dialog, candidate);
      this.renderAspect(dialog, candidate);
      if (result.fallbackUsed) {
        const fallback = this.document.createElement("span");
        fallback.className = "fallback";
        const displayNames = new Intl.DisplayNames([this.locale], {
          type: "language",
        });
        fallback.textContent = message(this.locale, "fallbackEdition", {
          language:
            displayNames.of(result.resolvedEdition) ?? result.resolvedEdition,
        });
        dialog.append(fallback);
      }

      for (const entry of result.entries) {
        if (entry.partOfSpeech !== null) {
          const heading = this.document.createElement("h4");
          heading.dir = "auto";
          heading.textContent = entry.partOfSpeech;
          dialog.append(heading);
        }
        const list = this.document.createElement("ol");
        list.dir = "auto";
        for (const sense of entry.senses) {
          const item = this.document.createElement("li");
          item.dir = "auto";
          item.textContent = sense;
          list.append(item);
        }
        dialog.append(list);
      }
    }
    for (const { lemma, failure } of failures) {
      const note = this.document.createElement("p");
      note.className = "meta";
      note.textContent = `${lemma}: ${definitionErrorMessage(
        this.locale,
        failure.code,
      )}`;
      dialog.append(note);
    }
    if (this.presentation?.kind === "hover") {
      this.positionHoverCard(dialog, this.presentation.anchor);
    }
  }

  private renderGrammar(dialog: HTMLElement, candidate: LemmaCandidate): void {
    const analyses = candidate.grammaticalAnalyses ?? [];
    if (analyses.length === 0) {
      return;
    }
    const grammar = this.document.createElement("p");
    grammar.className = "meta";
    grammar.textContent = `${message(this.locale, "form")}: ${analyses
      .map((analysis) => this.formatGrammarAnalysis(analysis))
      .join("; ")}`;
    dialog.append(grammar);
  }

  private formatGrammarAnalysis(analysis: GrammarTag[]): string {
    const description = analysis
      .map((tag) => grammarLabel(this.locale, tag))
      .join(" ");
    return `${description.charAt(0).toLocaleUpperCase(this.locale)}${description.slice(1)}`;
  }

  private renderAspect(dialog: HTMLElement, candidate: LemmaCandidate): void {
    if (candidate.aspect === undefined) {
      return;
    }
    const aspect = this.document.createElement("p");
    aspect.className = "meta";
    aspect.append(aspectLabel(this.locale, candidate.aspect));
    const counterparts = candidate.aspectCounterparts ?? [];
    if (counterparts.length > 0 && candidate.aspect !== "biaspectual") {
      aspect.append(
        ` · ${aspectLabel(
          this.locale,
          candidate.aspect === "imperfective" ? "perfective" : "imperfective",
        )}: `,
      );
      counterparts.forEach((counterpart, index) => {
        if (index > 0) {
          aspect.append(", ");
        }
        const link = this.document.createElement("a");
        const edition = this.settings?.definitionEditions[0] ?? "en";
        link.href = `${getWiktionaryOrigin(edition)}/wiki/${encodeURIComponent(counterpart)}`;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = counterpart;
        aspect.append(link);
      });
    }
    dialog.append(aspect);
  }

  private createSourceLink(
    result: DefinitionResult,
    label: string,
  ): HTMLAnchorElement | null {
    const sourceUrl = new URL(result.sourceUrl);
    if (
      sourceUrl.protocol !== "https:" ||
      !DEFINITION_EDITIONS.some(
        (edition) => sourceUrl.origin === getWiktionaryOrigin(edition),
      )
    ) {
      return null;
    }
    const source = this.document.createElement("a");
    source.href = sourceUrl.href;
    source.target = "_blank";
    source.rel = "noreferrer";
    source.textContent = label;
    source.title = message(this.locale, "openOnWiktionary", {
      title: result.resolvedTitle,
    });
    return source;
  }
}
