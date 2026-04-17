import { createFeature } from "~/base/index.ts";
import { DdbScanner } from "./DdbScanner.ts";

export const DdbScannerFeature = createFeature({
    name: "Core/DdbScannerFeature",
    register(container) {
        container.register(DdbScanner).inSingletonScope();
    }
});
