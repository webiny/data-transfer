import * as p from "@clack/prompts";
import type { UI } from "./abstractions/UI.ts";

export class ClackSpinner implements UI.Spinner {
    private readonly spinner: ReturnType<typeof p.spinner>;

    public constructor() {
        this.spinner = p.spinner();
    }

    public start(message: string): void {
        this.spinner.start(message);
    }

    public message(message: string): void {
        this.spinner.message(message);
    }

    public stop(message: string): void {
        this.spinner.stop(message);
    }
}
