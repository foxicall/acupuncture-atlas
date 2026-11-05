import { marked } from 'marked';
import DOMPurify from 'dompurify';

const modules = import.meta.glob('../../docs/**/*.md', { query: '?raw', import: 'default', eager: true });
export const documents = Object.entries(modules).map(([path, markdown]) => ({
  path: path.replace('../../', ''),
  title: markdown.match(/^#\s+(.+)$/m)?.[1] || path.split('/').pop().replace(/\.md$/, ''),
  markdown,
})).sort((a, b) => a.path.localeCompare(b.path, 'zh-Hant', { numeric: true }));
const byPath = new Map(documents.map(doc => [doc.path, doc]));
export const getDocument = path => byPath.get(path);
export const normalize = value => value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '');
export function renderMarkdown(markdown) {
  const html = DOMPurify.sanitize(marked.parse(markdown, { gfm: true, breaks: false }), {
    USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'iframe', 'form', 'input'],
    FORBID_ATTR: ['style'],
  });
  const template = document.createElement('template');
  template.innerHTML = html;
  // The course is text-only; retain link text without navigating away from the offline app.
  template.content.querySelectorAll('a').forEach(a => {
    const href = a.getAttribute('href') || '';
    if (/^https?:\/\//i.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    else if (!href.startsWith('#')) a.removeAttribute('href');
  });
  template.content.querySelectorAll('table').forEach(table => {
    const wrapper = document.createElement('div');
    wrapper.className = 'markdown-table-scroll';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', '教材表格，可左右捲動');
    table.replaceWith(wrapper); wrapper.append(table);
  });
  return template.innerHTML;
}
export function text(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
