import { h, clear, append } from '../dom.js';
import { api, query } from '../api.js';
import { pageHead, panel, table, showError } from '../ui.js';
import { date } from '../format.js';

export async function render(page, params) {
  const results = h('div');
  const search = h('input', { type: 'search', value: params.q || '', placeholder: 'Name, phone or ID number', 'aria-label': 'Search guests', style: { width: '300px' } });

  async function load() {
    try {
      const guests = await api.get(`/api/guests?${query({ q: search.value.trim() })}`);
      append(clear(results), table([
        { title: 'Guest', value: (g) => h('strong', {}, g.fullName) },
        { title: 'Phone', value: (g) => g.phone },
        { title: 'City', value: (g) => g.city || '—' },
        { title: 'Photo ID', value: (g) => (g.idType ? `${g.idType} · ${g.idNumber}` : '—') },
        { title: 'ID copy', value: (g) => (g.hasIdPhoto ? 'On file' : '—') },
        { title: 'Stays', num: true, value: (g) => g.stayCount },
        { title: 'Since', value: (g) => date(g.createdAt.slice(0, 10)) }
      ], guests, { onRowClick: (g) => { location.hash = `#/guest/${g.id}`; }, empty: 'No guests found.' }));
    } catch (err) {
      showError(err);
    }
  }

  let timer;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(load, 250);
  });
  append(clear(page), 
    pageHead('Guests', { lede: 'Everyone who has booked or stayed. Search by name, phone or ID number.' }),
    panel('Guest list', { tools: search, flush: true }, results));
  await load();
  search.focus();
}

