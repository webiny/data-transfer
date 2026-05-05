import jsdom from "jsdom";
import type { SerializedEditorState } from "@webiny/lexical-converter/index.js";
import { createLexicalStateTransformer } from "@webiny/lexical-converter/index.js";

export class LexicalRenderer {
    constructor() {
        if (!global.window) {
            const dom = new jsdom.JSDOM();
            // @ts-ignore: global.window is not typed in Node.js but jsdom sets it for lexical
            global["window"] = dom.window;
            global["document"] = dom.window.document;
            global.DocumentFragment = dom.window.DocumentFragment;
        }
    }

    render(contents: SerializedEditorState): string {
        const transformer = createLexicalStateTransformer();
        return transformer.toHtml(contents);
    }
}
