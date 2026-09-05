export function formatCount(value: number): string {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatTimestamp(iso: string): string {
    return iso.slice(0, 16).replace("T", " ");
}
