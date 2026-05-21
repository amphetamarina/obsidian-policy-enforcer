import { Notice, Plugin, TFile } from "obsidian";
import {
  CliClaudeClient,
  parseCommand,
  type ClaudeLogger,
} from "./claudeClient";
import { enforceNote, type EnforceContext } from "./engine";
import { loadPolicies, type Policy } from "./policyLoader";
import {
  DEFAULT_SETTINGS,
  PolicyEnforcerSettingTab,
  type PolicyEnforcerSettings,
} from "./settings";

const DAILY_NOTE_NAME = /^(\d{4}-\d{2}-\d{2})$/;
const MIN_POLL_SECONDS = 15;

export default class PolicyEnforcerPlugin extends Plugin {
  settings!: PolicyEnforcerSettings;
  private policies: Policy[] = [];
  private readonly lastSeen = new Map<string, number>();
  private readonly evaluating = new Set<string>();
  private pollHandle: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new PolicyEnforcerSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      void this.refreshPolicies();
      this.restartPolling();
    });

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.path === this.settings.policiesFile) {
          void this.refreshPolicies();
        }
      }),
    );

    this.addCommand({
      id: "policy-enforcer-enforce-active",
      name: "Enforce active note now",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) void this.enforce(file);
        return true;
      },
    });

    this.addCommand({
      id: "policy-enforcer-poll-now",
      name: "Run polling sweep now",
      callback: () => void this.pollTick(),
    });

    this.addCommand({
      id: "policy-enforcer-reload-policies",
      name: "Reload policies file",
      callback: () => void this.refreshPolicies(true),
    });
  }

  onunload(): void {
    if (this.pollHandle !== null) {
      window.clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  restartPolling(): void {
    if (this.pollHandle !== null) {
      window.clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    const seconds = Math.max(MIN_POLL_SECONDS, this.settings.pollIntervalSeconds);
    this.pollHandle = window.setInterval(() => void this.pollTick(), seconds * 1000);
  }

  private async refreshPolicies(announce = false): Promise<void> {
    const path = this.settings.policiesFile;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      this.policies = [];
      if (announce) new Notice(`Policy Enforcer: policies file not found at ${path}`);
      return;
    }
    const content = await this.app.vault.read(file);
    this.policies = loadPolicies(content);
    if (announce) {
      new Notice(
        `Policy Enforcer: loaded ${this.policies.length} polic${
          this.policies.length === 1 ? "y" : "ies"
        }.`,
      );
    }
  }

  private async pollTick(): Promise<void> {
    if (this.policies.length === 0) return;
    for (const file of this.filesInScope()) {
      const last = this.lastSeen.get(file.path) ?? 0;
      if (file.stat.mtime <= last) continue;
      await this.enforce(file);
    }
  }

  private filesInScope(): TFile[] {
    const folders = new Set<string>(
      [this.settings.dailyNotesFolder, ...this.settings.includedFolders].filter(
        (s) => s.length > 0,
      ),
    );
    if (folders.size === 0) return [];

    return this.app.vault.getMarkdownFiles().filter((f) => {
      if (f.path === this.settings.policiesFile) return false;
      const parentPath = f.parent?.path ?? "";
      return folders.has(parentPath);
    });
  }

  private async enforce(file: TFile): Promise<void> {
    if (this.evaluating.has(file.path)) return;
    this.evaluating.add(file.path);

    try {
      const content = await this.app.vault.read(file);
      const { binary, prefixArgs } = parseCommand(this.settings.claudeBinary);
      const claude = new CliClaudeClient(binary, prefixArgs);
      const context = await this.buildContext(file);

      const outcome = await enforceNote({
        noteContent: content,
        notePath: file.path,
        policies: this.policies,
        claude,
        context,
        timeoutMs: this.settings.invocationTimeoutMs,
        logger: this.buildLogger(file.path),
      });

      switch (outcome.kind) {
        case "rewritten":
          await this.app.vault.modify(file, outcome.content);
          break;
        case "error":
          new Notice(`Policy Enforcer: ${outcome.error}`);
          break;
      }

      const fresh = this.app.vault.getAbstractFileByPath(file.path);
      if (fresh instanceof TFile) {
        this.lastSeen.set(file.path, fresh.stat.mtime);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      new Notice(`Policy Enforcer: ${message}`);
    } finally {
      this.evaluating.delete(file.path);
    }
  }

  private async buildContext(file: TFile): Promise<EnforceContext | undefined> {
    const dailyFolder = this.settings.dailyNotesFolder;
    if (!dailyFolder) return undefined;
    if ((file.parent?.path ?? "") !== dailyFolder) return undefined;
    if (!DAILY_NOTE_NAME.test(file.basename)) return undefined;

    const previous = this.findPreviousDaily(file, file.basename);
    if (!previous) return undefined;

    const content = await this.app.vault.read(previous);
    return { previousDaily: { path: previous.path, content } };
  }

  private findPreviousDaily(current: TFile, currentDate: string): TFile | null {
    const folder = current.parent;
    if (!folder) return null;

    const siblings = folder.children
      .filter((f): f is TFile => f instanceof TFile && f.extension === "md")
      .filter((f) => DAILY_NOTE_NAME.test(f.basename) && f.basename < currentDate)
      .sort((a, b) => (a.basename < b.basename ? 1 : -1));

    return siblings[0] ?? null;
  }

  private buildLogger(notePath: string): ClaudeLogger | undefined {
    if (!this.settings.debugLogging) return undefined;
    return (event) => {
      if (event.kind === "request") {
        console.log(
          `[policy-enforcer] request note=${notePath} cmd=${event.command}\n--- prompt ---\n${event.prompt}\n--- end prompt ---`,
        );
      } else {
        const status = event.ok ? "ok" : `error: ${event.error ?? "unknown"}`;
        console.log(
          `[policy-enforcer] response note=${notePath} ${status} duration=${event.durationMs}ms\n--- response ---\n${event.text}\n--- end response ---`,
        );
      }
    };
  }
}
