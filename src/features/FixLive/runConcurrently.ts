export async function runConcurrently<T>(
    items: readonly T[],
    limit: number,
    fn: (item: T) => Promise<void>
): Promise<void> {
    const queue = [...items];
    const size = Math.max(1, Math.min(limit, queue.length));
    const workers: Promise<void>[] = [];

    for (let i = 0; i < size; i++) {
        workers.push(
            (async () => {
                for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
                    await fn(next);
                }
            })()
        );
    }

    await Promise.all(workers);
}
