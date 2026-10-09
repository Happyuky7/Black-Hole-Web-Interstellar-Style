// "The physics" page: step-by-step derivation rendered with KaTeX, with the
// scientific sources behind each section.
import 'katex/dist/katex.min.css';
import renderMathInElement from 'katex/contrib/auto-render';
import './physics.css';
import { t, getLang, onLangChange, languageSelect } from '../i18n.js';
import { REPO_URL, AUTHOR_URL } from '../credits.js';
import { SOURCES, SECTION_REFS, sourceNumber } from './sources.js';
import { APP_VERSION, BUILD_DATE, RELEASE_DATE, SOURCES_VERIFIED, formatDate } from '../version.js';
import { AUTHOR, apa, bibtex, softwareApa, writeMetadata } from './cite.js';
import en from './en.js';
import es from './es.js';

// Full text exists in English and Spanish; other languages get the English
// text with a translated notice (the UI chrome is still translated).
const CONTENT = { en, es };
const root = document.getElementById('physics');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function sectionSources(id){
  const keys = SECTION_REFS[id] || [];
  if(!keys.length) return '';
  const items = keys.map(k => {
    const s = SOURCES.find(x => x.key === k);
    const names = s.authors.split(/,\s*|\s*&\s*/).map(n => n.trim().split(' ').pop());
    const label = s.short || (names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} & ${names[1]}` : `${names[0]} et al.`);
    return `<a class="cite" href="#ref-${k}" title="${esc(s.title)}">[${sourceNumber(k)}] ${esc(label)} ${s.year}</a>`;
  }).join('');
  return `<p class="sec-sources"><span>${t('physics.sectionSources')}:</span> ${items}</p>`;
}

function sourceList(lang){
  const links = s => [
    s.doi && `<a href="https://doi.org/${s.doi}" target="_blank" rel="noopener">DOI ${esc(s.doi)}</a>`,
    s.arxiv && `<a href="https://arxiv.org/abs/${s.arxiv}" target="_blank" rel="noopener">arXiv:${esc(s.arxiv)}</a>`,
    s.url && `<a href="${esc(s.url)}" target="_blank" rel="noopener">${s.url.includes('adsabs') ? 'NASA ADS' : esc(new URL(s.url).hostname.replace(/^www\./, ''))}</a>`,
  ].filter(Boolean).join(' · ');
  return `
    <section id="sources">
      <h2>${t('physics.sources')}</h2>
      <p class="ph-verify">${t('physics.verifiedNote')}</p>
      <ol class="refs">${SOURCES.map(s => `
        <li id="ref-${s.key}">
          <p class="ref-main">${esc(s.authors)} (${s.year}). <i>${esc(s.title)}</i>. ${esc(s.venue)}.</p>
          <p class="ref-links">${links(s)} <span class="ref-ok" title="${esc(s.verified)}">✓ ${t('physics.verified')}: ${esc(s.verified)}</span></p>
          <p class="ref-supports"><b>${t('physics.supports')}:</b> ${esc(s.supports[lang] || s.supports.en)}</p>
        </li>`).join('')}
      </ol>
    </section>`;
}

function citeSection(doc, lang){
  const block = (label, text, cls = '') => `
    <div class="cite-block">
      <div class="cite-head"><span>${label}</span><button type="button" class="cite-copy">${t('physics.copy')}</button></div>
      <pre class="cite-box ${cls}">${esc(text)}</pre>
    </div>`;
  return `
    <section id="cite">
      <h2>${t('physics.cite')}</h2>
      <p>${t('physics.citeIntro')}</p>
      ${block(`${t('physics.citePage')} · APA 7`, apa(doc.title, lang))}
      ${block(`${t('physics.citePage')} · BibTeX`, bibtex(doc.title, lang), 'bib')}
      ${block(`${t('physics.citeSoftware')} · APA 7`, softwareApa())}
      <p class="ph-verify">${t('physics.citeGithub')}</p>
    </section>`;
}

async function copyText(btn){
  const text = btn.closest('.cite-block').querySelector('.cite-box').textContent;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API unavailable (e.g. plain http): select the text instead.
    const range = document.createRange();
    range.selectNodeContents(btn.closest('.cite-block').querySelector('.cite-box'));
    getSelection().removeAllRanges(); getSelection().addRange(range);
    document.execCommand?.('copy');
  }
  btn.textContent = t('physics.copied');
  setTimeout(() => { btn.textContent = t('physics.copy'); }, 1600);
}

function render(){
  const lang = getLang();
  const textLang = CONTENT[lang] ? lang : 'en';
  const doc = CONTENT[textLang];
  document.title = `${doc.title} · Black Hole Web`;

  root.innerHTML = `
    <header class="ph-top">
      <a class="ph-back" href="./">← <span>${t('physics.back')}</span></a>
      <div class="ph-tools">
        <a class="ph-btn" href="#sources">${t('physics.sources')}</a>
        <span id="langSlot"></span>
        <a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a>
      </div>
    </header>
    <div class="ph-layout">
      <nav class="ph-toc" aria-label="${t('physics.contents')}">
        <p class="ph-toc-title">${t('physics.contents')}</p>
        <ol>
          ${doc.sections.map(s => `<li><a href="#${s.id}">${s.title}</a></li>`).join('')}
          <li><a href="#cite">${t('physics.cite')}</a></li>
          <li><a href="#sources">${t('physics.sources')}</a></li>
        </ol>
      </nav>
      <main class="ph-main" lang="${textLang}">
        <p class="ph-kicker">Black Hole Web · ${t('ui.physics')}</p>
        <h1>${doc.title}</h1>
        <p class="ph-meta">
          <span class="ph-version">v${APP_VERSION}</span>
          <span>${t('physics.by')} <a href="${AUTHOR_URL}" target="_blank" rel="noopener author">${AUTHOR}</a></span>
          <span>${t('physics.released')}: <time datetime="${RELEASE_DATE}">${formatDate(RELEASE_DATE, lang)}</time></span>
          <span>${t('physics.updated')}: <time datetime="${BUILD_DATE}">${formatDate(BUILD_DATE, lang)}</time></span>
          <span>${t('physics.sourcesChecked')}: <a href="#sources"><time datetime="${SOURCES_VERIFIED}">${formatDate(SOURCES_VERIFIED, lang)}</time></a></span>
        </p>
        ${CONTENT[lang] ? '' : `<p class="ph-note">${t('physics.onlyEnEs')}</p>`}
        <p class="ph-lead">${doc.lead}</p>
        ${doc.sections.map(s => `<section id="${s.id}"><h2>${s.title}</h2>${s.html}${sectionSources(s.id)}</section>`).join('')}
        ${citeSection(doc, textLang)}
        ${sourceList(textLang)}
        <footer class="ph-foot">
          <a href="./">← ${t('physics.back')}</a> ·
          <a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a> ·
          <a href="${AUTHOR_URL}" target="_blank" rel="noopener">happyuky7.com</a> · MIT ·
          Black Hole Web v${APP_VERSION} · ${t('physics.updated')} ${formatDate(BUILD_DATE, lang)}
        </footer>
      </main>
    </div>`;
  root.querySelector('#langSlot').appendChild(languageSelect('ph-lang'));
  root.querySelectorAll('.cite-copy').forEach(b => b.addEventListener('click', () => copyText(b)));
  writeMetadata(doc, textLang);

  renderMathInElement(root.querySelector('.ph-main'), {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '$', right: '$', display: false },
    ],
    ignoredClasses: ['refs', 'cite-box'],
    throwOnError: false,
  });

  // Highlight the section being read in the table of contents.
  const links = new Map([...root.querySelectorAll('.ph-toc a')].map(a => [a.hash.slice(1), a]));
  const spy = new IntersectionObserver(entries => {
    for(const e of entries){
      if(!e.isIntersecting) continue;
      links.forEach(a => a.classList.remove('active'));
      links.get(e.target.id)?.classList.add('active');
    }
  }, { rootMargin: '-20% 0px -70% 0px' });
  root.querySelectorAll('.ph-main section').forEach(s => spy.observe(s));

  if(location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

render();
onLangChange(render);
