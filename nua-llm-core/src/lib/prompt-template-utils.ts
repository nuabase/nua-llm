// Provides helpers for wrapping template variable names in the <<{var}>> syntax used across our prompts.
// Use when creating or parsing prompt strings that need consistent token placeholders for LLM substitution.
// Call templateVarName to generate a placeholder token, and replaceTemplateVarName to swap it with runtime values.
// Keeps prompt construction reliable and readable by centralizing the placeholder format logic.
export const templateVarName = (varName: string) => `<<{${varName}}>>`;
export const replaceTemplateVarName = (
  str: string,
  varName: string,
  value: string,
) => str.replaceAll(templateVarName(varName), value);
