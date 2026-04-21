import type { Container } from "@webiny/di";
import { createAbstraction } from "./createAbstraction.js";

export const ContainerToken = createAbstraction<Container>("Core/Container");
