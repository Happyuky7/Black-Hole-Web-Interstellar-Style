// Entry point: start screen (warnings, language, credits). The heavy renderer
// in main.js is only downloaded and started once the user clicks "Enter".
import './style.css';
import { t, applyI18n, languageSelect, onLangChange } from './i18n.js';
import { fatal, installGlobalHandlers, consumeErrorParam, errorMessage, markStarted } from './errors.js';
import { openCredits, REPO_URL, AUTHOR_URL } from './credits.js';
import { unlockMusic } from './audio.js';

installGlobalHandlers();

// The static summary in index.html is for crawlers and no-JS visitors only.
document.getElementById('seo')?.remove();

const hasWebGL2 = (() => {
  try { return !!document.createElement('canvas').getContext('webgl2'); }
  catch { return false; }
})();

const intro = document.createElement('div');
intro.className = 'intro';
intro.setAttribute('role', 'dialog');
intro.setAttribute('aria-modal', 'true');
intro.setAttribute('aria-labelledby', 'introTitle');
intro.innerHTML = `
  <div class="intro-sky" aria-hidden="true"></div>
  <div class="intro-bh" aria-hidden="true"><span></span></div>
  <div class="intro-top"></div>
  <main class="intro-card">
    <p class="intro-kicker">Gargantua Kerr Lab</p>
    <h1 id="introTitle" data-i18n="intro.tagline"></h1>
    <p class="intro-lead" data-i18n="intro.lead"></p>
    <p class="intro-banner" role="alert" hidden></p>
    <section class="intro-warn">
      <h2 data-i18n="intro.warnTitle"></h2>
      <ul>
        <li data-i18n="intro.warn.light"></li>
        <li data-i18n="intro.warn.gpu"></li>
        <li data-i18n="intro.warn.audio"></li>
        <li data-i18n="intro.warn.science"></li>
      </ul>
    </section>
    <label class="intro-music"><input type="checkbox" id="introMusic" checked> <span data-i18n="intro.music"></span></label>
    <div class="intro-actions">
      <button type="button" class="intro-enter" id="introEnter" data-i18n="intro.enter"></button>
      <a class="intro-secondary" href="./physics.html" data-i18n="nav.physics"></a>
      <button type="button" class="intro-link" id="introCredits" data-i18n="intro.credits"></button>
    </div>
    <p class="intro-hint" data-i18n="intro.hint"></p>
    <p class="intro-links">
      <a href="${REPO_URL}" target="_blank" rel="noopener" data-i18n="intro.repo"></a>
      · <a href="${AUTHOR_URL}" target="_blank" rel="noopener">happyuky7.com</a>
      · <span>MIT</span>
    </p>
  </main>
`;
intro.querySelector('.intro-top').appendChild(languageSelect('intro-lang'));
document.body.appendChild(intro);
applyI18n(intro);

const banner = intro.querySelector('.intro-banner');
const enterBtn = intro.querySelector('#introEnter');
const lastError = consumeErrorParam();

function showBanner(){
  if(!hasWebGL2){
    banner.textContent = t('intro.noWebgl');
    banner.hidden = false;
  } else if(lastError){
    banner.textContent = t('error.banner', { msg: errorMessage(lastError) });
    banner.hidden = false;
  }
}
showBanner();
onLangChange(showBanner);

enterBtn.disabled = !hasWebGL2;
intro.querySelector('#introCredits').addEventListener('click', openCredits);

enterBtn.addEventListener('click', async () => {
  const withMusic = intro.querySelector('#introMusic').checked;
  // Start the audio right now, inside the click, before the 3D engine loads.
  if(withMusic) unlockMusic();
  enterBtn.disabled = true;
  enterBtn.textContent = t('intro.loading');
  let app;
  try {
    app = await import('./main.js');
  } catch(err) {
    fatal(/webgl/i.test(String(err?.message)) ? 'webgl' : 'load', err);
    return;
  }
  markStarted();
  if(withMusic) app.playMusic();
  intro.classList.add('leaving');
  setTimeout(() => intro.remove(), 900);
});

if(hasWebGL2) enterBtn.focus();
