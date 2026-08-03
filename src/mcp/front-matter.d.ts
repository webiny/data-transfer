// The upstream `front-matter` package ships an `export default` ambient
// declaration, but its actual runtime export (`module.exports = fm`) is a
// plain CommonJS export. Under `moduleResolution: nodenext` combined with
// this package's own `type: module`, that mismatch makes the shipped types
// unusable (`fm` resolves to the module namespace instead of the callable
// function). This override restates the same shape using `export =`, which
// matches the real CJS export and interops correctly via `esModuleInterop`.
declare module "front-matter" {
    interface FrontMatterResult<T> {
        readonly attributes: T;
        readonly body: string;
        readonly bodyBegin: number;
        readonly frontmatter?: string;
    }

    interface FrontMatterOptions {
        allowUnsafe?: boolean;
    }

    function fm<T>(file: string, options?: FrontMatterOptions): FrontMatterResult<T>;
    namespace fm {
        function test(file: string): boolean;
    }

    export = fm;
}
