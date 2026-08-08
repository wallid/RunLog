/**
 * The languages offered in Settings.
 *
 * Each carries its own endonym as well as its English name, because a reader
 * who needs this list is by definition not reading the English one. The codes
 * are the ones Google's widget accepts, so a name here that does not match a
 * code there simply never translates — the list is deliberately shorter than
 * Google's full set and only holds codes that have been checked against it.
 */

export interface Language {
  /** The code Google's widget expects. */
  code: string;
  /** The language's own name for itself, which is what the reader scans for. */
  native: string;
  /** The English name, so the list is usable by someone helping them. */
  english: string;
}

/** The language the page is written in, and the one Google translates from. */
export const PAGE_LANGUAGE = "en";

export const LANGUAGES: Language[] = [
  { code: "ar", native: "العربية", english: "Arabic" },
  { code: "bn", native: "বাংলা", english: "Bengali" },
  { code: "bg", native: "Български", english: "Bulgarian" },
  { code: "ca", native: "Català", english: "Catalan" },
  { code: "zh-CN", native: "简体中文", english: "Chinese (Simplified)" },
  { code: "zh-TW", native: "繁體中文", english: "Chinese (Traditional)" },
  { code: "hr", native: "Hrvatski", english: "Croatian" },
  { code: "cs", native: "Čeština", english: "Czech" },
  { code: "da", native: "Dansk", english: "Danish" },
  { code: "nl", native: "Nederlands", english: "Dutch" },
  { code: "et", native: "Eesti", english: "Estonian" },
  { code: "fi", native: "Suomi", english: "Finnish" },
  { code: "fr", native: "Français", english: "French" },
  { code: "de", native: "Deutsch", english: "German" },
  { code: "el", native: "Ελληνικά", english: "Greek" },
  { code: "gu", native: "ગુજરાતી", english: "Gujarati" },
  { code: "he", native: "עברית", english: "Hebrew" },
  { code: "hi", native: "हिन्दी", english: "Hindi" },
  { code: "hu", native: "Magyar", english: "Hungarian" },
  { code: "id", native: "Bahasa Indonesia", english: "Indonesian" },
  { code: "it", native: "Italiano", english: "Italian" },
  { code: "ja", native: "日本語", english: "Japanese" },
  { code: "kn", native: "ಕನ್ನಡ", english: "Kannada" },
  { code: "ko", native: "한국어", english: "Korean" },
  { code: "lv", native: "Latviešu", english: "Latvian" },
  { code: "lt", native: "Lietuvių", english: "Lithuanian" },
  { code: "ms", native: "Bahasa Melayu", english: "Malay" },
  { code: "ml", native: "മലയാളം", english: "Malayalam" },
  { code: "mr", native: "मराठी", english: "Marathi" },
  { code: "no", native: "Norsk", english: "Norwegian" },
  { code: "fa", native: "فارسی", english: "Persian" },
  { code: "pl", native: "Polski", english: "Polish" },
  { code: "pt", native: "Português", english: "Portuguese" },
  { code: "pa", native: "ਪੰਜਾਬੀ", english: "Punjabi" },
  { code: "ro", native: "Română", english: "Romanian" },
  { code: "ru", native: "Русский", english: "Russian" },
  { code: "sr", native: "Српски", english: "Serbian" },
  { code: "sk", native: "Slovenčina", english: "Slovak" },
  { code: "sl", native: "Slovenščina", english: "Slovenian" },
  { code: "es", native: "Español", english: "Spanish" },
  { code: "sw", native: "Kiswahili", english: "Swahili" },
  { code: "sv", native: "Svenska", english: "Swedish" },
  { code: "tl", native: "Tagalog", english: "Tagalog" },
  { code: "ta", native: "தமிழ்", english: "Tamil" },
  { code: "te", native: "తెలుగు", english: "Telugu" },
  { code: "th", native: "ไทย", english: "Thai" },
  { code: "tr", native: "Türkçe", english: "Turkish" },
  { code: "uk", native: "Українська", english: "Ukrainian" },
  { code: "ur", native: "اردو", english: "Urdu" },
  { code: "vi", native: "Tiếng Việt", english: "Vietnamese" },
];

/** Languages written right to left, which the page has to mirror for. */
const RTL_CODES = new Set(["ar", "he", "fa", "ur"]);

export function isRightToLeft(code: string | undefined): boolean {
  return code !== undefined && RTL_CODES.has(code);
}

export function findLanguage(code: string | undefined): Language | undefined {
  if (code === undefined) return undefined;
  return LANGUAGES.find((language) => language.code === code);
}

/**
 * The best offered match for the browser's own language preferences.
 *
 * Used only to put a suggestion in front of the reader, never to switch on
 * translation by itself: the widget is a third party, and guessing that someone
 * wants to talk to it is not a guess this page gets to make. An exact code wins
 * over a base-language match, so a `zh-TW` browser is not offered `zh-CN`.
 */
export function suggestedLanguage(
  preferences: readonly string[] = typeof navigator === "undefined"
    ? []
    : navigator.languages,
): Language | undefined {
  for (const preference of preferences) {
    const base = preference.split("-")[0]?.toLowerCase();
    if (base === PAGE_LANGUAGE) return undefined; // Already readable as written.

    const exact = LANGUAGES.find(
      (language) => language.code.toLowerCase() === preference.toLowerCase(),
    );
    if (exact) return exact;

    const byBase = LANGUAGES.find(
      (language) => language.code.split("-")[0].toLowerCase() === base,
    );
    if (byBase) return byBase;
  }
  return undefined;
}
