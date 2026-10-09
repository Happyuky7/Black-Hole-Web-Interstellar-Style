// "How to cite" for The physics page: APA 7 and BibTeX for the article,
// a software citation for the repository, and machine-readable metadata
// (Highwire citation_* tags for Google Scholar/Zotero, schema.org JSON-LD).
import { APP_VERSION, BUILD_DATE, RELEASE_DATE } from '../version.js';
import { REPO_URL, AUTHOR_URL } from '../credits.js';
import { SOURCES } from './sources.js';

export const AUTHOR = 'Happyuky7';
export const SITE = 'Black Hole Web';
export const SOFTWARE_TITLE = 'Black Hole Web: Interstellar Style';

/** Canonical URL of this page wherever it is hosted (no hash, no query). */
export const pageUrl = () => `${location.origin}${location.pathname}`;

const [Y, M, D] = RELEASE_DATE.split('-').map(Number);
const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const BIB_MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function todayParts(){
  const d = new Date();
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
}

/** APA 7 citation of the page (Spanish APA for "es", English otherwise). */
export function apa(title, lang){
  const url = pageUrl();
  const [ty, tm, td] = todayParts();
  if(lang === 'es'){
    return `${AUTHOR}. (${D} de ${MONTHS_ES[M-1]} de ${Y}). ${title} (Versión ${APP_VERSION}) [Página web]. ${SITE}. ` +
           `Recuperado el ${td} de ${MONTHS_ES[tm-1]} de ${ty}, de ${url}`;
  }
  return `${AUTHOR}. (${Y}, ${MONTHS_EN[M-1]} ${D}). ${title} (Version ${APP_VERSION}) [Web page]. ${SITE}. ` +
         `Retrieved ${MONTHS_EN[tm-1]} ${td}, ${ty}, from ${url}`;
}

/** BibTeX entry for the page (works with BibTeX and biblatex). */
export function bibtex(title, lang){
  const [ty, tm, td] = todayParts();
  const pad = n => String(n).padStart(2, '0');
  return `@misc{${AUTHOR.toLowerCase()}${Y}blackhole,
  author       = {${AUTHOR}},
  title        = {${title}},
  howpublished = {${SITE}, version ${APP_VERSION}},
  year         = {${Y}},
  month        = ${BIB_MONTHS[M-1]},
  date         = {${RELEASE_DATE}},
  version      = {${APP_VERSION}},
  language     = {${lang}},
  url          = {${pageUrl()}},
  urldate      = {${ty}-${pad(tm)}-${pad(td)}},
  note         = {Last updated ${BUILD_DATE}}
}`;
}

/** Software citation (mirrors CITATION.cff, which powers GitHub's "Cite this repository"). */
export function softwareApa(){
  return `${AUTHOR}. (${Y}). ${SOFTWARE_TITLE} (Version ${APP_VERSION}) [Computer software]. ${REPO_URL}`;
}

/** Highwire Press tags + schema.org ScholarlyArticle JSON-LD, refreshed per language. */
export function writeMetadata(doc, lang){
  const head = document.head;
  head.querySelectorAll('meta[data-cite], script[data-cite]').forEach(el => el.remove());
  const meta = (name, content) => {
    const m = document.createElement('meta');
    m.name = name; m.content = content; m.dataset.cite = '';
    head.appendChild(m);
  };
  meta('citation_title', doc.title);
  meta('citation_author', AUTHOR);
  meta('citation_publication_date', RELEASE_DATE.replaceAll('-', '/'));
  meta('citation_online_date', BUILD_DATE.replaceAll('-', '/'));
  meta('citation_publisher', SITE);
  meta('citation_language', lang);
  meta('citation_public_url', pageUrl());
  meta('DC.title', doc.title);
  meta('DC.creator', AUTHOR);
  meta('DC.date', RELEASE_DATE);
  meta('DC.publisher', SITE);
  for(const s of SOURCES){
    meta('citation_reference', [
      `citation_title=${s.title}`, `citation_author=${s.authors}`, `citation_publication_date=${s.year}`,
      s.doi && `citation_doi=${s.doi}`,
    ].filter(Boolean).join('; '));
  }

  const ld = document.createElement('script');
  ld.type = 'application/ld+json';
  ld.dataset.cite = '';
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ScholarlyArticle',
    headline: doc.title,
    name: doc.title,
    description: doc.lead,
    inLanguage: lang,
    version: APP_VERSION,
    datePublished: RELEASE_DATE,
    dateModified: BUILD_DATE,
    url: pageUrl(),
    license: 'https://opensource.org/licenses/MIT',
    author: { '@type': 'Person', name: AUTHOR, url: AUTHOR_URL },
    publisher: { '@type': 'Organization', name: SITE, url: REPO_URL },
    isPartOf: { '@type': 'SoftwareSourceCode', name: SOFTWARE_TITLE, codeRepository: REPO_URL, version: APP_VERSION },
    citation: SOURCES.map(s => ({
      '@type': 'CreativeWork', name: s.title, author: s.authors, datePublished: String(s.year),
      ...(s.doi ? { sameAs: `https://doi.org/${s.doi}` } : s.url ? { sameAs: s.url } : {}),
    })),
  });
  head.appendChild(ld);
}
