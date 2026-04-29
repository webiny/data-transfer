export namespace RecordDisposition {
    export class Processed {}

    export class Blackholed {
        public constructor(public readonly pipelineName: string) {}
    }

    export class Unmatched {}
}
