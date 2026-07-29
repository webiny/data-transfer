import type { WizardResult } from "./types.ts";
export declare class TransferWizard {
  private readonly cwd;
  constructor(cwd: string);
  run(): Promise<WizardResult | null>;
  private runPresetSelection;
}
//# sourceMappingURL=TransferWizard.d.ts.map
