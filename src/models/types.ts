// ============================================================================
// CMS Model Types
// ============================================================================

export interface ModelField {
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

export interface FieldSettings {
  fields?: ModelField[];
  templates?: Template[];
  layout?: string[][];
  [key: string]: unknown;
}

export interface Template {
  id: string;
  name: string;
  gqlTypeName?: string;
  icon?: string;
  description?: string;
  fields: ModelField[];
  layout?: string[][];
  tags?: string[];
}

export interface Model {
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
