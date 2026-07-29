export function createFeature(def) {
  const feature = {
    name: def.name,
    register: def.register
  };
  Reflect.defineMetadata("wby:isFeature", true, feature);
  return feature;
}
//# sourceMappingURL=createFeature.js.map
