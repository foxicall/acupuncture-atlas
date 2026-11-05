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
    const headers = [...table.querySelectorAll('thead th')];
    const safetyIndex = headers.findIndex(header => /安全|禁忌|解剖注意/.test(header.textContent));
    if (safetyIndex >= 0) table.querySelectorAll('tbody tr').forEach(row => {
      const cell = row.querySelectorAll('td')[safetyIndex];
      if (cell && /氣胸|气胸|延髓|延腦|延脑|椎動脈|椎动脉|頸動脈|颈动脉|脊髓|肺臟|肺脏|不可深刺|禁深刺/.test(cell.textContent)) {
        const badge = document.createElement('strong'); badge.className = 'danger-badge'; badge.textContent = '危險深度／重要解剖';
        cell.prepend(badge, document.createElement('br')); cell.classList.add('clinical-warning');
      }
    });
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
