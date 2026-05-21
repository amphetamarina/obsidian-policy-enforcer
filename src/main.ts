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
  MIN_POLL_SECONDS,
  PolicyEnforcerSettingTab,
  type PolicyEnforcerSettings,
} from "./settings";

const DAILY_NOTE_NAME = /^(\d{4}-\d{2}-\d{2})$/;
const LOG_TAG = "[policy-enforcer]";

export default class PolicyEnforcerPlugin extends Plugin {
  settings!: PolicyEnforcerSettings;
  private policies: Policy[] = [];
  private readonly lastSeen = new Map<string, number>();
  private readonly evaluating = new Set<string>();
  private pollHandle: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new PolicyEnforcerSettingTab(this.app, this));

    console.info(`${LOG_TAG} plugin loaded (debug=${this.settings.debugLogging})`);

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
        if (!checking) void this.enforce(file, true);
        return true;
      },
    });

    this.addCommand({
      id: "policy-enforcer-poll-now",
      name: "Run polling sweep now",
      callback: () => void this.pollTick(true),
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
    const seconds = Math.max(
      MIN_POLL_SECONDS,
      this.settings.pollIntervalSeconds,
    );
    console.info(`${LOG_TAG} polling every ${seconds}s`);
    this.pollHandle = window.setInterval(
      () => void this.pollTick(),
      seconds * 1000,
    );
  }

  private async refreshPolicies(announce = false): Promise<void> {
    const path = this.settings.policiesFile;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      this.policies = [];
      console.warn(`${LOG_TAG} policies file not found at ${path}`);
      if (announce) {
        new Notice(`Policy Enforcer: policies file not found at ${path}`);
      }
      return;
    }
    const content = await this.app.vault.read(file);
    this.policies = loadPolicies(content);
    console.info(
      `${LOG_TAG} loaded ${this.policies.length} policies from ${path}: ${this.policies.map((p) => p.id).join(", ") || "(none)"}`,
    );
    if (announce) {
      new Notice(
        `Policy Enforcer: loaded ${this.policies.length} polic${
          this.policies.length === 1 ? "y" : "ies"
        }.`,
      );
    }
  }

  private async pollTick(manual = false): Promise<void> {
    if (this.policies.length === 0) {
      console.warn(`${LOG_TAG} sweep skipped: no policies loaded`);
      if (manual) new Notice("Policy Enforcer: no policies loaded.");
      return;
    }
    const files = this.filesInScope();
    console.info(
      `${LOG_TAG} sweep starting; ${files.length} file(s) in scope${manual ? " (manual)" : ""}`,
    );
    if (manual) {
      new Notice(`Policy Enforcer: sweep starting (${files.length} files)`);
    }

    let processed = 0;
    for (const file of files) {
      const last = this.lastSeen.get(file.path) ?? 0;
      if (file.stat.mtime <= last) {
        console.info(`${LOG_TAG} skip ${file.path}: mtime unchanged since last sweep`);
        continue;
      }
      processed++;
      await this.enforce(file, false);
    }
    console.info(
      `${LOG_TAG} sweep complete; processed ${processed}/${files.length}`,
    );
  }

  private filesInScope(): TFile[] {
    const dailyFolder = this.settings.dailyNotesFolder;
    const includedFolders = new Set(
      this.settings.includedFolders.filter((s) => s.length > 0),
    );

    if (!dailyFolder && includedFolders.size === 0) {
      console.warn(
        `${LOG_TAG} no folders in scope; set Daily notes folder or Included folders`,
      );
      return [];
    }

    const out: TFile[] = [];
    let latestDaily: TFile | null = null;

    for (const f of this.app.vault.getMarkdownFiles()) {
      if (f.path === this.settings.policiesFile) continue;
      const parentPath = f.parent?.path ?? "";
      if (dailyFolder && parentPath === dailyFolder) {
        if (!DAILY_NOTE_NAME.test(f.basename)) continue;
        if (latestDaily === null || f.basename > latestDaily.basename) {
          latestDaily = f;
        }
        continue;
      }
      if (includedFolders.has(parentPath)) out.push(f);
    }

    if (latestDaily) out.push(latestDaily);
    return out;
  }

  private async enforce(file: TFile, manual: boolean): Promise<void> {
    if (this.evaluating.has(file.path)) {
      console.info(`${LOG_TAG} ${file.path}: already evaluating, skipping`);
      return;
    }
    this.evaluating.add(file.path);

    const { binary, prefixArgs } = parseCommand(this.settings.claudeBinary);
    console.info(
      `${LOG_TAG} ${file.path}: enforcing with ${binary} ${[...prefixArgs, "-p"].join(" ")}`,
    );

    try {
      const content = await this.app.vault.read(file);
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

      this.reportOutcome(file.path, outcome, manual);

      if (outcome.kind === "rewritten") {
        await this.app.vault.modify(file, outcome.content);
      }

      const fresh = this.app.vault.getAbstractFileByPath(file.path);
      if (fresh instanceof TFile) {
        this.lastSeen.set(file.path, fresh.stat.mtime);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${LOG_TAG} ${file.path}: exception`, err);
      new Notice(`Policy Enforcer: ${file.path} — exception: ${message}`);
    } finally {
      this.evaluating.delete(file.path);
    }
  }

  private reportOutcome(
    path: string,
    outcome: Awaited<ReturnType<typeof enforceNote>>,
    manual: boolean,
  ): void {
    switch (outcome.kind) {
      case "rewritten":
        console.info(`${LOG_TAG} ${path}: rewritten`);
        new Notice(`Policy Enforcer: ${path} — rewritten`);
        return;
      case "unchanged":
        console.info(`${LOG_TAG} ${path}: unchanged`);
        if (manual) new Notice(`Policy Enforcer: ${path} — unchanged`);
        return;
      case "skipped":
        console.info(`${LOG_TAG} ${path}: skipped (${outcome.reason})`);
        if (manual) {
          new Notice(`Policy Enforcer: ${path} — skipped (${outcome.reason})`);
        }
        return;
      case "error":
        console.error(`${LOG_TAG} ${path}: error: ${outcome.error}`);
        new Notice(`Policy Enforcer: ${path} — error: ${outcome.error}`);
        return;
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

  private buildLogger(notePath: string): ClaudeLogger {
    return (event) => {
      if (event.kind === "request") {
        console.info(`${LOG_TAG} ${notePath}: spawning ${event.command}`);
        if (this.settings.debugLogging) {
          console.log(
            `${LOG_TAG} ${notePath}: prompt (${event.prompt.length} chars)\n--- prompt ---\n${event.prompt}\n--- end prompt ---`,
          );
        }
      } else {
        if (event.ok) {
          console.info(
            `${LOG_TAG} ${notePath}: response ok in ${event.durationMs}ms (${event.text.length} chars)`,
          );
        } else {
          console.error(
            `${LOG_TAG} ${notePath}: response FAILED after ${event.durationMs}ms: ${event.error ?? "unknown"}`,
          );
        }
        if (this.settings.debugLogging) {
          console.log(
            `${LOG_TAG} ${notePath}: response body\n--- response ---\n${event.text}\n--- end response ---`,
          );
        }
      }
    };
  }
}
