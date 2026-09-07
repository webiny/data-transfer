import type { Prompts } from "~/commands/prompts/abstractions/Prompts.js";

export interface StubPromptsScript {
    select?: (unknown | null)[];
    multiselect?: (unknown[] | null)[];
    confirm?: (boolean | null)[];
    text?: (string | null)[];
}

export class StubPrompts implements Prompts.Interface {
    private readonly selects: (unknown | null)[];
    private readonly multiselects: (unknown[] | null)[];
    private readonly confirms: (boolean | null)[];
    private readonly texts: (string | null)[];

    public readonly selectCalls: Prompts.SelectOptions<unknown>[] = [];
    public readonly multiselectCalls: Prompts.MultiselectOptions<unknown>[] = [];
    public readonly confirmCalls: Prompts.ConfirmOptions[] = [];
    public readonly textCalls: Prompts.TextOptions[] = [];

    public constructor(script: StubPromptsScript = {}) {
        this.selects = [...(script.select ?? [])];
        this.multiselects = [...(script.multiselect ?? [])];
        this.confirms = [...(script.confirm ?? [])];
        this.texts = [...(script.text ?? [])];
    }

    public async select<T>(options: Prompts.SelectOptions<T>): Promise<T | null> {
        this.selectCalls.push(options as Prompts.SelectOptions<unknown>);
        const next = this.selects.shift();
        return next === undefined ? null : (next as T);
    }

    public async multiselect<T>(options: Prompts.MultiselectOptions<T>): Promise<T[] | null> {
        this.multiselectCalls.push(options as Prompts.MultiselectOptions<unknown>);
        const next = this.multiselects.shift();
        return next === undefined ? null : (next as T[]);
    }

    public async confirm(options: Prompts.ConfirmOptions): Promise<boolean | null> {
        this.confirmCalls.push(options);
        const next = this.confirms.shift();
        return next === undefined ? null : next;
    }

    public async text(options: Prompts.TextOptions): Promise<string | null> {
        this.textCalls.push(options);
        const next = this.texts.shift();
        return next === undefined ? null : next;
    }
}
