import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectSystemLocale,
  localizeActionResult,
  readLanguagePreference,
  saveLanguagePreference,
  strings,
} from "./i18n";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("desktop language preference", () => {
  it("detects Simplified Chinese and falls back to English", () => {
    expect(detectSystemLocale("zh-Hans-CN")).toBe("zh-CN");
    expect(detectSystemLocale("en-CA")).toBe("en");
  });

  it("persists an explicit language choice", () => {
    let stored: string | null = null;
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => stored,
        setItem: (_key: string, value: string) => {
          stored = value;
        },
      },
    });

    saveLanguagePreference("zh-CN");

    expect(readLanguagePreference()).toBe("zh-CN");
  });

  it("localizes installer results while retaining technical details", () => {
    const result = {
      code: "BRIDGE_INSTALL_FAILED",
      message: "The shared runtime could not be installed: permission denied.",
      recovery: "Run Install / Update again.",
    };

    const localized = localizeActionResult(result, "zh-CN", strings["zh-CN"]);

    expect(localized.message).toContain("Adobe 桥接服务安装失败");
    expect(localized.message).toContain("permission denied");
    expect(localized.recovery).toContain("安装 / 更新");
  });
});
