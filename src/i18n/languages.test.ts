import { describe, expect, it } from "vitest";
import {
  findLanguage,
  isRightToLeft,
  LANGUAGES,
  PAGE_LANGUAGE,
  suggestedLanguage,
} from "./languages";

describe("the offered languages", () => {
  it("does not offer the language the page is already written in", () => {
    expect(LANGUAGES.some((language) => language.code === PAGE_LANGUAGE)).toBe(false);
  });

  it("carries no duplicate codes, which would render two identical options", () => {
    const codes = LANGUAGES.map((language) => language.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("names every language in its own script as well as in English", () => {
    for (const language of LANGUAGES) {
      expect(language.native.trim()).not.toBe("");
      expect(language.english.trim()).not.toBe("");
    }
  });

  it("knows which languages the page has to mirror for", () => {
    expect(isRightToLeft("ar")).toBe(true);
    expect(isRightToLeft("he")).toBe(true);
    expect(isRightToLeft("fr")).toBe(false);
    expect(isRightToLeft(undefined)).toBe(false);
  });
});

describe("finding a stored language", () => {
  it("returns the entry for a code this build offers", () => {
    expect(findLanguage("fr")?.english).toBe("French");
  });

  // The settings store leans on this to refuse a stored code it no longer
  // recognises, which would otherwise load the widget on every visit and
  // translate into nothing.
  it("returns nothing for a code that has been dropped or never existed", () => {
    expect(findLanguage("xx")).toBeUndefined();
    expect(findLanguage(undefined)).toBeUndefined();
  });
});

describe("suggesting a language from the browser", () => {
  it("prefers an exact regional match over the base language", () => {
    expect(suggestedLanguage(["zh-TW"])?.code).toBe("zh-TW");
  });

  it("falls back to the base language when the region is not offered", () => {
    expect(suggestedLanguage(["fr-CA"])?.code).toBe("fr");
  });

  // Suggesting a translation to someone whose first preference is English
  // would be offering to fix something that is not broken.
  it("suggests nothing when English comes first", () => {
    expect(suggestedLanguage(["en-GB", "fr"])).toBeUndefined();
  });

  it("walks down the preference list past languages it cannot offer", () => {
    expect(suggestedLanguage(["cy", "de"])?.code).toBe("de");
  });

  it("suggests nothing when no preference is offered at all", () => {
    expect(suggestedLanguage(["cy", "gd"])).toBeUndefined();
  });
});
