import { createAbstraction } from "~/base/index.js";

export interface UISpinner {
    start(message: string): void;
    message(message: string): void;
    stop(message: string): void;
}

export interface IUI {
    intro(title: string): void;
    outro(message: string): void;
    note(message: string, title?: string): void;
    warn(message: string): void;
    error(message: string): void;
    cancel(message: string): void;
    spinner(): UISpinner;
    exitOnCancel<T>(value: T | null): T;
}

export const UI = createAbstraction<IUI>("Cli/UI");

export namespace UI {
    export type Interface = IUI;
    export type Spinner = UISpinner;
}
