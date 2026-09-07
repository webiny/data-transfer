import * as p from "@clack/prompts";
import { Prompts as PromptsAbstraction } from "./abstractions/Prompts.ts";

class ClackPromptsImpl implements PromptsAbstraction.Interface {
    public async select<T>(options: PromptsAbstraction.SelectOptions<T>): Promise<T | null> {
        const result = await p.select<T>({
            message: options.message,
            options: options.options as p.Option<T>[],
            initialValue: options.initialValue
        });
        if (p.isCancel(result)) {
            return null;
        }
        return result;
    }

    public async multiselect<T>(
        options: PromptsAbstraction.MultiselectOptions<T>
    ): Promise<T[] | null> {
        const result = await p.multiselect<T>({
            message: options.message,
            options: options.options as p.Option<T>[],
            required: options.required ?? false,
            initialValues: options.initialValues
        });
        if (p.isCancel(result)) {
            return null;
        }
        return result;
    }

    public async confirm(options: PromptsAbstraction.ConfirmOptions): Promise<boolean | null> {
        const result = await p.confirm({
            message: options.message,
            initialValue: options.initialValue
        });
        if (p.isCancel(result)) {
            return null;
        }
        return result;
    }

    public async text(options: PromptsAbstraction.TextOptions): Promise<string | null> {
        const validate = options.validate;
        const result = await p.text({
            message: options.message,
            placeholder: options.placeholder,
            defaultValue: options.defaultValue,
            validate: validate ? value => validate(value ?? "") : undefined
        });
        if (p.isCancel(result)) {
            return null;
        }
        return result;
    }
}

export const ClackPrompts = PromptsAbstraction.createImplementation({
    implementation: ClackPromptsImpl,
    dependencies: []
});
