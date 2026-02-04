import { Command, TransformContext } from "./types.ts";

export function createContext<T extends Record<string, unknown>>(
  record: T,
  defaultTable: string
): TransformContext<T> {
  const commands: Command[] = [];

  const ctx: TransformContext<any> = {
    record: structuredClone(record),
    original: Object.freeze(structuredClone(record)),
    commands,
    emit(command: Command) {
      commands.push(command);
    },
    replace(newRecord) {
      ctx.record = newRecord;
    },
    putRecord(record: Record<string, unknown>, table = defaultTable) {
      commands.push({ type: "PUT_RECORD", table, record });
    }
  };

  return ctx;
}
