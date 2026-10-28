import { LOCAL_AGENT_IDS } from "../modules/engine/local-agent/agent-id";
import { AGENT_ADAPTERS } from "../modules/engine/local-agent/adapters";
import { localAgentSetupGuide } from "../modules/engine/local-agent/setup-guide";

describe("localAgentSetupGuide", () => {
  const guide = localAgentSetupGuide();

  it("covers every supported agent, in preference order", () => {
    expect(guide.agents.map((setup) => setup.agent)).toEqual([...LOCAL_AGENT_IDS]);
  });

  it("installs a CLI by the name detection looks up on PATH", () => {
    for (const setup of guide.agents) {
      expect(setup.signIn).toContain(`\`${AGENT_ADAPTERS[setup.agent].binaryName}`);
    }
  });

  it("asks a desktop agent to install each one", () => {
    for (const setup of guide.agents) {
      expect(guide.setupPrompt).toContain(setup.install);
    }
  });
});
