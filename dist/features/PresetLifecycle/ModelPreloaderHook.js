import { TenantLocales } from "../../features/TenantLocales/index.js";
import { ModelProvider } from "../../features/ModelProvider/index.js";
import { AfterLoadPresetHook } from "./abstractions/PresetLifecycle.js";
class ModelPreloaderHookImpl {
  tenantLocales;
  modelProvider;
  constructor(tenantLocales, modelProvider) {
    this.tenantLocales = tenantLocales;
    this.modelProvider = modelProvider;
  }
  async execute(_config, _preset) {
    await this.tenantLocales.preload();
    const map = this.tenantLocales.getMap();
    await this.modelProvider.preloadModels(map);
  }
}
export const ModelPreloaderHook = AfterLoadPresetHook.createImplementation({
  implementation: ModelPreloaderHookImpl,
  dependencies: [TenantLocales, ModelProvider]
});
//# sourceMappingURL=ModelPreloaderHook.js.map
