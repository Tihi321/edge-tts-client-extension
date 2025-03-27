import { WebSocketMessage, PlayMessage, ExtensionStorage, ConnectionStatus } from "./types";

// Default port
const DEFAULT_PORT = 7123;

// WebSocket client
let websocket: WebSocket | null = null;

// Track all TTS tool tabs
let ttsTabs: Set<number> = new Set();

// Active tab for sending commands
let activeTabId: number | null = null;

// Check if URL is the TTS tool
const isTtsToolUrl = (url: string): boolean => {
  return url.startsWith("https://webtools.tihomir-selak.from.hr/?tool=speak-it");
};

// Get stored port or default
const getStoredPort = async (): Promise<number> => {
  const result = (await chrome.storage.local.get(["port"])) as Partial<ExtensionStorage>;
  return result.port || DEFAULT_PORT;
};

// Connect to WebSocket server
const connectToWebSocket = async (port: number): Promise<void> => {
  try {
    // Close existing connection if any
    if (websocket) {
      websocket.close();
      websocket = null;
    }

    // Create new WebSocket connection
    websocket = new WebSocket(`ws://localhost:${port}`);

    // WebSocket event handlers
    websocket.onopen = () => {
      // Send identify message
      const identifyMessage = {
        type: "identify",
        value: "reader",
      };
      if (websocket) {
        websocket.send(JSON.stringify(identifyMessage));
      }

      // Update connection status
      updateConnectionStatus("connected");
    };

    websocket.onclose = () => {
      updateConnectionStatus("disconnected");
      websocket = null;

      // Attempt to reconnect after a delay
      setTimeout(async () => {
        const port = await getStoredPort();
        connectToWebSocket(port);
      }, 5000);
    };

    websocket.onerror = (error) => {
      console.error("WebSocket error:", error);
      updateConnectionStatus("disconnected");
    };

    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;

        if (message.type === "play") {
          handlePlayMessage(message as PlayMessage);
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
      }
    };
  } catch (error) {
    console.error("Error connecting to WebSocket server:", error);
    updateConnectionStatus("disconnected");

    // Attempt to reconnect after a delay
    setTimeout(async () => {
      const port = await getStoredPort();
      connectToWebSocket(port);
    }, 5000);
  }
};

// Update connection status
const updateConnectionStatus = (status: ConnectionStatus): void => {
  chrome.storage.local.set({ connected: status === "connected" });

  // Notify popup about status change
  chrome.runtime
    .sendMessage({
      action: "connectionStatusChanged",
      status,
    })
    .catch(() => {
      // Ignore errors when popup is closed
    });
};

// Find the best tab to use for TTS
const findBestTtsTab = async (): Promise<number | null> => {
  // First try the active tab if it's a TTS tool tab
  if (activeTabId && ttsTabs.has(activeTabId)) {
    try {
      // Check if tab still exists
      await chrome.tabs.get(activeTabId);
      return activeTabId;
    } catch (e) {
      // Tab no longer exists
      ttsTabs.delete(activeTabId);
      activeTabId = null;
    }
  }

  // Then try any existing TTS tool tab
  for (const tabId of ttsTabs) {
    try {
      await chrome.tabs.get(tabId);
      activeTabId = tabId;
      return tabId;
    } catch (e) {
      // Tab no longer exists
      ttsTabs.delete(tabId);
    }
  }

  // If no existing TTS tabs, create a new one
  try {
    const tab = await chrome.tabs.create({
      url: "https://webtools.tihomir-selak.from.hr/?tool=speak-it",
      active: false, // Open in background
    });

    if (tab.id) {
      ttsTabs.add(tab.id);
      activeTabId = tab.id;
      return tab.id;
    }
  } catch (e) {
    console.error("Error creating new TTS tab:", e);
  }

  return null;
};

// Handle play message
const handlePlayMessage = async (message: PlayMessage): Promise<void> => {
  // Find a TTS tool tab to use
  const tabId = await findBestTtsTab();

  if (!tabId) {
    console.error("No TTS tool tab available");
    return;
  }

  try {
    // Execute script in the tab to control the TTS tool
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (textToSpeak: string) => {
        // Step 1: Stop current speaking
        const stopButton = document.getElementById("stop-speaking");
        if (stopButton) {
          stopButton.dispatchEvent(new Event("click"));
        }

        // Step 2: Set text in the input field
        const textArea = document.getElementById("input-text") as HTMLTextAreaElement;
        if (textArea) {
          textArea.value = textToSpeak;
          textArea.dispatchEvent(new Event("input", { bubbles: true }));
        }

        // Step 3: Click speak button
        setTimeout(() => {
          const speakButton = document.getElementById("speak-it");
          if (speakButton) {
            speakButton.dispatchEvent(new Event("click"));
          }
        }, 200);
      },
      args: [message.value],
    });
  } catch (error) {
    console.error("Error executing script:", error);

    // Tab might be in a broken state, remove it from our list
    ttsTabs.delete(tabId);
    if (activeTabId === tabId) {
      activeTabId = null;
    }

    // Try again with a different tab
    handlePlayMessage(message);
  }
};

// Handle connect request from popup
chrome.runtime.onMessage.addListener(
  (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    if (message.action === "connect") {
      const port = message.port || DEFAULT_PORT;

      // Save port to storage
      chrome.storage.local.set({ port });

      // Connect to WebSocket
      connectToWebSocket(port);
      sendResponse({ success: true });

      return true; // Keep the messaging channel open for async response
    }

    if (message.action === "getStatus") {
      chrome.storage.local.get(["connected"], (result) => {
        const isConnected = result.connected || false;
        sendResponse({ connected: isConnected });
      });
      return true; // Keep the messaging channel open for async response
    }
  }
);

// Listen for tab URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && isTtsToolUrl(changeInfo.url)) {
    ttsTabs.add(tabId);
    // If we don't have an active tab yet, use this one
    if (activeTabId === null) {
      activeTabId = tabId;
    }
  }
});

// Listen for tab closures
chrome.tabs.onRemoved.addListener((tabId) => {
  if (ttsTabs.has(tabId)) {
    ttsTabs.delete(tabId);

    // If this was the active tab, clear it
    if (activeTabId === tabId) {
      activeTabId = null;
    }
  }
});

// Initialize
(async () => {
  // Get stored port
  const port = await getStoredPort();

  // Find existing TTS tool tabs
  const tabs = await chrome.tabs.query({});

  for (const tab of tabs) {
    if (tab.url && isTtsToolUrl(tab.url) && tab.id) {
      ttsTabs.add(tab.id);
      // Use the first one found as active
      if (activeTabId === null) {
        activeTabId = tab.id;
      }
    }
  }

  // If no TTS tabs found, create one in the background
  if (ttsTabs.size === 0) {
    try {
      const tab = await chrome.tabs.create({
        url: "https://webtools.tihomir-selak.from.hr/?tool=speak-it",
        active: false, // Open in background
      });

      if (tab.id) {
        ttsTabs.add(tab.id);
        activeTabId = tab.id;
      }
    } catch (e) {
      console.error("Error creating TTS tab:", e);
    }
  }

  // Connect to WebSocket server
  connectToWebSocket(port);
})();
