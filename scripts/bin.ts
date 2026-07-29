export function bin(name: string): string {
    return process.platform === "win32" ? `${name}.cmd` : name;
}
