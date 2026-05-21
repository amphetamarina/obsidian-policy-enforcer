import { App, PluginSettingTab, Setting } from "obsidian";
import type PolicyEnforcerPlugin from "./main";

export interface PolicyEnforcerSettings {
  claudeBinary: string;
  policiesFile: string;
  debounceMs: number;
  invocationTimeoutMs: number;
  enabledOnModify: boolean;
  enabledOnDailyCreate: boolean;
  dailyNotesFolder: string;
  excludeFolders: string[];
}

export const DEFAULT_SETTINGS: PolicyEnforcerSettings = {
  claudeBinary: "claude",
  policiesFile: "policies.md",
  debounceMs: 3000,
  invocationTimeoutMs: 60000,
  enabledOnModify: true,
  enabledOnDailyCreate: true,
  dailyNotesFolder: "",
  excludeFolders: [],
};

export class PolicyEnforcerSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: PolicyEnforcerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Claude binary")
      .setDesc(
        "Command used to launch the claude CLI. Whitespace-split: the first " +
          "token is the binary, the rest are leading args before `-p`. " +
          "Examples: `claude`, `wsl claude`, `wsl.exe -e claude`.",
      )
      .addText((t) =>
        t.setValue(this.plugin.settings.claudeBinary).onChange(async (v) => {
          this.plugin.settings.claudeBinary = v.trim() || "claude";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Policies file")
      .setDesc("Path within the vault to the markdown file defining policies.")
      .addText((t) =>
        t.setValue(this.plugin.settings.policiesFile).onChange(async (v) => {
          this.plugin.settings.policiesFile = v.trim() || "policies.md";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Debounce (ms)")
      .setDesc("Wait this long after the last edit before evaluating.")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.debounceMs)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isFinite(n) && n >= 0) {
            this.plugin.settings.debounceMs = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName("Claude timeout (ms)")
      .setDesc("Abort a single claude invocation after this many ms.")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.invocationTimeoutMs)).onChange(
          async (v) => {
            const n = Number(v);
            if (Number.isFinite(n) && n > 0) {
              this.plugin.settings.invocationTimeoutMs = n;
              await this.plugin.saveSettings();
            }
          },
        ),
      );

    new Setting(containerEl)
      .setName("Run on note modify")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.enabledOnModify).onChange(async (v) => {
          this.plugin.settings.enabledOnModify = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Daily notes folder")
      .setDesc(
        "Vault-relative folder containing daily notes (e.g. `daily`). " +
          "Leave empty to treat any `YYYY-MM-DD.md` file as a daily note.",
      )
      .addText((t) =>
        t.setValue(this.plugin.settings.dailyNotesFolder).onChange(async (v) => {
          this.plugin.settings.dailyNotesFolder = v.trim().replace(/\/+$/, "");
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Run rollover on daily-note create")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.enabledOnDailyCreate)
          .onChange(async (v) => {
            this.plugin.settings.enabledOnDailyCreate = v;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Exclude folders")
      .setDesc("Comma-separated folder paths to skip.")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.excludeFolders.join(", "))
          .onChange(async (v) => {
            this.plugin.settings.excludeFolders = v
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          }),
      );
  }
}
