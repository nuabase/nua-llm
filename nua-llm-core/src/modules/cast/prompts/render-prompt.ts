import { SchemaEnforcementKind } from "../../engine/llm-engine";
import { CastRequest, RenderedPrompt } from "../cast-request";
import { renderListPrompt } from "./list-prompt";
import { renderValuePrompt } from "./value-prompt";

/**
 * The prompt for one attempt at a cast. It differs by enforcement: with native
 * enforcement the model is told its answer goes in an envelope field.
 */
export function renderPrompt(cast: CastRequest, enforcement: SchemaEnforcementKind): RenderedPrompt {
  switch (cast.kind) {
    case "value":
      return renderValuePrompt(cast, enforcement);
    case "list":
      return renderListPrompt(cast, enforcement);
  }
}
