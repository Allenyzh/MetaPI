type ChatMessage<T = unknown> = {
  role: "user" | "assistant" | "system" | "tool";
  content: T;
};

export default function getSlidingWindow(
  messages: ChatMessage[],
  maxRound: number,
) {
  let messageToKeep: ChatMessage[] = [];
  const lengthOfMessages = messages.length;
  try {
    if (
      Number.isNaN(maxRound) ||
      maxRound <= 0 ||
      lengthOfMessages <= maxRound * 2
    ) {
      messageToKeep = messages;
    } else {
      messageToKeep = messages.slice(-maxRound * 2);
    }
  } catch (error) {
    console.error("Error in useSlidingWindow:", error);
    messageToKeep = messages;
  }

  return messageToKeep;
}
