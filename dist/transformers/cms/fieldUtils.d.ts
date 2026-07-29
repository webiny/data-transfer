import { ModelField } from "./modelTypes.ts";
/**
 * Computes the correct storageId for a field based on its type and id.
 * Correct format: {type}@{id}
 *
 * @example
 * field = { type: "dynamicZone", id: "teaserRoutingCards" }
 * returns "dynamicZone@teaserRoutingCards"
 */
export declare function getCorrectStorageId(field: ModelField): string;
/**
 * Checks if a field's storageId is corrupted (doesn't match expected format)
 */
export declare function isStorageIdCorrupt(field: ModelField): boolean;
//# sourceMappingURL=fieldUtils.d.ts.map
