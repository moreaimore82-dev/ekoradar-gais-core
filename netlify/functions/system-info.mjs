export const handler = async () => {
  const mem = process.memoryUsage();
  const totalMem = 2048 * 1024 * 1024;
  const usedPercent = Math.round((mem.rss / totalMem) * 100);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
      percent: Math.min(usedPercent, 100),
    }),
  };
};
