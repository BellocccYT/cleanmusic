'use strict';

const toggle = document.querySelector('.theme-toggle');
if (toggle) {
  toggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    toggle.setAttribute('aria-pressed', String(next === 'light'));
    toggle.setAttribute('aria-label', next === 'dark' ? 'Zu hellem Farbschema wechseln' : 'Zu dunklem Farbschema wechseln');
  });
}
