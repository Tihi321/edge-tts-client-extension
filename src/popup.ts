import { ExtensionStorage, ConnectionStatus, VoiceSettings } from "./types";

// DOM elements
const portInput = document.getElementById("port") as HTMLInputElement;
const connectButton = document.getElementById("connect-btn") as HTMLButtonElement;
const stopButton = document.getElementById("stop-btn") as HTMLButtonElement;
const statusDot = document.getElementById("status-dot") as HTMLDivElement;
const statusText = document.getElementById("status-text") as HTMLSpanElement;
const voiceSelect = document.getElementById("voice-select") as HTMLSelectElement;
const pitchSlider = document.getElementById("pitch-slider") as HTMLInputElement;
const rateSlider = document.getElementById("rate-slider") as HTMLInputElement;
const volumeSlider = document.getElementById("volume-slider") as HTMLInputElement;
const pitchValue = document.getElementById("pitch-value") as HTMLSpanElement;
const rateValue = document.getElementById("rate-value") as HTMLSpanElement;
const volumeValue = document.getElementById("volume-value") as HTMLSpanElement;
const selectedTextSection = document.getElementById("selected-text-section") as HTMLDivElement;
const selectedTextElement = document.getElementById("selected-text") as HTMLDivElement;
const playSelectedButton = document.getElementById("play-selected-btn") as HTMLButtonElement;

// Currently selected text
let selectedText: string = "";

// Default values
const DEFAULT_PORT = 7123;
const DEFAULT_VOICE = "Microsoft AndrewMultilingual Online (Natural) - English (United States)";
const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  selectedVoice: DEFAULT_VOICE,
  pitch: 1.0,
  rate: 1.0,
  volume: 1.0,
};

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

// Update selected text UI
const updateSelectedTextUI = (text: string): void => {
  if (text && text.trim() !== "") {
    selectedText = text;

    // Truncate text if too long for display
    let displayText = selectedText;
    if (displayText.length > 150) {
      displayText = displayText.substring(0, 147) + "...";
    }

    // Update UI
    selectedTextElement.textContent = displayText;
    selectedTextSection.style.display = "flex";
  } else {
    // Hide if no text
    selectedTextSection.style.display = "none";
  }
};

// Load saved settings
const loadSavedSettings = async (): Promise<void> => {
  const result = (await chrome.storage.local.get([
    "port",
    "selectedVoice",
    "pitch",
    "rate",
    "volume",
  ])) as Partial<ExtensionStorage>;

  // Set port
  const savedPort = result.port || DEFAULT_PORT;
  portInput.value = savedPort.toString();

  // Set voice settings
  const savedVoice = result.selectedVoice || DEFAULT_VOICE_SETTINGS.selectedVoice;
  const savedPitch = result.pitch || DEFAULT_VOICE_SETTINGS.pitch;
  const savedRate = result.rate || DEFAULT_VOICE_SETTINGS.rate;
  const savedVolume = result.volume || DEFAULT_VOICE_SETTINGS.volume;

  // Update sliders
  pitchSlider.value = savedPitch.toString();
  rateSlider.value = savedRate.toString();
  volumeSlider.value = savedVolume.toString();

  // Update value displays
  pitchValue.textContent = savedPitch.toFixed(1);
  rateValue.textContent = savedRate.toFixed(1);
  volumeValue.textContent = savedVolume.toFixed(1);

  // Initialize voice dropdown after loading available voices
  loadVoices(savedVoice);
};

// Load available voices
const loadVoices = (selectedVoiceName: string = ""): void => {
  // This accesses window.speechSynthesis directly in the popup context
  if (!window.speechSynthesis) {
    console.error("Speech synthesis not supported");
    return;
  }

  // Clear existing options
  voiceSelect.innerHTML = "";

  // Function to populate voices
  const populateVoices = () => {
    const voices = window.speechSynthesis.getVoices();

    // Filter for English (UK and US) voices only
    const filteredVoices = voices.filter(
      (voice) => voice.lang === "en-US" || voice.lang === "en-GB"
    );

    // Add voices to select
    filteredVoices.forEach((voice) => {
      const option = document.createElement("option");
      option.value = voice.name;
      option.textContent = `${voice.name} (${voice.lang})`;
      voiceSelect.appendChild(option);
    });

    // Try to select the Microsoft Andrew voice first
    let defaultVoiceFound = false;
    for (let i = 0; i < voiceSelect.options.length; i++) {
      if (
        voiceSelect.options[i].value.includes("Andrew") &&
        voiceSelect.options[i].value.includes("Microsoft")
      ) {
        voiceSelect.selectedIndex = i;
        defaultVoiceFound = true;
        break;
      }
    }

    // If specified voice is found and not Andrew, use it instead
    if (selectedVoiceName && voiceSelect.options.length > 0 && !defaultVoiceFound) {
      for (let i = 0; i < voiceSelect.options.length; i++) {
        if (voiceSelect.options[i].value === selectedVoiceName) {
          voiceSelect.selectedIndex = i;
          break;
        }
      }
    }

    // Make sure we save the current selection
    saveVoiceSettings();
  };

  // If voices are already loaded, populate immediately
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    populateVoices();
  } else {
    // Otherwise wait for voices to be loaded
    window.speechSynthesis.onvoiceschanged = populateVoices;
  }
};

// Save voice settings
const saveVoiceSettings = async (): Promise<void> => {
  const voiceSettings: VoiceSettings = {
    selectedVoice: voiceSelect.value,
    pitch: parseFloat(pitchSlider.value),
    rate: parseFloat(rateSlider.value),
    volume: parseFloat(volumeSlider.value),
  };

  await chrome.storage.local.set(voiceSettings);
};

// Get current connection status
const getConnectionStatus = async (): Promise<ConnectionStatus> => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "getStatus" }, (response) => {
      resolve(response?.connected ? "connected" : "disconnected");
    });
  });
};

// Get currently selected text from background
const fetchSelectedText = async (): Promise<string> => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "getSelectedText" }, (response) => {
      resolve(response?.text || "");
    });
  });
};

// Handle connect button click
const handleConnectClick = async (): Promise<void> => {
  const port = parseInt(portInput.value, 10) || DEFAULT_PORT;
  chrome.runtime.sendMessage({ action: "connect", port });
};

// Handle stop button click
const handleStopClick = async (): Promise<void> => {
  chrome.runtime.sendMessage({ action: "stopTTS" });
};

// Handle play selected text button click
const handlePlaySelectedClick = async (): Promise<void> => {
  if (selectedText && selectedText.trim() !== "") {
    chrome.runtime.sendMessage({
      action: "playSelectedText",
      text: selectedText,
    });
  }
};

// Check for selected text and update UI
const checkForSelectedText = async (): Promise<void> => {
  const text = await fetchSelectedText();
  updateSelectedTextUI(text);
};

// Initialize popup
const initPopup = async (): Promise<void> => {
  // Load saved settings
  await loadSavedSettings();

  // Check current connection status
  const status = await getConnectionStatus();
  updateConnectionUI(status);

  // Check for selected text
  await checkForSelectedText();

  // Add connect button click handler
  connectButton.addEventListener("click", handleConnectClick);

  // Add stop button click handler
  stopButton.addEventListener("click", handleStopClick);

  // Add play selected text button click handler
  playSelectedButton.addEventListener("click", handlePlaySelectedClick);

  // Add event listeners for sliders
  pitchSlider.addEventListener("input", () => {
    pitchValue.textContent = parseFloat(pitchSlider.value).toFixed(1);
    saveVoiceSettings();
  });

  rateSlider.addEventListener("input", () => {
    rateValue.textContent = parseFloat(rateSlider.value).toFixed(1);
    saveVoiceSettings();
  });

  volumeSlider.addEventListener("input", () => {
    volumeValue.textContent = parseFloat(volumeSlider.value).toFixed(1);
    saveVoiceSettings();
  });

  // Add event listener for voice selection
  voiceSelect.addEventListener("change", saveVoiceSettings);

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message: any) => {
    // Handle connection status changes
    if (message.action === "connectionStatusChanged" && message.status) {
      updateConnectionUI(message.status);
    }

    // Handle text selection updates
    if (message.action === "textSelected" && message.text) {
      updateSelectedTextUI(message.text);
    }
  });

  // Request active selection from the current tab
  requestActiveTabSelection();
};

// Request selected text from the active tab directly
const requestActiveTabSelection = async (): Promise<void> => {
  try {
    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tabs && tabs[0] && tabs[0].id) {
      // Attempt to execute content script to get selected text
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => {
          const selection = window.getSelection();
          return selection ? selection.toString() : "";
        },
      });

      if (results && results[0] && results[0].result) {
        const selectedText = results[0].result.trim();
        if (selectedText) {
          updateSelectedTextUI(selectedText);
        }
      }
    }
  } catch (error) {
    console.log("Could not get selection from active tab:", error);
  }
};

// Start the popup initialization
document.addEventListener("DOMContentLoaded", initPopup);
