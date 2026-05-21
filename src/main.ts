import { Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import { CliClaudeClient, parseCommand } from "./claudeClient";
import { evaluateNote } from "./engine";
import { applyViolations } from "./enforcer";
import { loadPolicies, type Policy } from "./policyLoader";
import { rolloverIncompleteTodos } from "./rollover";
import {
  DEFAULT_SETTINGS,
  PolicyEnforcerSettingTab,
  type PolicyEnforcerSettings,
} from "./settings";

const DAILY_NOTE_NAME = /^(\d{4}-\d{2}-\d{2})$/;

export default class PolicyEnforcerPlugin extends Plugin {
  settings!: PolicyEnforcerSettings;
  private policies: Policy[] = [];
  private readonly pendingByPath = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly evaluating = new Set<string>();

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new PolicyEnforcerSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      void this.refreshPolicies();
    });

    this.registerEvent(
      this.app.vault.on("modify", (file) => this.handleModify(file)),
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => this.handleCreate(file)),
    );

    this.addCommand({
      id: "policy-enforcer-check-active",
      name: "Check active note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) void this.evaluate(file);
        return true;
      },
    });

    this.addCommand({
      id: "policy-enforcer-reload-policies",
      name: "Reload policies file",
      callback: () => void this.refreshPolicies(true),
    });
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async refreshPolicies(announce = false): Promise<void> {
    const path = this.settings.policiesFile;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      this.policies = [];
      if (announce) new Notice(`Policy file not found: ${path}`);
      return;
    }
    const content = await this.app.vault.read(file);
    this.policies = loadPolicies(content);
    if (announce) {
      new Notice(`Loaded ${this.policies.length} polic${this.policies.length === 1 ? "y" : "ies"}.`);
    }
  }

  private handleModify(file: TAbstractFile): void {
    if (!(file instanceof TFile)) return;
    if (file.extension !== "md") return;

    if (file.path === this.settings.policiesFile) {
      void this.refreshPolicies();
      return;
    }

    if (!this.settings.enabledOnModify) return;
    if (this.isExcluded(file.path)) return;
    if (this.evaluating.has(file.path)) return;

    const pending = this.pendingByPath.get(file.path);
    if (pending) clearTimeout(pending);

    const timer = setTimeout(() => {
      this.pendingByPath.delete(file.path);
      void this.evaluate(file);
    }, this.settings.debounceMs);

    this.pendingByPath.set(file.path, timer);
  }

  private async handleCreate(file: TAbstractFile): Promise<void> {
    if (!this.settings.enabledOnDailyCreate) return;
    if (!(file instanceof TFile)) return;
    if (file.extension !== "md") return;

    const match = DAILY_NOTE_NAME.exec(file.basename);
    if (!match) return;

    const previous = this.findPreviousDaily(file, match[1]);
    if (!previous) return;

    try {
      this.evaluating.add(file.path);
      const prevContent = await this.app.vault.read(previous);
      const todayContent = await this.app.vault.read(file);
      const merged = rolloverIncompleteTodos(prevContent, todayContent);
      if (merged !== todayContent) {
        await this.app.vault.modify(file, merged);
      }
    } finally {
      this.evaluating.delete(file.path);
    }
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

  private async evaluate(file: TFile): Promise<void> {
    if (this.evaluating.has(file.path)) return;
    this.evaluating.add(file.path);

    try {
      const content = await this.app.vault.read(file);
      const { binary, prefixArgs } = parseCommand(this.settings.claudeBinary);
      const claude = new CliClaudeClient(binary, prefixArgs);
      const violations = await evaluateNote({
        noteContent: content,
        policies: this.policies,
        claude,
        timeoutMs: this.settings.invocationTimeoutMs,
      });

      const next = applyViolations(content, violations);
      if (next !== content) {
        await this.app.vault.modify(file, next);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      new Notice(`Policy Enforcer: ${message}`);
    } finally {
      this.evaluating.delete(file.path);
    }
  }

  private isExcluded(path: string): boolean {
    return this.settings.excludeFolders.some(
      (folder) => path === folder || path.startsWith(`${folder}/`),
    );
  }
}
