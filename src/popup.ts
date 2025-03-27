import { ExtensionStorage, ConnectionStatus } from "./types";

// DOM elements
const portInput = document.getElementById("port") as HTMLInputElement;
const connectButton = document.getElementById("connect-btn") as HTMLButtonElement;
const statusDot = document.getElementById("status-dot") as HTMLDivElement;
const statusText = document.getElementById("status-text") as HTMLSpanElement;

// Default port
const DEFAULT_PORT = 7123;

// Update UI with connection status
const updateConnectionUI = (status: ConnectionStatus): void => {
  if (status === "connected") {
    statusDot.classList.remove("disconnected");
    statusDot.classList.add("connected");
    statusText.textContent = "Connected";
    connectButton.textContent = "Disconnect";
  } else {
    statusDot.classList.remove("connected");
    statusDot.classList.add("disconnected");
    statusText.textContent = "Disconnected";
    connectButton.textContent = "Connect";
  }
};

// Load saved port
const loadSavedPort = async (): Promise<void> => {
  const result = (await chrome.storage.local.get(["port"])) as Partial<ExtensionStorage>;
  const savedPort = result.port || DEFAULT_PORT;
  portInput.value = savedPort.toString();
};

// Get current connection status
const getConnectionStatus = async (): Promise<ConnectionStatus> => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "getStatus" }, (response) => {
      resolve(response?.connected ? "connected" : "disconnected");
    });
  });
};

// Handle connect button click
const handleConnectClick = async (): Promise<void> => {
  const port = parseInt(portInput.value, 10) || DEFAULT_PORT;

  chrome.runtime.sendMessage({ action: "connect", port });
};

// Initialize popup
const initPopup = async (): Promise<void> => {
  // Load saved port
  await loadSavedPort();

  // Check current connection status
  const status = await getConnectionStatus();
  updateConnectionUI(status);

  // Add connect button click handler
  connectButton.addEventListener("click", handleConnectClick);

  // Listen for connection status changes from background script
  chrome.runtime.onMessage.addListener((message: { action: string; status?: ConnectionStatus }) => {
    if (message.action === "connectionStatusChanged" && message.status) {
      updateConnectionUI(message.status);
    }
  });
};

// Start the popup initialization
document.addEventListener("DOMContentLoaded", initPopup);
