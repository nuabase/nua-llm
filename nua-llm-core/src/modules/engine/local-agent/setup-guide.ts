import { LOCAL_AGENT_IDS, LocalAgentId } from "./agent-id";

/** How to install one supported coding-agent CLI and sign in to it. */
export type LocalAgentSetup = {
  agent: LocalAgentId;
  /** The agent's product name: "Claude Code". */
  name: string;
  /** Who makes it and which accounts it works with. */
  about: string;
  /** A shell command that installs the CLI. */
  install: string;
  /** How to sign in once, after installing. */
  signIn: string;
  docsUrl: string;
};

/**
 * What an app tells a user who has no coding agent set up: that one is
 * missing, that it has to be the command-line program, and how to install
 * each supported one. Plain text, ready to show as it is.
 */
export type LocalAgentSetupGuide = {
  /** One line saying no supported agent is set up. */
  missing: string;
  /** Why a desktop or browser app isn't enough: Nuabase runs the CLI. */
  cliOnly: string;
  /** In preference order, as findLocalAgent() tries them. */
  agents: LocalAgentSetup[];
  /** What to do once one is installed and signed in. */
  afterInstall: string;
};

const AGENTS: Record<LocalAgentId, Omit<LocalAgentSetup, "agent">> = {
  "claude-code": {
    name: "Claude Code",
    about: "Made by Anthropic. It works with a Claude Pro or Max plan or an Anthropic Console account.",
    install: "npm install -g @anthropic-ai/claude-code",
    signIn: "Run `claude` in a terminal and follow the sign-in steps.",
    docsUrl: "https://github.com/anthropics/claude-code",
  },
  codex: {
    name: "Codex",
    about: "Made by OpenAI. It works with a ChatGPT Plus, Pro or Business plan or an OpenAI API key.",
    install: "npm install -g @openai/codex",
    signIn: "Run `codex login` in a terminal.",
    docsUrl: "https://github.com/openai/codex",
  },
  pi: {
    name: "Pi",
    about: "An open-source agent that works with many model providers, including a Claude or ChatGPT plan.",
    install: "npm install -g @mariozechner/pi-coding-agent",
    signIn: "Run `pi` in a terminal, then type `/login`.",
    docsUrl: "https://github.com/badlogic/pi-mono",
  },
};

/** Pure: how to set up a supported coding agent, for people who have none. */
export function localAgentSetupGuide(): LocalAgentSetupGuide {
  return {
    missing: "No coding agent is set up on this computer.",
    cliOnly:
      "This app runs the agent's command-line program (CLI), so the agent must be installed as a CLI that runs in a terminal. " +
      "It can't use desktop apps, browser chats or editor extensions, such as the Claude or ChatGPT app. " +
      "If you use one of those, also install its CLI on the same computer and sign in to it once.",
    agents: LOCAL_AGENT_IDS.map((agent) => ({ agent, ...AGENTS[agent] })),
    afterInstall: "After you install an agent and sign in to it, check again here.",
  };
}
