import '@testing-library/jest-dom';

// jsdom does not implement scrollIntoView. The on-screen keyboard scrolls the
// focused field into view when it appears; tests need a no-op stub.
if (typeof window.Element !== 'undefined' && !window.Element.prototype.scrollIntoView) {
  window.Element.prototype.scrollIntoView = () => {};
}
