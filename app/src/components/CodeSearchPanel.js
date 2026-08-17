import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  search,
  setSearchQuery,
} from "@codemirror/search";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import "./CodeSearchPanel.css";

// Counting stops here so a pathological pattern on a large document can't stall
// the panel; the readout switches to "500+" instead.
const MATCH_SCAN_LIMIT = 500;

const apple =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || "");
const MOD = apple ? "⌘" : "Ctrl+";
const ALT = apple ? "⌥" : "Alt+";
const SHIFT = apple ? "⇧" : "Shift+";
const ENTER = apple ? "⏎" : "Enter";

function element(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? "" : String(value));
  }
  for (const child of [].concat(children)) node.append(child);
  return node;
}

function withTooltip(text, node) {
  return element("fig-tooltip", { text }, node);
}

function setDisabled(node, disabled) {
  if (disabled) node.setAttribute("disabled", "");
  else node.removeAttribute("disabled");
}

function matchInfo(state, query) {
  if (!query.search) return { kind: "empty" };
  if (!query.valid) return { kind: "invalid" };
  const cursor = query.getCursor(state);
  const selection = state.selection.main;
  let total = 0;
  let current = 0;
  let truncated = false;
  for (let step = cursor.next(); !step.done; step = cursor.next()) {
    total += 1;
    if (
      !current &&
      step.value.from === selection.from &&
      step.value.to === selection.to
    ) {
      current = total;
    }
    if (total >= MATCH_SCAN_LIMIT) {
      truncated = true;
      break;
    }
  }
  return { kind: total ? "matches" : "none", total, current, truncated };
}

function countText(info) {
  if (info.kind === "invalid") return "Bad pattern";
  if (info.kind === "none") return "No results";
  if (info.kind !== "matches") return "";
  const total = info.truncated ? `${info.total}+` : String(info.total);
  return info.current ? `${info.current}/${total}` : total;
}

function countLabel(info) {
  if (info.kind !== "matches") return countText(info);
  const total = info.truncated ? `more than ${info.total}` : info.total;
  if (info.current) return `Match ${info.current} of ${total}`;
  return `${total} ${info.total === 1 && !info.truncated ? "match" : "matches"}`;
}

// Reopening the panel starts a fresh instance with a query derived from the
// selection, so the replace text and row visibility are remembered here.
let rememberedReplace = "";
let rememberedReplaceOpen = false;

class CodeSearchPanel {
  constructor(view) {
    this.view = view;
    this.query = getSearchQuery(view.state);
    this.replaceOpen =
      !this.#readOnly() &&
      (Boolean(this.query.replace) || rememberedReplaceOpen);
    this.commit = this.commit.bind(this);

    this.searchInput = element("input", {
      class: "fig-search-input",
      type: "text",
      name: "search",
      form: "",
      placeholder: "Find",
      "aria-label": "Find",
      "main-field": "true",
      autocomplete: "off",
      autocorrect: "off",
      spellcheck: "false",
    });
    this.searchInput.value = this.query.search;

    this.replaceInput = element("input", {
      class: "fig-search-input",
      type: "text",
      name: "replace",
      form: "",
      placeholder: "Replace",
      "aria-label": "Replace",
      autocomplete: "off",
      autocorrect: "off",
      spellcheck: "false",
    });
    this.replaceInput.value = this.query.replace || rememberedReplace;

    this.count = element("span", { class: "fig-search-count" });
    this.caseFlag = this.#flag("Aa", "Match case");
    this.regexpFlag = this.#flag(".*", "Regular expression", "is-regexp");
    this.wordFlag = this.#flag("ab", "Whole word", "is-word");

    const adornments = element("span", { slot: "append" }, [
      this.count,
      element("span", { class: "fig-search-flags" }, [
        withTooltip("Match case", this.caseFlag),
        withTooltip("Regular expression", this.regexpFlag),
        withTooltip("Whole word", this.wordFlag),
      ]),
    ]);

    this.searchField = this.#field(this.searchInput, adornments);
    this.replaceField = this.#field(this.replaceInput);

    this.replaceToggle = element("fig-button", {
      class: "fig-search-replace-toggle",
      type: "toggle",
      variant: "ghost",
      icon: "",
      "aria-label": "Toggle replace",
      selected: this.replaceOpen ? "" : null,
    });
    this.replaceToggle.append(
      element("fig-icon", { name: "swap", color: "secondary" })
    );
    this.replaceToggle.addEventListener("click", () => {
      this.#setReplaceOpen(this.replaceToggle.hasAttribute("selected"));
      (this.replaceOpen ? this.replaceInput : this.searchInput).focus();
    });

    this.previousButton = this.#action({
      label: `Previous match (${SHIFT}${ENTER})`,
      ariaLabel: "Previous match",
      icon: "chevron",
      className: "fig-search-previous",
      run: findPrevious,
    });
    this.nextButton = this.#action({
      label: `Next match (${ENTER})`,
      ariaLabel: "Next match",
      icon: "chevron",
      className: "fig-search-next",
      run: findNext,
    });
    this.closeButton = this.#action({
      label: "Close (Esc)",
      ariaLabel: "Close find",
      icon: "close",
      run: closeSearchPanel,
      keepFocus: true,
    });
    this.replaceButton = this.#action({
      label: `Replace (${ENTER})`,
      text: "Replace",
      variant: "secondary",
      run: replaceNext,
    });
    this.replaceAllButton = this.#action({
      label: `Replace all (${MOD}${ENTER})`,
      text: "All",
      variant: "secondary",
      run: replaceAll,
    });

    this.replaceRow = element("div", { class: "fig-search-row" }, [
      this.replaceField,
      withTooltip(`Replace (${ENTER})`, this.replaceButton),
      withTooltip(`Replace all (${MOD}${ENTER})`, this.replaceAllButton),
    ]);

    this.dom = element("div", { class: "fig-search-panel" }, [
      withTooltip(`Toggle replace (${ALT}${MOD}F)`, this.replaceToggle),
      element("div", { class: "fig-search-rows" }, [
        element("div", { class: "fig-search-row" }, [
          this.searchField,
          withTooltip(`Previous match (${SHIFT}${ENTER})`, this.previousButton),
          withTooltip(`Next match (${ENTER})`, this.nextButton),
          withTooltip("Close (Esc)", this.closeButton),
        ]),
        this.replaceRow,
      ]),
    ]);
    this.dom.addEventListener("keydown", (event) => this.#keydown(event));

    this.setQuery(this.query);
    if (this.replaceOpen && !this.query.replace && rememberedReplace) {
      this.replaceField.value = rememberedReplace;
    }
  }

  #field(input, adornments) {
    const field = element("fig-input-text", {
      class: "fig-search-field",
      full: "",
      value: input.value,
    });
    field.append(input);
    if (adornments) field.append(adornments);
    field.addEventListener("input", this.commit);
    field.addEventListener("change", this.commit);
    return field;
  }

  #flag(glyph, label, modifier) {
    const button = element("button", {
      class: "fig-search-flag",
      type: "button",
      "aria-label": label,
      "aria-pressed": "false",
    });
    button.append(
      element(
        "span",
        { class: `fig-search-glyph${modifier ? ` ${modifier}` : ""}` },
        glyph
      )
    );
    button.addEventListener("click", () => {
      const pressed = button.getAttribute("aria-pressed") === "true";
      button.setAttribute("aria-pressed", pressed ? "false" : "true");
      this.commit();
      this.searchInput.focus();
    });
    return button;
  }

  #action({ label, ariaLabel, icon, text, variant, className, run, keepFocus }) {
    const button = element("fig-button", {
      class: className,
      variant: variant || "ghost",
      icon: icon ? "" : null,
      "aria-label": ariaLabel || label,
    });
    if (icon) {
      button.append(element("fig-icon", { name: icon, color: "secondary" }));
    } else {
      button.append(text);
    }
    button.addEventListener("click", () => {
      this.#run(run);
      if (!keepFocus) this.searchInput.focus();
    });
    return button;
  }

  // Commands read the query from editor state, so any text the user typed but
  // that hasn't been committed yet has to land there first.
  #run(command) {
    this.commit();
    command(this.view);
  }

  #setReplaceOpen(open) {
    this.replaceOpen = open;
    rememberedReplaceOpen = open;
    this.replaceRow.hidden = !open;
    if (open) this.replaceToggle.setAttribute("selected", "");
    else this.replaceToggle.removeAttribute("selected");
  }

  #keydown(event) {
    if (
      (event.key === "f" || event.key === "F") &&
      event.altKey &&
      (event.metaKey || event.ctrlKey)
    ) {
      event.preventDefault();
      this.#setReplaceOpen(!this.replaceOpen);
      (this.replaceOpen ? this.replaceInput : this.searchInput).focus();
      return;
    }
    if (runScopeHandlers(this.view, event, "search-panel")) {
      event.preventDefault();
      return;
    }
    if (event.key !== "Enter") return;
    if (event.target === this.searchInput) {
      event.preventDefault();
      this.#run(event.shiftKey ? findPrevious : findNext);
    } else if (event.target === this.replaceInput) {
      event.preventDefault();
      this.#run(event.metaKey || event.ctrlKey ? replaceAll : replaceNext);
    }
  }

  commit() {
    const query = new SearchQuery({
      search: this.searchInput.value,
      caseSensitive: this.caseFlag.getAttribute("aria-pressed") === "true",
      regexp: this.regexpFlag.getAttribute("aria-pressed") === "true",
      wholeWord: this.wordFlag.getAttribute("aria-pressed") === "true",
      replace: this.replaceInput.value,
    });
    rememberedReplace = query.replace;
    if (!query.eq(this.query)) {
      this.query = query;
      this.view.dispatch({ effects: setSearchQuery.of(query) });
    }
    this.#refresh();
  }

  setQuery(query) {
    this.query = query;
    this.searchField.value = query.search;
    this.replaceField.value = query.replace;
    this.searchInput.value = query.search;
    this.replaceInput.value = query.replace;
    this.caseFlag.setAttribute("aria-pressed", String(query.caseSensitive));
    this.regexpFlag.setAttribute("aria-pressed", String(query.regexp));
    this.wordFlag.setAttribute("aria-pressed", String(query.wholeWord));
    if (query.replace && !this.replaceOpen) this.#setReplaceOpen(true);
    else this.#setReplaceOpen(this.replaceOpen);
    this.#refresh();
  }

  #readOnly() {
    const { state } = this.view;
    return state.readOnly || state.facet(EditorView.editable) === false;
  }

  #refresh() {
    const readOnly = this.#readOnly();
    this.dom.dataset.readonly = String(readOnly);
    if (readOnly && this.replaceOpen) this.#setReplaceOpen(false);

    const info = matchInfo(this.view.state, this.query);
    const text = countText(info);
    const label = countLabel(info);
    this.count.textContent = text;
    this.count.dataset.state = info.kind;
    this.count.title = label;
    this.searchInput.setAttribute(
      "aria-invalid",
      info.kind === "invalid" ? "true" : "false"
    );

    const noMatches = info.kind !== "matches";
    setDisabled(this.previousButton, noMatches);
    setDisabled(this.nextButton, noMatches);
    setDisabled(this.replaceButton, noMatches || readOnly);
    setDisabled(this.replaceAllButton, noMatches || readOnly);
    setDisabled(this.replaceToggle, readOnly);
  }

  update(update) {
    let queryChanged = false;
    for (const transaction of update.transactions) {
      for (const effect of transaction.effects) {
        if (effect.is(setSearchQuery) && !effect.value.eq(this.query)) {
          this.setQuery(effect.value);
          queryChanged = true;
        }
      }
    }
    if (!queryChanged && (update.docChanged || update.selectionSet)) {
      this.#refresh();
    }
  }

  mount() {
    this.searchInput.select();
  }

  get top() {
    return true;
  }
}

const searchTheme = EditorView.theme({
  ".cm-panels": {
    color: "var(--figma-color-text)",
    backgroundColor: "var(--figma-color-bg)",
    fontFamily: "var(--font-family)",
    fontSize: "var(--body-medium-fontSize)",
  },
  ".cm-panels-top": {
    borderBottom: "1px solid var(--figma-color-border)",
  },
  ".cm-panels-bottom": {
    borderTop: "1px solid var(--figma-color-border)",
  },
  ".cm-searchMatch": {
    borderRadius: "2px",
    backgroundColor:
      "color-mix(in srgb, var(--figma-color-border-selected) 22%, transparent)",
  },
  ".cm-searchMatch-selected": {
    backgroundColor:
      "color-mix(in srgb, var(--figma-color-border-selected) 50%, transparent)",
    outline: "1px solid var(--figma-color-border-selected-strong)",
  },
  ".cm-selectionMatch": {
    borderRadius: "2px",
    backgroundColor: "color-mix(in srgb, var(--figma-color-text) 12%, transparent)",
  },
});

export const codeSearch = [
  search({ top: true, createPanel: (view) => new CodeSearchPanel(view) }),
  searchTheme,
];
