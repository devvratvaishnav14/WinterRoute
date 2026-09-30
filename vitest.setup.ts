// Global test setup. jsdom (used via `// @vitest-environment jsdom` in
// individual component test files) doesn't implement `window.matchMedia`,
// which several components read for `prefers-reduced-motion`. Polyfilled
// here once, project-wide, rather than duplicated per test file. Runs for
// every test file (including plain "node" environment ones), so it's
// guarded to a no-op when `window` doesn't exist at all.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
