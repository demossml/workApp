type DirectorMemoryState = {
  lastDashboardAt: string | null;
  lastChatMessage: string | null;
  lastChatReply: string | null;
};

const directorMemory: DirectorMemoryState = {
  lastDashboardAt: null,
  lastChatMessage: null,
  lastChatReply: null,
};

export function setDirectorDashboardTimestamp(isoDate: string) {
  directorMemory.lastDashboardAt = isoDate;
}

export function setDirectorChatPair(message: string, reply: string) {
  directorMemory.lastChatMessage = message;
  directorMemory.lastChatReply = reply;
}

export function getDirectorMemorySnapshot() {
  return { ...directorMemory };
}
