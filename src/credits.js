// Credits dialog, shared by the start screen and the control panel.
import { t } from './i18n.js';

export const REPO_URL = 'https://github.com/Happyuky7/Black-Hole-Web-Interstellar-Style';
export const AUTHOR_URL = 'https://happyuky7.com/';

const SECTIONS = ['science', 'physics', 'software', 'music', 'film', 'sky'];
let dialog = null;

function link(href, text){
  const a = document.createElement('a');
  a.href = href; a.textContent = text;
  a.target = '_blank'; a.rel = 'noopener';
  return a;
}

function section(title, ...content){
  const sec = document.createElement('section');
  const h = document.createElement('h3');
  h.textContent = title;
  const p = document.createElement('p');
  p.append(...content);
  sec.append(h, p);
  return sec;
}

export function openCredits(){
  if(!dialog){
    dialog = document.createElement('dialog');
    dialog.className = 'credits';
    dialog.addEventListener('click', e => { if(e.target === dialog) dialog.close(); });
    document.body.appendChild(dialog);
  }
  dialog.innerHTML = '';
  const h = document.createElement('h2');
  h.textContent = t('credits.title');
  dialog.appendChild(h);

  dialog.appendChild(section(t('credits.author'),
    link('https://github.com/Happyuky7', 'Happyuky7'), ' · ',
    link(AUTHOR_URL, 'happyuky7.com'), ' · ',
    link(REPO_URL, 'GitHub'), ' · MIT License'));

  for(const key of SECTIONS){
    const body = [t(`credits.${key}Body`)];
    if(key === 'science') body.push(' → ', link('./physics.html', t('ui.physics')));
    dialog.appendChild(section(t(`credits.${key}`), ...body));
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'credits-close';
  close.textContent = t('credits.close');
  close.addEventListener('click', () => dialog.close());
  dialog.appendChild(close);
  dialog.showModal();
  close.focus();
}
