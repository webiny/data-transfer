import { createFeature } from "~/base/index.ts";
import { OsScanner } from "./OsScanner.ts";

export const OsScannerFeature = createFeature({
    name: "Core/OsScannerFeature",
    register(container) {
        container.register(OsScanner).inSingletonScope();
    }
});
