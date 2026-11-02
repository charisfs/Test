// Small DOM helpers.
import { COLORS, CATEGORIES } from './data.js';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

let toastTimer;
export function toast(msg, ms = 2600) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

export function openSheet(title, body, { onClose } = {}) {
  const d = document.getElementById('sheet');
  d.replaceChildren(
    h('div', { class: 'sheet-head' },
      h('div', { class: 'grabber' }),
      h('h2', {}, title),
      h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => closeSheet() }, '✕')),
    h('div', { class: 'sheet-body' }, body)
  );
  d.onclose = () => onClose && onClose();
  if (!d.open) d.showModal();
  d.querySelector('.sheet-body').scrollTop = 0;
}
export function closeSheet() {
  const d = document.getElementById('sheet');
  if (d.open) d.close();
}

const GLYPH = {
  top: 'M8 3 4 6l2 4 2-1v12h8V9l2 1 2-4-4-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3Z',
  bottom: 'M7 3h10l1 18h-4l-2-11-2 11H6L7 3Z',
  dress: 'M9 3h6l-1 5 4 13H6l4-13-1-5Z',
  outerwear: 'M8 3 3 7v14h5V12l4 9 4-9v9h5V7l-5-4-4 6-4-6Z',
  shoes: 'M3 17v-5l5-1 3 3 9 1c1 0 1 2 1 2v1H3Z',
  accessory: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 3v5l3 2',
  bag: 'M5 8h14l-1 13H6L5 8Zm4 0V6a3 3 0 0 1 6 0v2',
};

export function swatchBg(color) {
  const c = COLORS[color];
  return c ? c.hex : '#ccc';
}

/** Photo thumbnail, or a coloured garment silhouette if there's no photo. */
export function thumb(item, cls = '') {
  if (item.photo) return h('div', { class: `thumb ${cls}` }, h('img', { src: item.photo, alt: item.name || '', loading: 'lazy' }));
  const bg = swatchBg(item.color);
  const light = ['white', 'cream', 'beige', 'yellow', 'lightblue', 'khaki', 'pink'].includes(item.color);
  return h('div', { class: `thumb ph ${cls}`, title: item.name || '' },
    h('div', { class: 'ph-bg', style: { background: bg } }),
    h('span', { class: 'ph-glyph', html: `<svg viewBox="0 0 24 24" class="${light ? 'dark' : ''}"><path d="${GLYPH[item.category] || GLYPH.top}"/></svg>` }));
}

export function catLabel(cat) {
  return CATEGORIES[cat] ? CATEGORIES[cat].one : cat;
}

/** Resize a photo from the camera roll to keep storage small. */
export function resizeImage(file, max = 640, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });
}

export function segmented(options, value, onChange) {
  const wrap = h('div', { class: 'segmented', role: 'radiogroup' });
  for (const [val, label] of options) {
    wrap.append(h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(val === value), class: val === value ? 'on' : '',
      onclick: () => {
        wrap.querySelectorAll('button').forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-checked', 'false'); });
        const b = wrap.querySelector(`[data-v="${CSS.escape(val)}"]`);
        b.classList.add('on'); b.setAttribute('aria-checked', 'true');
        onChange(val);
      },
      'data-v': val,
    }, label));
  }
  return wrap;
}

export function spinner(text = 'Working…') {
  return h('div', { class: 'loading' }, h('span', { class: 'spin' }), text);
}

export const fmtDate = (iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(iso + 'T12:00:00').toLocaleDateString(undefined, opts);
