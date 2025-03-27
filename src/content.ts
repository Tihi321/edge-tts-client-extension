// This content script monitors text selection in any tab

// Debounce function to limit how often we send selection updates
const debounce = (func: Function, wait: number) => {
  let timeout: number | null = null;
  return (...args: any[]) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = window.setTimeout(() => {
      func(...args);
      timeout = null;
    }, wait);
  };
};

// Send selected text to background script
const sendSelectedText = (text: string) => {
  if (text && text.trim() !== "") {
    chrome.runtime.sendMessage({
      action: "textSelected",
      text: text.trim(),
    });
  }
};

// Debounced version of sendSelectedText to avoid flooding with messages
const debouncedSendSelectedText = debounce(sendSelectedText, 300);

// Get selected text from the document
const getSelectedText = (): string => {
  const selection = window.getSelection();
  return selection ? selection.toString() : "";
};

// Monitor text selection
document.addEventListener("selectionchange", () => {
  const selectedText = getSelectedText();
  debouncedSendSelectedText(selectedText);
});

// Also send current selection when the page loads
window.addEventListener("load", () => {
  // Small delay to ensure everything is loaded
  setTimeout(() => {
    const selectedText = getSelectedText();
    if (selectedText) {
      sendSelectedText(selectedText);
    }
  }, 500);
});

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getSelectedText") {
    sendResponse({ text: getSelectedText() });
    return true;
  }
});
