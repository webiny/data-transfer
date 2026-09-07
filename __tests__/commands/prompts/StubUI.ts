import type { UI } from "~/commands/prompts/abstractions/UI.js";

export class StubCancelError extends Error {
    public constructor() {
        super("StubUI.exitOnCancel: cancelled");
        this.name = "StubCancelError";
    }
}

export interface StubNote {
    message: string;
    title?: string;
}

export class StubUI implements UI.Interface {
    public readonly intros: string[] = [];
    public readonly outros: string[] = [];
    public readonly notes: StubNote[] = [];
    public readonly warns: string[] = [];
    public readonly errors: string[] = [];
    public readonly cancels: string[] = [];
    public readonly spinnerMessages: string[] = [];

    public intro(title: string): void {
        this.intros.push(title);
    }

    public outro(message: string): void {
        this.outros.push(message);
    }

    public note(message: string, title?: string): void {
        this.notes.push({ message, title });
    }

    public warn(message: string): void {
        this.warns.push(message);
    }

    public error(message: string): void {
        this.errors.push(message);
    }

    public cancel(message: string): void {
        this.cancels.push(message);
    }

    public spinner(): UI.Spinner {
        const messages = this.spinnerMessages;
        return {
            start(message: string): void {
                messages.push(message);
            },
            message(message: string): void {
                messages.push(message);
            },
            stop(message: string): void {
                messages.push(message);
            }
        };
    }

    public exitOnCancel<T>(value: T | null): T {
        if (value === null) {
            this.cancel("Cancelled.");
            throw new StubCancelError();
        }
        return value;
    }
}
