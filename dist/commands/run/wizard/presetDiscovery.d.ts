export interface PresetEntry {
  name: string;
  description: string;
}
export declare function listAvailablePresets(presetsDir?: string): string[];
export declare function listAvailablePresetsWithDescriptions(
  presetsDir?: string
): Promise<PresetEntry[]>;
//# sourceMappingURL=presetDiscovery.d.ts.map
