export function detectPackageManager() {
  const agent = process.env["npm_config_user_agent"] ?? "";
  if (agent.startsWith("yarn")) {
    return "yarn";
  }
  if (agent.startsWith("pnpm")) {
    return "pnpm";
  }
  return "npm";
}
//# sourceMappingURL=detectPackageManager.js.map
