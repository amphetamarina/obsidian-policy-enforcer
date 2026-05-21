import { App, PluginSettingTab, Setting } from "obsidian";
import type PolicyEnforcerPlugin from "./main";

export interface PolicyEnforcerSettings {
  claudeBinary: string;
  policiesFile: string;
  pollIntervalSeconds: number;
  invocationTimeoutMs: number;
  dailyNotesFolder: string;
  includedFolders: string[];
  debugLogging: boolean;
}

export const MIN_POLL_SECONDS = 15;

export const DEFAULT_SETTINGS: PolicyEnforcerSettings = {
  claudeBinary: "claude",
  policiesFile: "policies.md",
  pollIntervalSeconds: 60,
  invocationTimeoutMs: 120000,
  dailyNotesFolder: "",
  includedFolders: [],
  debugLogging: false,
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
      .setName("Poll interval (seconds)")
      .setDesc(
        "Sweep in-scope notes this often. Files whose mtime has not advanced " +
          `since the last sweep are skipped. Minimum ${MIN_POLL_SECONDS}s.`,
      )
      .addText((t) =>
        t
          .setValue(String(this.plugin.settings.pollIntervalSeconds))
          .onChange(async (v) => {
            const n = Number(v);
            if (Number.isFinite(n) && n >= MIN_POLL_SECONDS) {
              this.plugin.settings.pollIntervalSeconds = Math.floor(n);
              await this.plugin.saveSettings();
              this.plugin.restartPolling();
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
      .setName("Daily notes folder")
      .setDesc(
        "Vault-relative folder containing daily notes (e.g. `daily`). " +
          "Files in this folder named `YYYY-MM-DD.md` get the previous " +
          "daily's content injected into the policy prompt as context.",
      )
      .addText((t) =>
        t.setValue(this.plugin.settings.dailyNotesFolder).onChange(async (v) => {
          this.plugin.settings.dailyNotesFolder = v.trim().replace(/\/+$/, "");
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Included folders")
      .setDesc(
        "Comma-separated folders (besides the daily folder) that the enforcer " +
          "should monitor. Leave empty to only enforce on daily notes.",
      )
      .addText((t) =>
        t
          .setValue(this.plugin.settings.includedFolders.join(", "))
          .onChange(async (v) => {
            this.plugin.settings.includedFolders = v
              .split(",")
              .map((s) => s.trim().replace(/\/+$/, ""))
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Debug logging")
      .setDesc(
        "Log every claude invocation (prompt + raw response) to the developer " +
          "console. Open with Ctrl+Shift+I.",
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.debugLogging).onChange(async (v) => {
          this.plugin.settings.debugLogging = v;
          await this.plugin.saveSettings();
        }),
      );
  }
}
