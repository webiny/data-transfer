import { createAbstraction } from "~/base/index.js";

export interface PromptSelectOption<T> {
    value: T;
    label: string;
    hint?: string;
    disabled?: boolean;
}

export interface PromptSelectOptions<T> {
    message: string;
    options: PromptSelectOption<T>[];
    initialValue?: T;
}

export interface PromptMultiselectOptions<T> {
    message: string;
    options: PromptSelectOption<T>[];
    required?: boolean;
    initialValues?: T[];
}

export interface PromptConfirmOptions {
    message: string;
    initialValue?: boolean;
}

export interface PromptTextOptions {
    message: string;
    placeholder?: string;
    defaultValue?: string;
    validate?: (value: string) => string | undefined;
}

export interface IPrompts {
    select<T>(options: PromptSelectOptions<T>): Promise<T | null>;
    multiselect<T>(options: PromptMultiselectOptions<T>): Promise<T[] | null>;
    confirm(options: PromptConfirmOptions): Promise<boolean | null>;
    text(options: PromptTextOptions): Promise<string | null>;
}

export const Prompts = createAbstraction<IPrompts>("Cli/Prompts");

export namespace Prompts {
    export type Interface = IPrompts;
    export type SelectOption<T> = PromptSelectOption<T>;
    export type SelectOptions<T> = PromptSelectOptions<T>;
    export type MultiselectOptions<T> = PromptMultiselectOptions<T>;
    export type ConfirmOptions = PromptConfirmOptions;
    export type TextOptions = PromptTextOptions;
}
