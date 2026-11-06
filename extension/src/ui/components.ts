// ============================================================
// NEXORA UI Component Helpers
// ============================================================

/** Create an element with attributes and children */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | null> = {},
  ...children: (HTMLElement | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const elem = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (val === null || val === false) continue;
    if (val === true) elem.setAttribute(key, '');
    else elem.setAttribute(key, val);
  }
  for (const child of children) {
    if (!child) continue;
    if (typeof child === 'string') elem.appendChild(document.createTextNode(child));
    else elem.appendChild(child);
  }
  return elem;
}

/** Show/hide an element */
export function show(elem: HTMLElement, visible = true): void {
  elem.style.display = visible ? '' : 'none';
}

/** Set text content safely */
export function setText(elem: HTMLElement | null, text: string): void {
  if (elem) elem.textContent = text;
}

/** Show an error message in a container */
export function showError(container: HTMLElement, message: string): void {
  container.innerHTML = '';
  const div = el('div', { class: 'error-state' }, message);
  container.appendChild(div);
}

/** Show a spinner */
export function showSpinner(container: HTMLElement): void {
  container.innerHTML = '<div class="spinner"></div>';
}

/** Create a badge element */
export function badge(text: string, variant: 'success' | 'error' | 'warning' | 'info' | 'neutral'): HTMLElement {
  return el('span', { class: `badge badge-${variant}` }, text);
}

/** Create a copy-to-clipboard button */
export function copyBtn(text: string): HTMLButtonElement {
  const btn = el('button', { class: 'btn btn-sm btn-secondary', title: 'Copy to clipboard' }, '⎘ Copy');
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = '✓ Copied';
      setTimeout(() => { btn.textContent = '⎘ Copy'; }, 1500);
    } catch {
      btn.textContent = 'Failed';
      setTimeout(() => { btn.textContent = '⎘ Copy'; }, 1500);
    }
  });
  return btn;
}

/** Format a date for display */
export function formatDate(date: Date | string | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Debounce a function */
export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}
