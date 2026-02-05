import { z } from "zod";
import { tool } from "ai";

async function getActiveTabId() {
  // 获取当前激活的 Tab
  const tabs = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  const activeTab = tabs[0];

  if (!activeTab?.id) {
    throw new Error("No active tab found");
  }
  return activeTab.id;
}

const activeTabId = await getActiveTabId();

export const tools = {
  GET_PAGE_CONTENT: tool({
    description: "Get the text content of the current active tab",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const response = await browser.tabs.sendMessage(activeTabId, {
          type: "GET_PAGE_CONTENT",
        });

        const data = response;
        return `Content Dom Tree (page body):\n\n${data.content}`;
      } catch (e: any) {
        return `Error reading page content: ${e.message}. Is the content script loaded?`;
      }
    },
  }),

  CLICK_ELEMENT: tool({
    description: "Click an element on the current active tab by CSS selector",
    inputSchema: z.object({
      selector: z.string().describe("The CSS selector of the element to click"),
    }),
    execute: async (input) => {
      if (!input.selector) return "Error: selector is required.";

      try {
        const res = await browser.tabs.sendMessage(activeTabId, {
          type: "CLICK_ELEMENT",
          payload: { selector: input.selector },
        });

        const response = res as { success: boolean; error?: string };
        return response.success
          ? "Clicked element successfully."
          : `Error clicking element: ${response.error}`;
      } catch (e: any) {
        return `Error clicking element: ${e.message}`;
      }
    },
  }),

  INPUT_TEXT: tool({
    description:
      "Input text into an element on the current active tab by CSS selector",
    inputSchema: z.object({
      selector: z
        .string()
        .describe("The CSS selector of the element to input into"),
      text: z.string().describe("The text to input into the element"),
    }),
    execute: async (input) => {
      if (!input || typeof input !== "object") {
        return "Error: Missing tool arguments.";
      }
      if (!input.selector) return "Error: Missing 'selector' argument.";
      if (input.text === undefined || input.text === null) {
        return "Error: Missing 'text' argument.";
      }

      try {
        const res = await browser.tabs.sendMessage(activeTabId, {
          type: "INPUT_TEXT",
          payload: { selector: input.selector, text: input.text },
        });

        const response = res as { success: boolean; error?: string };
        return response.success
          ? "Input text successfully."
          : `Error inputting text: ${response.error}`;
      } catch (e: any) {
        return `Error inputting text: ${e.message}`;
      }
    },
  }),

  GO_BACK: tool({
    description:
      "Navigate back in the browser history of the current active tab",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        await browser.tabs.goBack(activeTabId);
        return "Navigated back successfully.";
      } catch (e: any) {
        // 备选方案：如果 API 调用失败，尝试通过内容脚本执行
        try {
          const res = await browser.tabs.sendMessage(activeTabId, {
            type: "GO_BACK",
          });
          const response = res as { success: boolean; error?: string };
          return response.success
            ? "Navigated back successfully."
            : `Error navigating back: ${response.error}`;
        } catch (messageError: any) {
          return `Error navigating back: ${messageError.message ?? e.message}`;
        }
      }
    },
  }),

  NAVGATE_TO_URL: tool({
    description: "Navigate the current active tab to a specified URL",
    inputSchema: z.object({
      url: z.string().describe("The URL to navigate to"),
    }),
    execute: async (input) => {
      if (!input.url) return "Error: Missing 'url' argument.";

      try {
        const res = await browser.tabs.sendMessage(activeTabId, {
          type: "NAVIGATE_TO_URL",
          payload: { url: input.url },
        });

        const response = res as { success: boolean; error?: string };
        return response.success
          ? `Navigating to ${input.url}...`
          : `Error navigating to URL: ${response.error}`;
      } catch (e: any) {
        return `Error navigating to URL: ${e.message}`;
      }
    },
  }),
};
