import { MigrationConfig } from "./abstractions/MigrationConfig.ts";
interface MigrationConfigFeatureParams {
  config: MigrationConfig.Interface;
}
export declare const MigrationConfigFeature: {
  name: string;
  register(container: import("@webiny/di").Container, context: MigrationConfigFeatureParams): void;
};
export {};
//# sourceMappingURL=feature.d.ts.map
