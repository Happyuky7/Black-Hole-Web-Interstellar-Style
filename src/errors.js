// Fatal-error handling: show a translated message, then automatically send the
// user back to the start screen (which reads ?error=<code> and explains it).
import { t } from './i18n.js';

const KNOWN = new Set(['webgl', 'shader', 'context', 'load', 'generic']);
const REDIRECT_SECONDS = 6;
let shown = false;
let started = false;

/** Call once the renderer is running: from then on, uncaught errors are fatal. */
export function markStarted(){ started = true; }

export function errorMessage(code){
  return t(`error.${KNOWN.has(code) ? code : 'generic'}`);
}

export function fatal(code, detail){
  if(shown) return;
  shown = true;
  console.error('[gargantua] fatal:', code, detail ?? '');

  const home = `${location.pathname}?error=${encodeURIComponent(code)}`;
  const box = document.createElement('div');
  box.className = 'fatal';
  box.setAttribute('role', 'alertdialog');
  box.setAttribute('aria-live', 'assertive');
  box.innerHTML = `
    <div class="fatal-card">
      <h2></h2>
      <p class="fatal-msg"></p>
      <p class="fatal-count"></p>
      <button type="button"></button>
    </div>`;
  box.querySelector('h2').textContent = t('error.title');
  box.querySelector('.fatal-msg').textContent = errorMessage(code);
  const count = box.querySelector('.fatal-count');
  const btn = box.querySelector('button');
  btn.textContent = t('error.now');
  btn.addEventListener('click', () => location.replace(home));
  document.body.appendChild(box);
  btn.focus();

  let n = REDIRECT_SECONDS;
  const tick = () => {
    count.textContent = t('error.redirect', { n });
    if(n-- <= 0) location.replace(home);
    else setTimeout(tick, 1000);
  };
  tick();
}

export function installGlobalHandlers(){
  addEventListener('error', e => { if(started) fatal('generic', e.error || e.message); });
  addEventListener('unhandledrejection', e => { if(started) fatal('generic', e.reason); });
}

/** Read and strip ?error=<code> from the URL; returns the code or null. */
export function consumeErrorParam(){
  const url = new URL(location.href);
  const code = url.searchParams.get('error');
  if(!code) return null;
  url.searchParams.delete('error');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  return code;
}
