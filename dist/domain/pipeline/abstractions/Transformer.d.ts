import type { Processor } from "./Processor.ts";
export declare namespace Transformer {
  type Interface<TContext extends Processor.Context = Processor.Context> = (
    ctx: TContext
  ) => void | Promise<void>;
}
//# sourceMappingURL=Transformer.d.ts.map
