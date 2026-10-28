import { LOCAL_AGENT_IDS, LocalAgentId } from "./agent-id";

/** How to install one supported coding-agent CLI and sign in to it. */
export type LocalAgentSetup = {
  agent: LocalAgentId;
  /** The agent's product name: "Claude Code". */
  name: string;
  /** The accounts it works with, short enough for a table cell. */
  worksWith: string;
  /** A shell command that installs the CLI. */
  install: string;
  /** How to sign in once, after installing, in a few words. Commands are in backticks. */
  signIn: string;
  docsUrl: string;
};

/**
 * What an app tells a user who has no coding agent set up: that one is
 * missing, how to install each supported one, and a prompt that has a
 * desktop or browser agent do it for them. Plain text, ready to show as it is.
 */
export type LocalAgentSetupGuide = {
  /** One line saying no supported agent is set up. */
  missing: string;
  /** Why a desktop or browser app isn't enough: Nuabase runs the CLI. */
  cliOnly: string;
  /** In preference order, as findLocalAgent() tries them. */
  agents: LocalAgentSetup[];
  /**
   * For the user to paste into a desktop or browser agent, such as the Claude
   * or ChatGPT app, which can install a CLI though it can't be run as one.
   */
  setupPrompt: string;
};

const AGENTS: Record<LocalAgentId, Omit<LocalAgentSetup, "agent">> = {
  "claude-code": {
    name: "Claude Code",
    worksWith: "Claude Pro or Max, or an Anthropic Console account",
    install: "npm install -g @anthropic-ai/claude-code",
    signIn: "Run `claude`",
    docsUrl: "https://github.com/anthropics/claude-code",
  },
  codex: {
    name: "Codex",
    worksWith: "ChatGPT Plus, Pro or Business, or an OpenAI API key",
    install: "npm install -g @openai/codex",
    signIn: "Run `codex login`",
    docsUrl: "https://github.com/openai/codex",
  },
  pi: {
    name: "Pi",
    worksWith: "Many providers, including a Claude or ChatGPT plan",
    install: "npm install -g @mariozechner/pi-coding-agent",
    signIn: "Run `pi`, then type `/login`",
    docsUrl: "https://github.com/badlogic/pi-mono",
  },
};

function setupPrompt(agents: LocalAgentSetup[]): string {
  return [
    "I use an app that runs a coding agent's command-line program (CLI) on this computer. " +
      "Please install one of these CLIs here and help me sign in to it:",
    "",
    ...agents.map(
      (setup) =>
        `- ${setup.name}. Works with: ${setup.worksWith}. Install: \`${setup.install}\`. Sign in, in a terminal: ${setup.signIn}.`,
    ),
    "",
    "Pick the one that works with the plan or account I already have, and ask me if you can't tell. " +
      "Signing in is interactive, so if you can't do it yourself, tell me the command to run in a terminal. " +
      "Once the CLI runs and is signed in, tell me, so I can check again in the app.",
  ].join("\n");
}

/** Pure: how to set up a supported coding agent, for people who have none. */
export function localAgentSetupGuide(): LocalAgentSetupGuide {
  const agents = LOCAL_AGENT_IDS.map((agent) => ({ agent, ...AGENTS[agent] }));
  return {
    missing: "No coding agent is set up on this computer.",
    cliOnly:
      "This app runs the agent's command-line program (CLI). " +
      "A desktop app, browser chat or editor extension, such as the Claude or ChatGPT app, isn't enough on its own.",
    agents,
    setupPrompt: setupPrompt(agents),
  };
}
