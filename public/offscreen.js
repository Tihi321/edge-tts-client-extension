// Cache for SpeechSynthesis voices
let cachedVoices = [];

// Current utterance being spoken
let currentUtterance = null;

// Initialization state
let isInitialized = false;

// Default voice name 
const DEFAULT_VOICE = "Microsoft AndrewMultilingual Online (Natural) - English (United States)";

// Initialize speech synthesis
const initSpeechSynthesis = () => {
  if (isInitialized) {
    console.log("Speech synthesis already initialized");
    return;
  }
  
  console.log("Initializing speech synthesis...");
  
  // Get available voices
  const loadVoices = () => {
    try {
      const voices = window.speechSynthesis.getVoices();
      
      if (voices && voices.length > 0) {
        cachedVoices = voices;
        isInitialized = true;
        
        // Log available voices for debugging
        console.log("Loaded voices:", cachedVoices.length);
        console.log("Available voices:", cachedVoices.map(v => 
          `${v.name} (${v.lang})`
        ));
        
        // Filter for English voices
        const englishVoices = cachedVoices.filter(v => 
          v.lang === 'en-US' || v.lang === 'en-GB'
        );
        console.log("English voices:", englishVoices.map(v => 
          `${v.name} (${v.lang})`
        ));
        
        // Check if Microsoft Andrew is available
        const andrewVoice = cachedVoices.find(v => 
          v.name.includes('Andrew') && v.name.includes('Microsoft')
        );
        if (andrewVoice) {
          console.log("Found Microsoft Andrew voice:", andrewVoice.name);
        }
      } else {
        console.warn("No voices loaded, will retry later");
      }
    } catch (error) {
      console.error("Error loading voices:", error);
    }
  };

  // Try to load voices immediately
  try {
    loadVoices();
    
    // Also set up event listener for voices changed
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  } catch (error) {
    console.error("Error during initialization:", error);
  }
};

// Make sure voices are loaded
const ensureVoicesLoaded = async () => {
  // If already initialized, return immediately
  if (isInitialized && cachedVoices.length > 0) {
    return;
  }
  
  // Try to initialize
  initSpeechSynthesis();
  
  // If still not initialized, try direct loading and waiting
  if (!isInitialized || cachedVoices.length === 0) {
    console.log("Trying to load voices directly...");
    
    try {
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        cachedVoices = voices;
        isInitialized = true;
        console.log("Direct voice loading succeeded, found", voices.length, "voices");
      } else {
        // Wait a moment and try one more time
        await new Promise(resolve => setTimeout(resolve, 200));
        const retryVoices = window.speechSynthesis.getVoices();
        if (retryVoices && retryVoices.length > 0) {
          cachedVoices = retryVoices;
          isInitialized = true;
          console.log("Voice loading succeeded after delay, found", retryVoices.length, "voices");
        } else {
          console.warn("Failed to load voices after multiple attempts");
        }
      }
    } catch (error) {
      console.error("Error during direct voice loading:", error);
    }
  }
};

// Stop TTS playback
const stopTTS = () => {
  try {
    window.speechSynthesis.cancel();
    currentUtterance = null;
    console.log("Speech synthesis cancelled");
  } catch (error) {
    console.error("Error stopping speech synthesis:", error);
  }
};

// Play text using speech synthesis
const playText = async (text, voiceSettings) => {
  // Stop any current speech
  stopTTS();
  
  // Ensure voices are loaded
  await ensureVoicesLoaded();
  
  // Log status
  console.log(`Playing text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
  console.log("Using voice settings:", voiceSettings);
  
  try {
    // Create a new utterance
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Set utterance properties
    utterance.pitch = voiceSettings.pitch;
    utterance.rate = voiceSettings.rate;
    utterance.volume = voiceSettings.volume;
    
    // Set voice if specified
    if (voiceSettings.selectedVoice) {
      // Try to find the specified voice
      const selectedVoice = cachedVoices.find(voice => voice.name === voiceSettings.selectedVoice);
      
      if (selectedVoice) {
        console.log(`Using voice: ${selectedVoice.name} (${selectedVoice.lang})`);
        utterance.voice = selectedVoice;
      } else {
        // Try to find Microsoft Andrew as a fallback
        const andrewVoice = cachedVoices.find(voice => 
          voice.name.includes('Andrew') && voice.name.includes('Microsoft')
        );
        
        if (andrewVoice) {
          console.log(`Using fallback Andrew voice: ${andrewVoice.name}`);
          utterance.voice = andrewVoice;
        } else {
          console.warn("Selected voice not found, using default voice");
        }
      }
    }
    
    // Set up event listeners
    utterance.onend = () => {
      console.log("Speech finished");
      currentUtterance = null;
    };
    
    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event);
      currentUtterance = null;
    };
    
    // Store current utterance
    currentUtterance = utterance;
    
    // Start speaking
    window.speechSynthesis.speak(utterance);
    
    return true;
  } catch (error) {
    console.error('Error during speech synthesis:', error);
    return false;
  }
};

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Received message:", message.action);
  
  if (message.action === 'playTTS') {
    playText(message.text, message.voiceSettings)
      .then(success => {
        sendResponse({ success, action: 'playTTS' });
      })
      .catch(error => {
        console.error("Error in playTTS handler:", error);
        sendResponse({ success: false, error: error.message, action: 'playTTS' });
      });
    return true; // Keep the connection open
  }
  
  if (message.action === 'stopTTS') {
    stopTTS();
    sendResponse({ success: true, action: 'stopTTS' });
    return true;
  }
  
  if (message.action === 'getStatus') {
    sendResponse({ 
      initialized: isInitialized, 
      voicesCount: cachedVoices.length,
      isSpeaking: !!currentUtterance
    });
    return true;
  }
  
  // Close offscreen document when needed
  if (message.action === 'close') {
    stopTTS();
    sendResponse({ success: true, action: 'close' });
    
    // Close after a brief delay to ensure response is sent
    setTimeout(() => {
      window.close();
    }, 50);
    
    return true;
  }
  
  // Unknown action
  sendResponse({ success: false, error: 'Unknown action', action: message.action });
  return true;
});

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  console.log("Offscreen document loaded");
  initSpeechSynthesis();
  
  // Set up a keep-alive ping to prevent the document from being garbage collected
  setInterval(() => {
    if (currentUtterance) {
      console.log("Speech synthesis is still active");
    }
  }, 10000);
}); 