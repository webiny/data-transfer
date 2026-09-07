export interface StepOk<T> {
    kind: "ok";
    value: T;
}

export interface StepCancelled {
    kind: "cancelled";
}

export interface StepRefused {
    kind: "refused";
    message: string;
}

export type StepOutcome<T> = StepOk<T> | StepCancelled | StepRefused;

export const ok = <T>(value: T): StepOk<T> => ({ kind: "ok", value });
export const cancelled = (): StepCancelled => ({ kind: "cancelled" });
export const refused = (message: string): StepRefused => ({ kind: "refused", message });
