import * as p from "@clack/prompts";
import { UI as UIAbstraction } from "./abstractions/UI.ts";
import { ClackSpinner } from "./ClackSpinner.ts";
import { EXIT_CANCELLED } from "~/commands/exitCodes.js";

class ClackUIImpl implements UIAbstraction.Interface {
    public intro(title: string): void {
        p.intro(title);
    }

    public outro(message: string): void {
        p.outro(message);
    }

    public note(message: string, title?: string): void {
        p.note(message, title);
    }

    public warn(message: string): void {
        p.log.warn(message);
    }

    public error(message: string): void {
        p.log.error(message);
    }

    public cancel(message: string): void {
        p.cancel(message);
    }

    public spinner(): UIAbstraction.Spinner {
        return new ClackSpinner();
    }

    public exitOnCancel<T>(value: T | null): T {
        if (value === null) {
            this.cancel("Cancelled.");
            process.exit(EXIT_CANCELLED);
        }
        return value;
    }
}

export const ClackUI = UIAbstraction.createImplementation({
    implementation: ClackUIImpl,
    dependencies: []
});
