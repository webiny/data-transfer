interface ModelField {
  id: string;
  fieldId: string;
  storageId: string;
  type: string;
  label?: string;
  multipleValues?: boolean;
  renderer?: {
    name: string;
    settings?: Record<string, unknown>;
  };
  settings?: FieldSettings;
  validation?: unknown[];
  tags?: string[];
}
interface FieldSettings {
  fields?: ModelField[];
  templates?: Template[];
  layout?: string[][];
  [key: string]: unknown;
}
interface Template {
  id: string;
  name: string;
  gqlTypeName?: string;
  icon?: string;
  description?: string;
  fields: ModelField[];
  layout?: string[][];
  tags?: string[];
}
interface Model {
  PK: string;
  SK: string;
  modelId: string;
  name: string;
  fields: ModelField[];
  layout?: string[][];
  locale?: string;
  tenant?: string;
  titleFieldId?: string;
  [key: string]: unknown;
}
export interface IModelProvider {
  preloadModels(tenantLocales: Map<string, string>): Promise<void>;
  getModel(modelId: string): Model | undefined;
  getModelIds(): string[];
}
export declare const ModelProvider: import("@webiny/di").Abstraction<IModelProvider>;
export declare namespace ModelProvider {
  type Interface = IModelProvider;
  type ModelType = Model;
  type Field = ModelField;
  type Settings = FieldSettings;
  type TemplateType = Template;
}
export {};
//# sourceMappingURL=ModelProvider.d.ts.map
