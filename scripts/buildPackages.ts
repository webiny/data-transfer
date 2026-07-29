import { fileURLToPath } from "node:url";
import { run } from "./features/BuildPackages/index.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
run(root);
