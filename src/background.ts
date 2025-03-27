import {
  WebSocketMessage,
  PlayMessage,
  ExtensionStorage,
  ConnectionStatus,
  VoiceSettings,
} from "./types";

// Default port
const DEFAULT_PORT = 7123;

// Default voice settings
const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  selectedVoice: "Microsoft AndrewMultilingual Online (Natural) - English (United States)",
  pitch: 1.0,
  rate: 1.0,
  volume: 1.0,
};

// Currently selected text storage
let currentlySelectedText: string = "";

// WebSocket client
let websocket: WebSocket | null = null;

// Get stored port or default
const getStoredPort = async (): Promise<number> => {
  const result = (await chrome.storage.local.get(["port"])) as Partial<ExtensionStorage>;
  return result.port || DEFAULT_PORT;
};

// Get stored voice settings
const getVoiceSettings = async (): Promise<VoiceSettings> => {
  const result = (await chrome.storage.local.get([
    "selectedVoice",
    "pitch",
    "rate",
    "volume",
  ])) as Partial<ExtensionStorage>;

  return {
    selectedVoice: result.selectedVoice || DEFAULT_VOICE_SETTINGS.selectedVoice,
    pitch: result.pitch || DEFAULT_VOICE_SETTINGS.pitch,
    rate: result.rate || DEFAULT_VOICE_SETTINGS.rate,
    volume: result.volume || DEFAULT_VOICE_SETTINGS.volume,
  };
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
      console.log("WebSocket connection opened");
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
          console.log("Playing message:", message);
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

// Create a tts content script in a service worker context
const createTtsContentScript = async (): Promise<void> => {
  // Check if document already exists
  try {
    // Using any type to bypass TypeScript errors since these APIs might not be fully typed
    const contexts = await (chrome.runtime as any).getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
    });

    if (contexts && contexts.length > 0) {
      console.log("Offscreen document already exists");
      return; // Document already exists
    }
  } catch (error) {
    console.log("Error checking for existing offscreen contexts:", error);
  }

  // Create a temporary offscreen document for audio playback
  // This is required since service workers don't have access to Web Speech API
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Play TTS audio without requiring a visible tab",
    });
    console.log("Offscreen document created successfully");
  } catch (error) {
    // Document might already exist or creation failed
    console.log("Offscreen document creation error:", error);
  }
};

// Handle play message from websocket
const handlePlayMessage = async (message: PlayMessage): Promise<void> => {
  try {
    // Get voice settings
    const voiceSettings = await getVoiceSettings();

    // Play the text
    await playText(message.value, voiceSettings);
  } catch (error) {
    console.error("Error handling TTS playback:", error);
  }
};

// Play text with TTS
const playText = async (text: string, voiceSettings: VoiceSettings): Promise<void> => {
  // Save as currently selected text for popup
  currentlySelectedText = text;

  // Notify popup of new text
  chrome.runtime
    .sendMessage({
      action: "textSelected",
      text: currentlySelectedText,
    })
    .catch(() => {
      // Ignore errors when popup is closed
    });

  try {
    // Ensure offscreen document exists
    await createTtsContentScript();

    // Wait a small amount of time to ensure document is ready
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Send message to offscreen document to speak text
    const response = await sendMessageToOffscreenDocument({
      action: "playTTS",
      text: text,
      voiceSettings,
    });

    console.log("TTS playback response:", response);
  } catch (error) {
    console.error("Error sending TTS message:", error);

    // If the message fails, try recreating the document and retrying once
    try {
      console.log("Attempting to recreate offscreen document and retry...");
      // Force close any existing documents
      await closeOffscreenDocument();

      // Wait a moment and create a new document
      await new Promise((resolve) => setTimeout(resolve, 100));
      await createTtsContentScript();

      // Wait for document to initialize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Try sending the message again
      const retryResponse = await sendMessageToOffscreenDocument({
        action: "playTTS",
        text: text,
        voiceSettings,
      });

      console.log("TTS retry response:", retryResponse);
    } catch (retryError) {
      console.error("Retry failed:", retryError);
    }
  }
};

// Helper to send messages to offscreen document with timeout
const sendMessageToOffscreenDocument = async (message: any): Promise<any> => {
  return new Promise((resolve, reject) => {
    // Set a timeout in case the message never responds
    const timeoutId = setTimeout(() => {
      reject(new Error("Message to offscreen document timed out"));
    }, 2000);

    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timeoutId);

      // Check for error
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
};

// Helper to close offscreen document
const closeOffscreenDocument = async (): Promise<void> => {
  try {
    await sendMessageToOffscreenDocument({ action: "close" });
  } catch (error) {
    console.log("Error closing offscreen document (might not exist):", error);

    // Try to force close by creating a document and then closing it
    try {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Temporary document for closure",
      });

      await sendMessageToOffscreenDocument({ action: "close" });
    } catch (e) {
      // Ignore errors in this cleanup attempt
      console.log("Force close attempt result:", e);
    }
  }
};

// Stop TTS playback
const stopTTS = async (): Promise<void> => {
  try {
    // Ensure offscreen document exists
    await createTtsContentScript();

    // Wait a small amount of time to ensure document is ready
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Send stop message to offscreen document
    await sendMessageToOffscreenDocument({
      action: "stopTTS",
    });
  } catch (error) {
    console.error("Error stopping TTS playback:", error);

    // If stopping fails, try to recreate the document
    try {
      await closeOffscreenDocument();

      // Creating a new document will automatically stop any previous speech
      await createTtsContentScript();
    } catch (retryError) {
      console.error("Failed to recreate document after stop failure:", retryError);
    }
  }
};

// Handle context menu creation
const createContextMenu = (): void => {
  // Remove existing items first to prevent duplicates
  chrome.contextMenus.removeAll(() => {
    // Create parent item
    chrome.contextMenus.create({
      id: "text-to-speech",
      title: "Text-to-Speech",
      contexts: ["selection"],
    });

    // Create play item
    chrome.contextMenus.create({
      id: "play-text",
      parentId: "text-to-speech",
      title: "Play Selected Text",
      contexts: ["selection"],
    });

    // Create stop item
    chrome.contextMenus.create({
      id: "stop-playback",
      parentId: "text-to-speech",
      title: "Stop Playback",
      contexts: ["selection"],
    });
  });
};

// Handle message processing
chrome.runtime.onMessage.addListener(
  (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    // Connect to websocket
    if (message.action === "connect") {
      const port = message.port || DEFAULT_PORT;

      // Save port to storage
      chrome.storage.local.set({ port });

      // Connect to WebSocket
      connectToWebSocket(port);
      sendResponse({ success: true });

      return true; // Keep the messaging channel open for async response
    }

    // Get connection status
    if (message.action === "getStatus") {
      chrome.storage.local.get(["connected"], (result) => {
        const isConnected = result.connected || false;
        sendResponse({ connected: isConnected });
      });
      return true; // Keep the messaging channel open for async response
    }

    // Stop TTS playback
    if (message.action === "stopTTS") {
      stopTTS();
      sendResponse({ success: true });
      return true;
    }

    // Play text with TTS
    if (message.action === "playSelectedText") {
      if (message.text) {
        // Use provided text
        getVoiceSettings().then((voiceSettings) => {
          playText(message.text, voiceSettings);
          sendResponse({ success: true });
        });
      } else if (currentlySelectedText) {
        // Use currently stored text
        getVoiceSettings().then((voiceSettings) => {
          playText(currentlySelectedText, voiceSettings);
          sendResponse({ success: true });
        });
      } else {
        sendResponse({ success: false, error: "No text available" });
      }
      return true;
    }

    // Get currently selected text
    if (message.action === "getSelectedText") {
      sendResponse({ text: currentlySelectedText });
      return true;
    }

    // Handle selected text from content script
    if (message.action === "textSelected" && message.text) {
      currentlySelectedText = message.text;

      // Notify popup of new selected text
      chrome.runtime
        .sendMessage({
          action: "textSelected",
          text: currentlySelectedText,
        })
        .catch(() => {
          // Ignore errors if popup is not open
        });

      sendResponse({ success: true });
    }
  }
);

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "play-text" && info.selectionText) {
    // Save selected text
    currentlySelectedText = info.selectionText;

    // Get voice settings and play text
    getVoiceSettings().then((voiceSettings) => {
      playText(info.selectionText!, voiceSettings);
    });
  } else if (info.menuItemId === "stop-playback") {
    // Stop playback
    stopTTS();
  }
});

// Initialize
(async () => {
  // Create TTS content script
  await createTtsContentScript();

  // Create context menu
  createContextMenu();

  // Get stored port
  const port = await getStoredPort();

  // Connect to WebSocket server
  connectToWebSocket(port);
})();
