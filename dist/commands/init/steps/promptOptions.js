import { select } from "@inquirer/prompts";
import { discoverPresets } from "./discoverPresets.js";
import { detectPackageManager } from "./detectPackageManager.js";
const VALID_PMS = ["yarn", "npm", "pnpm"];
export async function promptOptions(args) {
  const presets = discoverPresets(args.projectsDir);
  if (presets.length === 0) {
    throw new Error(
      "No presets found. The @webiny/data-transfer package may be corrupted — reinstall it."
    );
  }
  const preset = args.preset ? validatePreset(args.preset, presets) : await promptPreset(presets);
  const packageManager = args.pm ? validatePackageManager(args.pm) : await promptPackageManager();
  return { projectName: args.projectName, preset, packageManager };
}
function validatePreset(name, available) {
  if (!available.includes(name)) {
    throw new Error(`Unknown preset "${name}". Available presets: ${available.join(", ")}`);
  }
  return name;
}
function validatePackageManager(pm) {
  if (!VALID_PMS.includes(pm)) {
    throw new Error(`Unknown package manager "${pm}". Valid options: ${VALID_PMS.join(", ")}`);
  }
  return pm;
}
async function promptPreset(presets) {
  return select({
    message: "Select a preset:",
    choices: presets.map(name => ({ name, value: name }))
  });
}
async function promptPackageManager() {
  const detected = detectPackageManager();
  return select({
    message: "Package manager:",
    default: detected,
    choices: VALID_PMS.map(pm => ({ name: pm, value: pm }))
  });
}
//# sourceMappingURL=promptOptions.js.map
