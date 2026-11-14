const MB = 1024 * 1024;

// Convert bytes into readable MB.
const toMB = (bytes) => {
  return Number((bytes / MB).toFixed(2));
};

// Read the memory currently used by this Node.js process.
export const getMemoryStats = () => {
  const memory = process.memoryUsage();

  return {
    processId: process.pid,
    rssMB: toMB(memory.rss),
    heapUsedMB: toMB(memory.heapUsed),
    externalMB: toMB(memory.external),
    arrayBuffersMB: toMB(memory.arrayBuffers),
  };
};

// Print a memory snapshot in our server terminal.
export const logMemory = (label) => {
  const stats = getMemoryStats();

  console.log(`[MEMORY] ${label}`, stats);

  return stats;
};
