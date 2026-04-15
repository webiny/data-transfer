import jsdom from "jsdom";
import type { SerializedEditorState } from "@webiny/lexical-converter/index.js";
import { createLexicalStateTransformer } from "@webiny/lexical-converter/index.js";

export class LexicalRenderer {
  constructor() {
    if (!global.window) {
      const dom = new jsdom.JSDOM();
      // @ts-ignore
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
