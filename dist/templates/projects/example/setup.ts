import { initDataTransfer } from "@webiny/data-transfer";

/**
 * Optional custom DI wiring for this project.
 *
 * The simpler option is `register` in your config.ts:
 *
 *   export default createConfig({
 *     ...,
 *     register: async (container) => {
 *       container.register(MyCustomProcessor);
 *     }
 *   });
 *
 * This `setup.ts` file is the alternative for larger setups. The CLI
 * looks for it next to your transfer config; if present, it runs this
 * callback BEFORE loading your preset.
 *
 * This file is OPTIONAL — delete it if you don't need custom DI wiring.
 */
export default initDataTransfer(async ({ container }) => {
  // Register any custom processors / features here:
  //   container.register(MyCustomProcessor);
  //   container.register(MyOtherFeature);
  //
  // `container` is a @webiny/di Container with the core data-transfer
  // features already wired up (scanners, processors, executors, etc.).
  void container;
});
