import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bin } from "./bin.ts";

const root = fileURLToPath(new URL("..", import.meta.url));

execFileSync(bin("npm"), ["pack", "--dry-run"], {
    cwd: `${root}/dist`,
    stdio: "inherit"
});
