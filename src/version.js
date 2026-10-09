// Project version and key dates. The version comes from package.json and the
// build date from the build itself (both injected by vite.config.js).
export const APP_VERSION = __APP_VERSION__;
export const BUILD_DATE = __BUILD_DATE__;      // last update = date of this build
export const RELEASE_DATE = '2026-10-09';      // v1.0.0 release
export const SOURCES_VERIFIED = '2026-10-09';  // DOIs checked against Crossref, arXiv IDs against arXiv

/** Long, locale-aware date ("9 October 2026", "9 de octubre de 2026", "2026年10月9日"…). */
export function formatDate(iso, lang){
  try {
    return new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' })
      .format(new Date(`${iso}T12:00:00Z`));
  } catch {
    return iso;
  }
}
