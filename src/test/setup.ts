import "@testing-library/jest-dom/vitest";

// jsdom does not implement scrollTo on elements.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}
