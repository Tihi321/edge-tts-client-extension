# Edge TTS Client Extension

A Chrome/Edge extension that connects to a local Edge TTS server and controls the TTS tool at https://webtools.tihomir-selak.from.hr/?tool=speak-it.

## Features

- Connects to a local WebSocket server for Edge TTS
- Customizable server port (default: 7123)
- Automatically interacts with the TTS web tool
- Status indicator showing connection state
- Maintains a background TTS tab even when you navigate away
- Automatically reconnects if connection is lost
- Creates a TTS tab automatically if needed

## Installation

### Development Mode

1. Clone this repository
2. Run `yarn install` to install dependencies
3. Run `yarn build` to build the extension
4. Load the extension in Chrome/Edge:
   - Open the browser and navigate to `chrome://extensions` or `edge://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist` folder from this project

### Production Mode

The extension is not yet available on the Chrome Web Store or Edge Add-ons.

## Usage

1. Click on the extension icon in the toolbar
2. Enter the port number for your local TTS server (default: 7123)
3. Click "Connect"
4. The extension will:
   - Open a TTS tool tab in the background if needed
   - Connect to your local server
   - Listen for messages and control the TTS tool automatically

## Development

- `yarn build`: Build the extension
- `yarn watch`: Build and watch for changes

## Requirements

- Local Edge TTS server running on your machine
- Chrome or Edge browser

## License

[MIT](LICENSE)
