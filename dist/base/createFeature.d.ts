import type { Container } from "@webiny/di";
export type FeatureDefinition<TRegister = void> = [TRegister] extends [void]
  ? {
      name: string;
      register(container: Container): void;
    }
  : {
      name: string;
      register(container: Container, context: TRegister): void;
    };
export declare function createFeature<TRegister = void>(
  def: FeatureDefinition<TRegister>
): FeatureDefinition<TRegister>;
//# sourceMappingURL=createFeature.d.ts.map
