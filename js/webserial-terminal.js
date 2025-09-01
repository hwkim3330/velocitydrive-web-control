/**
 * WebSerial Terminal - Improved Implementation
 * Handles serial communication with proper writer management
 */

class WebSerialTerminal {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.readableStreamClosed = null;
        this.writableStreamClosed = null;
        this.isConnected = false;
        
        this.encoder = new TextEncoder();
        this.decoder = new TextDecoder();
        
        this.rxCount = 0;
        this.txCount = 0;
        this.commandHistory = [];
        this.historyIndex = 0;
        
        // MUP1 Protocol constants
        this.MUP1 = {
            SOF: 0x3E,  // '>'
            EOF: 0x3C,  // '<'
            ESCAPE: 0x5C // '\'
        };
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkWebSerialSupport();
        this.loadSettings();
    }

    checkWebSerialSupport() {
        if (!('serial' in navigator)) {
            this.log('❌ WebSerial API not supported. Please use Chrome or Edge browser.', 'error');
            document.getElementById('connectBtn').disabled = true;
            return false;
        }
        this.log('✅ WebSerial API supported', 'info');
        return true;
    }

    setupEventListeners() {
        // Connection button
        document.getElementById('connectBtn')?.addEventListener('click', () => {
            this.toggleConnection();
        });

        // Send button
        document.getElementById('sendBtn')?.addEventListener('click', () => {
            this.sendInput();
        });

        // Terminal input
        const input = document.getElementById('terminalInput');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.sendInput();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.navigateHistory(-1);
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.navigateHistory(1);
                }
            });
        }

        // Clear button
        document.getElementById('clearBtn')?.addEventListener('click', () => {
            this.clearTerminal();
        });

        // Settings checkboxes
        ['autoScroll', 'showTimestamp', 'showHex', 'echoInput'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('change', () => this.saveSettings());
            }
        });
    }

    async toggleConnection() {
        if (this.isConnected) {
            await this.disconnect();
        } else {
            await this.connect();
        }
    }

    async connect() {
        try {
            // Request port access
            this.port = await navigator.serial.requestPort();
            
            // Get connection parameters
            const baudRate = parseInt(document.getElementById('baudRate')?.value || 115200);
            
            // Open port
            await this.port.open({
                baudRate: baudRate,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                bufferSize: 4096
            });

            // Setup streams with text encoding/decoding
            const textDecoder = new TextDecoderStream();
            this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
            this.reader = textDecoder.readable.getReader();

            const textEncoder = new TextEncoderStream();
            this.writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
            this.writer = textEncoder.writable.getWriter();

            this.isConnected = true;
            this.updateConnectionStatus(true);
            
            // Start reading
            this.readLoop();
            
            this.log(`✅ Connected at ${baudRate} baud`, 'info');
            
            // Get port info
            const info = this.port.getInfo();
            if (info.usbVendorId) {
                this.log(`Device: VID=${info.usbVendorId.toString(16)} PID=${info.usbProductId?.toString(16)}`, 'info');
            }
            
        } catch (error) {
            console.error('Connection error:', error);
            this.log(`❌ Connection failed: ${error.message}`, 'error');
            this.isConnected = false;
            this.updateConnectionStatus(false);
        }
    }

    async disconnect() {
        try {
            // Cancel reader
            if (this.reader) {
                await this.reader.cancel();
                await this.readableStreamClosed?.catch(() => {});
                this.reader = null;
                this.readableStreamClosed = null;
            }

            // Close writer
            if (this.writer) {
                await this.writer.close();
                await this.writableStreamClosed?.catch(() => {});
                this.writer = null;
                this.writableStreamClosed = null;
            }

            // Close port
            if (this.port) {
                await this.port.close();
                this.port = null;
            }

            this.isConnected = false;
            this.updateConnectionStatus(false);
            this.log('🔌 Disconnected', 'info');
            
        } catch (error) {
            console.error('Disconnect error:', error);
            this.log(`⚠️ Disconnect warning: ${error.message}`, 'warning');
        }
    }

    async readLoop() {
        try {
            while (this.reader) {
                const { value, done } = await this.reader.read();
                if (done) {
                    break;
                }
                if (value) {
                    this.handleIncomingData(value);
                }
            }
        } catch (error) {
            if (this.isConnected) {
                console.error('Read error:', error);
                this.log(`❌ Read error: ${error.message}`, 'error');
            }
        }
    }

    handleIncomingData(text) {
        this.rxCount += text.length;
        this.updateCounters();
        
        // Parse MUP1 frames if present
        if (text.includes('>')) {
            this.parseMUP1(text);
        } else {
            // Display as regular text
            this.displayText(text, 'rx');
        }
        
        // Show hex if enabled
        if (document.getElementById('showHex')?.checked) {
            const bytes = this.encoder.encode(text);
            const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
            this.log(`[HEX] ${hex}`, 'hex');
        }
    }

    parseMUP1(text) {
        // Handle MUP1 frames
        if (text.includes('>')) {
            // Look for complete MUP1 frames
            const frameRegex = />([A-Za-z])([^<]*?)(<?<?)([0-9a-fA-F]{4})/g;
            let match;
            
            while ((match = frameRegex.exec(text)) !== null) {
                const [fullFrame, type, data, eof, checksum] = match;
                
                switch (type) {
                    case 'A': // Announce
                        this.log(`[ANNOUNCE] ${data}`, 'mup1');
                        // Parse version info
                        const parts = data.split(' ');
                        if (parts[0]) {
                            this.log(`Version: ${parts[0]}`, 'info');
                            this.log(`MUP1 Max Size: ${parts[2] || '?'} bytes`, 'info');
                        }
                        break;
                        
                    case 'T': // Trace
                        this.log(`[TRACE] ${data}`, 'mup1');
                        break;
                        
                    case 'P': // Pong
                        this.log(`[PONG] ${data}`, 'mup1');
                        break;
                        
                    case 'C': // CoAP Response
                        this.log(`[COAP] Response received`, 'mup1');
                        break;
                        
                    case 'S': // Status
                        this.log(`[STATUS] ${data}`, 'mup1');
                        break;
                        
                    default:
                        this.log(`[${type}] ${data}`, 'mup1');
                }
            }
            
            // Also display raw text
            this.displayText(text, 'rx');
        } else {
            // Regular text output
            this.displayText(text, 'rx');
        }
    }

    async sendInput() {
        const input = document.getElementById('terminalInput');
        const text = input.value;
        
        if (!text) return;
        
        if (!this.isConnected) {
            this.log('❌ Not connected', 'error');
            return;
        }
        
        // Add to history
        this.commandHistory.push(text);
        this.historyIndex = this.commandHistory.length;
        
        // Echo input if enabled
        if (document.getElementById('echoInput')?.checked) {
            this.log(`> ${text}`, 'tx');
        }
        
        // Send data
        await this.sendData(text);
        
        // Clear input
        input.value = '';
        input.focus();
    }

    async sendData(text) {
        if (!this.writer) {
            this.log('❌ Writer not available', 'error');
            return;
        }

        try {
            // Check if it's a MUP1 ping command
            if (text === 'p' || text === 'ping') {
                // Send proper MUP1 ping frame: >p<<8553
                const pingFrame = '>p<<8553';
                await this.writer.write(pingFrame);
                this.log(`Sent MUP1 PING`, 'tx');
                this.txCount += pingFrame.length;
            } else if (text.startsWith('>')) {
                // Raw MUP1 frame
                await this.writer.write(text);
                this.txCount += text.length;
            } else {
                // Regular text with line ending
                const lineEnding = document.getElementById('lineEnding')?.value || '';
                const dataToSend = text + lineEnding;
                await this.writer.write(dataToSend);
                this.txCount += dataToSend.length;
            }
            
            this.updateCounters();
            
        } catch (error) {
            console.error('Send error:', error);
            this.log(`❌ Send error: ${error.message}`, 'error');
        }
    }

    navigateHistory(direction) {
        const input = document.getElementById('terminalInput');
        
        if (direction === -1 && this.historyIndex > 0) {
            this.historyIndex--;
            input.value = this.commandHistory[this.historyIndex];
        } else if (direction === 1 && this.historyIndex < this.commandHistory.length - 1) {
            this.historyIndex++;
            input.value = this.commandHistory[this.historyIndex];
        } else if (direction === 1 && this.historyIndex === this.commandHistory.length - 1) {
            this.historyIndex = this.commandHistory.length;
            input.value = '';
        }
    }

    displayText(text, type = 'rx') {
        // Split by lines and display each
        const lines = text.split(/\r\n|\r|\n/);
        lines.forEach(line => {
            if (line || lines.length > 1) {
                this.log(line, type);
            }
        });
    }

    log(message, type = 'info') {
        const terminal = document.getElementById('terminal');
        if (!terminal) return;
        
        const line = document.createElement('div');
        line.className = `terminal-line ${type}`;
        
        // Add timestamp if enabled
        if (document.getElementById('showTimestamp')?.checked) {
            const timestamp = new Date().toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            line.textContent = `[${timestamp}] ${message}`;
        } else {
            line.textContent = message;
        }
        
        terminal.appendChild(line);
        
        // Auto-scroll if enabled
        if (document.getElementById('autoScroll')?.checked) {
            terminal.scrollTop = terminal.scrollHeight;
        }
        
        // Limit terminal lines
        while (terminal.children.length > 5000) {
            terminal.removeChild(terminal.firstChild);
        }
    }

    clearTerminal() {
        const terminal = document.getElementById('terminal');
        if (terminal) {
            terminal.innerHTML = '';
        }
        this.log('Terminal cleared', 'info');
        this.log('Ready for connection...', 'info');
    }

    updateConnectionStatus(connected) {
        const indicator = document.getElementById('statusIndicator');
        const status = document.getElementById('connectionStatus');
        const btn = document.getElementById('connectBtn');
        
        if (indicator) indicator.className = connected ? 'status-indicator connected' : 'status-indicator';
        if (status) status.textContent = connected ? 'Connected' : 'Disconnected';
        if (btn) btn.textContent = connected ? 'Disconnect' : 'Connect';
    }

    updateCounters() {
        const counter = document.getElementById('rxTxCounter');
        if (counter) {
            counter.textContent = `RX: ${this.rxCount} | TX: ${this.txCount}`;
        }
    }

    saveSettings() {
        const settings = {
            autoScroll: document.getElementById('autoScroll')?.checked,
            showTimestamp: document.getElementById('showTimestamp')?.checked,
            showHex: document.getElementById('showHex')?.checked,
            echoInput: document.getElementById('echoInput')?.checked,
            baudRate: document.getElementById('baudRate')?.value,
            lineEnding: document.getElementById('lineEnding')?.value
        };
        localStorage.setItem('webserial-terminal-settings', JSON.stringify(settings));
    }

    loadSettings() {
        const saved = localStorage.getItem('webserial-terminal-settings');
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                if (settings.autoScroll !== undefined) 
                    document.getElementById('autoScroll').checked = settings.autoScroll;
                if (settings.showTimestamp !== undefined) 
                    document.getElementById('showTimestamp').checked = settings.showTimestamp;
                if (settings.showHex !== undefined) 
                    document.getElementById('showHex').checked = settings.showHex;
                if (settings.echoInput !== undefined) 
                    document.getElementById('echoInput').checked = settings.echoInput;
                if (settings.baudRate) 
                    document.getElementById('baudRate').value = settings.baudRate;
                if (settings.lineEnding) 
                    document.getElementById('lineEnding').value = settings.lineEnding;
            } catch (e) {
                console.error('Failed to load settings:', e);
            }
        }
    }

    // Public API for external commands
    async send(command) {
        if (this.isConnected) {
            await this.sendData(command);
        } else {
            this.log('❌ Not connected', 'error');
        }
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebSerialTerminal;
} else {
    window.WebSerialTerminal = WebSerialTerminal;
}