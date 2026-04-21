import { initDataTransfer } from "@webiny/data-transfer";

/**
 * Optional custom DI wiring for this project.
 *
 * The CLI looks for `setup.ts` next to your transfer config; if present,
 * it runs this callback BEFORE loading your preset. Use it to register
 * custom processors, features, or any other DI bindings your preset
 * reaches for via `container.resolve(...)`.
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
