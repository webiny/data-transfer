import { describe, it, expect } from "vitest";
import { getCorrectStorageId, isStorageIdCorrupt } from "~/transformers/cms/fieldUtils.js";
import type { ModelField } from "~/transformers/cms/modelTypes.js";

function field(type: string, id: string, storageId: string): ModelField {
    return { id, fieldId: id, storageId, type };
}

describe("getCorrectStorageId", () => {
    it("returns type@id", () => {
        expect(getCorrectStorageId(field("text", "title", "text@title"))).toBe("text@title");
    });

    it("uses type prefix, not the declared storageId", () => {
        expect(getCorrectStorageId(field("dynamicZone", "hero", "text@hero"))).toBe(
            "dynamicZone@hero"
        );
    });
});

describe("isStorageIdCorrupt", () => {
    it("returns false when storageId matches type@id", () => {
        expect(isStorageIdCorrupt(field("text", "title", "text@title"))).toBe(false);
    });

    it("returns true when storageId uses wrong type prefix", () => {
        expect(isStorageIdCorrupt(field("dynamicZone", "hero", "text@hero"))).toBe(true);
    });

    it("returns true when storageId uses the plain id without a type prefix", () => {
        expect(isStorageIdCorrupt(field("object", "address", "address"))).toBe(true);
    });
});
