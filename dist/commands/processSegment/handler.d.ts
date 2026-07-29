export interface ProcessSegmentArgs {
  runId: string;
  segment: number;
  total: number;
  config: string;
  preset: string;
  logLevel?: string;
  dryRun?: boolean;
}
export declare function handler(argv: ProcessSegmentArgs): Promise<void>;
//# sourceMappingURL=handler.d.ts.map
