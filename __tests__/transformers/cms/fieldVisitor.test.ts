import { describe, it, expect, vi } from "vitest";
import { visitFields } from "~/transformers/cms/fieldVisitor.ts";
import type { ModelField } from "~/transformers/cms/modelTypes.ts";

function textField(id: string): ModelField {
    return { id, fieldId: id, storageId: `text@${id}`, type: "text" };
}

function objectField(
    id: string,
    nestedFields: ModelField[],
    multipleValues = false
): ModelField {
    return {
        id,
        fieldId: id,
        storageId: `object@${id}`,
        type: "object",
        multipleValues,
        settings: { fields: nestedFields }
    };
}

function dynamicZoneField(
    id: string,
    templates: { id: string; fields: ModelField[] }[]
): ModelField {
    return {
        id,
        fieldId: id,
        storageId: `dynamicZone@${id}`,
        type: "dynamicZone",
        settings: {
            templates: templates.map(t => ({
                id: t.id,
                name: t.id,
                fields: t.fields
            }))
        }
    };
}

describe("visitFields", () => {
    it("invokes callback for each top-level field with a value", async () => {
        const calls: string[] = [];
        const values = { "text@title": "hello", "text@body": "world" };
        await visitFields(values, [textField("title"), textField("body")], (_v, field) => {
            calls.push(field.id);
        });
        expect(calls).toEqual(["title", "body"]);
    });

    it("skips fields whose storageId is absent from values", async () => {
        const calls: string[] = [];
        await visitFields({}, [textField("title")], (_v, field) => {
            calls.push(field.id);
        });
        expect(calls).toHaveLength(0);
    });

    it("recurses into a single nested object", async () => {
        const calls: string[] = [];
        const values = {
            "object@address": {
                "text@street": "Main St"
            }
        };
        const fields = [objectField("address", [textField("street")])];
        await visitFields(values, fields, (_v, field) => {
            calls.push(field.id);
        });
        expect(calls).toContain("address");
        expect(calls).toContain("street");
    });

    it("recurses into each item of an object array (multipleValues=true)", async () => {
        const calls: string[] = [];
        const values = {
            "object@tags": [
                { "text@label": "a" },
                { "text@label": "b" }
            ]
        };
        const fields = [objectField("tags", [textField("label")], true)];
        await visitFields(values, fields, (_v, field) => {
            calls.push(field.id);
        });
        expect(calls.filter(c => c === "label")).toHaveLength(2);
    });

    it("skips array items that are not objects", async () => {
        const callback = vi.fn();
        const values = { "object@tags": [null, "string", 42] };
        const fields = [objectField("tags", [textField("label")], true)];
        await visitFields(values, fields, callback);
        // only the outer "tags" field itself; none of the array items recurse
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback.mock.calls[0][1].id).toBe("tags");
    });

    it("does not recurse into an object field without settings.fields", async () => {
        const calls: string[] = [];
        const values = { "object@meta": { "text@x": "y" } };
        const bareField: ModelField = {
            id: "meta",
            fieldId: "meta",
            storageId: "object@meta",
            type: "object"
            // no settings
        };
        await visitFields(values, [bareField], (_v, field) => {
            calls.push(field.id);
        });
        expect(calls).toEqual(["meta"]);
    });

    it("recurses into a dynamicZone item whose templateId matches", async () => {
        const calls: string[] = [];
        const values = {
            "dynamicZone@hero": [
                { _templateId: "banner", "text@headline": "Hello" }
            ]
        };
        const fields = [dynamicZoneField("hero", [{ id: "banner", fields: [textField("headline")] }])];
        await visitFields(values, fields, (_v, field) => {
            calls.push(field.id);
        });
        expect(calls).toContain("hero");
        expect(calls).toContain("headline");
    });

    it("does not recurse into a dynamicZone item with an unknown templateId", async () => {
        const calls: string[] = [];
        const values = {
            "dynamicZone@hero": [
                { _templateId: "unknown", "text@headline": "Hello" }
            ]
        };
        const fields = [dynamicZoneField("hero", [{ id: "banner", fields: [textField("headline")] }])];
        await visitFields(values, fields, (_v, field) => {
            calls.push(field.id);
        });
        expect(calls).toEqual(["hero"]);
    });

    it("handles a scalar (non-array) dynamicZone value", async () => {
        const calls: string[] = [];
        const values = {
            "dynamicZone@hero": { _templateId: "banner", "text@headline": "Hello" }
        };
        const fields = [dynamicZoneField("hero", [{ id: "banner", fields: [textField("headline")] }])];
        await visitFields(values, fields, (_v, field) => {
            calls.push(field.id);
        });
        expect(calls).toContain("hero");
        expect(calls).toContain("headline");
    });

    it("does not recurse into a dynamicZone field without templates", async () => {
        const calls: string[] = [];
        const values = { "dynamicZone@zone": [{ _templateId: "t1" }] };
        const bareZone: ModelField = {
            id: "zone",
            fieldId: "zone",
            storageId: "dynamicZone@zone",
            type: "dynamicZone"
            // no settings
        };
        await visitFields(values, [bareZone], (_v, field) => {
            calls.push(field.id);
        });
        expect(calls).toEqual(["zone"]);
    });

    it("skips null and non-object dynamicZone items", async () => {
        const callback = vi.fn();
        const values = { "dynamicZone@zone": [null, "oops"] };
        const fields = [dynamicZoneField("zone", [{ id: "t1", fields: [textField("x")] }])];
        await visitFields(values, fields, callback);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback.mock.calls[0][1].id).toBe("zone");
    });
});
