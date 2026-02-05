import { useState, useCallback, useEffect } from "react";
import { streamText, stepCountIs } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { tools } from "../lib/tools";
import getSlidingWindow from "../lib/getSlidingWindow";

// 默认保留的对话轮数
const DEFAULT_MAX_ROUNDS = 3;

// 标准化工具输出格式
const normalizeToolOutput = (output: any) => {
  if (
    output &&
    typeof output === "object" &&
    "type" in output &&
    "value" in output
  ) {
    return output;
  }
  return typeof output === "string"
    ? { type: "text", value: output }
    : { type: "json", value: output ?? null };
};

// 根据模型创建对应的 provider
const createProvider = (config: {
  apiKey: string;
  baseUrl: string;
  model: string;
}) => {
  const isOpenAI = config.model.includes("gpt");
  const createFn = isOpenAI ? createOpenAI : createGoogleGenerativeAI;
  return createFn({
    apiKey: config.apiKey,
    baseURL: config.baseUrl || undefined,
  });
};

// 获取系统提示词
const getSystemPrompt = (language: string) => {
  return language === "zh"
    ? "你是 MatePI，一个强大的浏览器AI助手。你可以读取网页内容，点击按钮，输入文字。请根据用户需求使用工具。"
    : "You are MatePI, a powerful browser AI assistant. You can read page content, click buttons, and input text. Use tools as needed to fulfill user requests.";
};

// 构建 assistant 消息内容
const buildAssistantContent = (
  accumulatedText: string,
  toolCalls: Record<string, any>,
) => {
  const hasToolCalls = Object.keys(toolCalls).length > 0;

  if (!hasToolCalls) {
    return accumulatedText;
  }

  const contentParts: any[] = [];
  if (accumulatedText) {
    contentParts.push({ type: "text", text: accumulatedText });
  }
  Object.values(toolCalls).forEach((tc) => {
    contentParts.push({
      type: "tool-call",
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      input: tc.input,
    });
  });
  return contentParts;
};

export function useBaizeChat() {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState<{
    apiKey: string;
    baseUrl: string;
    model: string;
    language: string;
  } | null>(null);

  useEffect(() => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get(
        ["apiKey", "baseUrl", "model", "language"],
        (result) => {
          setConfig({
            apiKey: (result.apiKey as string) || "",
            baseUrl: (result.baseUrl as string) || "",
            model: (result.model as string) || "gemini-2.0-flash-exp",
            language: (result.language as string) || "en",
          });
        },
      );
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string, attachments?: File[]) => {
      // 验证输入，如果没有文本和附件，或者配置缺失则返回
      if (
        (!text.trim() && (!attachments || attachments.length === 0)) ||
        !config
      )
        return;

      setIsLoading(true);

      // 构建用户消息内容
      const contentParts: any[] = [];
      if (text.trim()) {
        contentParts.push({ type: "text", text: text });
      }

      if (attachments && attachments.length > 0) {
        for (const file of attachments) {
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              resolve(result);
            };
            reader.readAsDataURL(file);
          });
          contentParts.push({ type: "image", image: base64 });
        }
      }

      const userMessage = { role: "user", content: contentParts };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");

      try {
        const provider = createProvider(config);
        const systemPrompt = getSystemPrompt(config.language);

        // 使用滑动窗口限制上下文长度
        const historyMessages = getSlidingWindow(messages, DEFAULT_MAX_ROUNDS);
        console.log(historyMessages);

        const result = streamText({
          model: provider(config.model),
          system: systemPrompt,
          messages: [...historyMessages, userMessage] as any,
          tools: tools,
          stopWhen: stepCountIs(5),
          onStepFinish({ toolResults }: any) {
            console.log(toolResults);
            if (!toolResults || toolResults.length === 0) return;

            const toolModelMessage = {
              role: "tool",
              content: toolResults.map((tr: any) => ({
                type: "tool-result",
                toolCallId: tr.toolCallId,
                toolName: tr.toolName,
                output: normalizeToolOutput(tr.output ?? tr.result),
              })),
            };

            setMessages((prev) => [...prev, toolModelMessage]);
          },
        } as any);

        let accumulatedText = "";
        let toolCalls: Record<string, any> = {};

        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

        for await (const part of result.fullStream) {
          // 处理流式响应
          if (part.type === "text-delta") {
            accumulatedText += (part as any).text ?? (part as any).delta ?? "";
          } else if (part.type === "tool-call") {
            toolCalls[part.toolCallId] = part;
          }

          // 更新最后一条 assistant 消息
          setMessages((prev) => {
            const lastAssistantIndex = prev.findLastIndex(
              (msg) => msg.role === "assistant",
            );
            if (lastAssistantIndex === -1) return prev;

            const newMessages = [...prev];
            newMessages[lastAssistantIndex] = {
              ...newMessages[lastAssistantIndex],
              content: buildAssistantContent(accumulatedText, toolCalls),
            };
            return newMessages;
          });
        }
      } catch (error) {
        console.error(error);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Error: " + (error as Error).message },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [config, messages],
  );

  console.log(messages);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent, attachments?: File[]) => {
      e?.preventDefault();
      sendMessage(input, attachments);
    },
    [input, sendMessage],
  );

  return {
    messages,
    input,
    handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setInput(e.target.value),
    handleSubmit,
    sendMessage,
    isLoading,
    config,
  };
}
