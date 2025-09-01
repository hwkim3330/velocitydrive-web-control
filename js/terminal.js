/**
 * VelocityDRIVE Terminal Implementation
 * Real serial terminal with MUP1 protocol support
 */

class VelocityDriveTerminal {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.encoder = new TextEncoder();
        this.decoder = new TextDecoder();
        this.isConnected = false;
        
        this.rxCount = 0;
        this.txCount = 0;
        this.buffer = [];
        this.commandHistory = [];
        this.historyIndex = 0;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.addBootMessage();
        
        // Check WebSerial support
        if (!('serial' in navigator)) {
            this.addLine('❌ WebSerial API not supported. Please use Chrome or Edge browser.', 'error');
            document.getElementById('connectBtn').disabled = true;
        }
    }

    setupEventListeners() {
        // Connect button
        document.getElementById('connectBtn').addEventListener('click', () => {
            this.toggleConnection();
        });

        // Clear button
        document.getElementById('clearBtn').addEventListener('click', () => {
            this.clearTerminal();
        });

        // Send button
        document.getElementById('sendBtn').addEventListener('click', () => {
            this.sendInput();
        });

        // Terminal input
        const input = document.getElementById('terminalInput');
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.sendInput();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateHistory(-1);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateHistory(1);
            }
        });

        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                this.clearTerminal();
            }
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                this.toggleConnection();
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
            const baudRate = parseInt(document.getElementById('baudRate').value);
            
            // Request port
            this.port = await navigator.serial.requestPort();
            
            // Open port
            await this.port.open({
                baudRate: baudRate,
                dataBits: parseInt(document.getElementById('dataBits')?.value || 8),
                stopBits: parseInt(document.getElementById('stopBits')?.value || 1),
                parity: document.getElementById('parity')?.value || 'none',
                bufferSize: 4096,
                flowControl: 'none'
            });

            this.isConnected = true;
            this.updateConnectionStatus(true);
            
            // Start reading
            this.readLoop();
            
            this.addLine(`✅ Connected at ${baudRate} baud`, 'info');
            this.updateStatus(`Connected to ${this.port.getInfo().usbVendorId || 'Serial Port'}`);
            
        } catch (error) {
            this.addLine(`❌ Connection failed: ${error.message}`, 'error');
            this.updateStatus('Connection failed');
        }
    }

    async disconnect() {
        try {
            // Release writer first
            if (this.writer) {
                try {
                    await this.writer.releaseLock();
                } catch (e) {}
                this.writer = null;
            }
            
            if (this.reader) {
                await this.reader.cancel();
                this.reader = null;
            }
            
            if (this.port) {
                await this.port.close();
                this.port = null;
            }
            
            this.isConnected = false;
            this.updateConnectionStatus(false);
            
            this.addLine('🔌 Disconnected', 'info');
            this.updateStatus('Disconnected');
            
        } catch (error) {
            this.addLine(`❌ Disconnect error: ${error.message}`, 'error');
        }
    }

    async readLoop() {
        while (this.port && this.port.readable) {
            this.reader = this.port.readable.getReader();
            
            try {
                while (true) {
                    const { value, done } = await this.reader.read();
                    if (done) break;
                    
                    this.handleIncomingData(value);
                }
            } catch (error) {
                if (error.name !== 'NetworkError') {
                    this.addLine(`❌ Read error: ${error.message}`, 'error');
                }
            } finally {
                if (this.reader) {
                    this.reader.releaseLock();
                    this.reader = null;
                }
            }
        }
    }

    handleIncomingData(data) {
        this.rxCount += data.length;
        this.updateCounter();
        
        // Add to buffer for MUP1 parsing
        this.buffer.push(...data);
        
        // Try to parse MUP1 frames if enabled
        if (document.getElementById('parseMUP1')?.checked) {
            this.parseMUP1Frames();
        }
        
        // Display raw data
        const text = this.decoder.decode(data);
        const lines = text.split(/\r\n|\r|\n/);
        
        lines.forEach((line, index) => {
            if (line || index < lines.length - 1) {
                this.addLine(line, 'rx', false);
            }
        });
        
        // Show hex if enabled
        if (document.getElementById('showHex')?.checked) {
            const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
            this.addLine(`[HEX] ${hex}`, 'rx');
        }
    }

    parseMUP1Frames() {
        const SOF = 0x3E; // '>'
        const EOF = 0x3C; // '<'
        
        while (this.buffer.length > 0) {
            // Look for start of frame
            const startIdx = this.buffer.indexOf(SOF);
            if (startIdx === -1) {
                // No frame start, display as text
                const text = this.decoder.decode(new Uint8Array(this.buffer));
                if (text.trim()) {
                    this.addLine(text, 'rx', false);
                }
                this.buffer = [];
                break;
            }
            
            // Display data before frame
            if (startIdx > 0) {
                const preData = this.buffer.slice(0, startIdx);
                const text = this.decoder.decode(new Uint8Array(preData));
                if (text.trim()) {
                    this.addLine(text, 'rx', false);
                }
                this.buffer = this.buffer.slice(startIdx);
            }
            
            // Look for end of frame
            let eofIdx = -1;
            for (let i = 1; i < this.buffer.length; i++) {
                if (this.buffer[i] === EOF) {
                    // Check for double EOF or single with checksum
                    if (i + 5 < this.buffer.length) {
                        // Might have checksum
                        eofIdx = i;
                        break;
                    } else if (i + 1 < this.buffer.length && this.buffer[i + 1] === EOF) {
                        // Double EOF
                        if (i + 6 < this.buffer.length) {
                            eofIdx = i + 1;
                            break;
                        }
                    }
                }
            }
            
            if (eofIdx === -1) {
                // Incomplete frame, wait for more data
                break;
            }
            
            // Extract frame
            const frameEnd = eofIdx + 5; // Include checksum
            if (frameEnd <= this.buffer.length) {
                const frame = this.buffer.slice(0, frameEnd);
                this.displayMUP1Frame(frame);
                this.buffer = this.buffer.slice(frameEnd);
            } else {
                // Wait for complete checksum
                break;
            }
        }
    }

    displayMUP1Frame(frame) {
        const type = String.fromCharCode(frame[1]);
        let dataEnd = frame.indexOf(0x3C, 2);
        if (dataEnd === -1) dataEnd = frame.length - 4;
        
        const data = frame.slice(2, dataEnd);
        const text = this.decoder.decode(new Uint8Array(data));
        
        // Format based on type
        let display = '';
        switch (type) {
            case 'A': // Automatic response (like version)
                display = `[AUTO] ${text}`;
                break;
            case 'T': // Text message
                display = `[TEXT] ${text}`;
                break;
            case 'P': // Pong response
                display = `[PONG] ${text}`;
                break;
            case 'C': // CoAP response
                display = `[COAP] Response received`;
                break;
            case 'S': // Status
                display = `[STATUS] ${text}`;
                break;
            default:
                display = `[${type}] ${text}`;
        }
        
        this.addLine(display, 'rx');
    }

    async sendInput() {
        const input = document.getElementById('terminalInput');
        const text = input.value;
        
        if (!text) return;
        if (!this.isConnected) {
            this.addLine('❌ Not connected', 'error');
            return;
        }
        
        // Add to history
        this.commandHistory.push(text);
        this.historyIndex = this.commandHistory.length;
        
        // Echo if enabled
        if (document.getElementById('echoInput')?.checked) {
            this.addLine(`> ${text}`, 'tx');
        }
        
        // Send data
        await this.sendData(text);
        
        // Clear input
        input.value = '';
        input.focus();
    }

    async sendData(text) {
        try {
            // Check if writer is already in use
            if (this.writer && this.writer.locked) {
                await this.writer.releaseLock();
                this.writer = null;
            }
            
            // Get a new writer
            if (!this.writer) {
                this.writer = this.port.writable.getWriter();
            }
            
            // Add line ending
            const lineEnding = document.getElementById('lineEnding')?.value || 'crlf';
            let ending = '';
            switch (lineEnding) {
                case 'cr': ending = '\r'; break;
                case 'lf': ending = '\n'; break;
                case 'crlf': ending = '\r\n'; break;
            }
            
            const data = this.encoder.encode(text + ending);
            await this.writer.write(data);
            
            // Keep writer for reuse instead of releasing immediately
            // writer.releaseLock();
            
            this.txCount += data.length;
            this.updateCounter();
            
        } catch (error) {
            this.addLine(`❌ Send error: ${error.message}`, 'error');
            // Try to release lock on error
            if (this.writer) {
                try {
                    this.writer.releaseLock();
                } catch (e) {}
                this.writer = null;
            }
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

    addLine(text, type = 'rx', addTimestamp = true) {
        const terminal = document.getElementById('terminal');
        const line = document.createElement('div');
        line.className = `terminal-line ${type}`;
        
        let content = '';
        if (addTimestamp && document.getElementById('showTimestamp')?.checked) {
            const timestamp = new Date().toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                fractionalSecondDigits: 3
            });
            content = `[${timestamp}] `;
        }
        
        content += text;
        line.textContent = content;
        terminal.appendChild(line);
        
        // Auto-scroll
        if (document.getElementById('autoScroll')?.checked) {
            terminal.scrollTop = terminal.scrollHeight;
        }
        
        // Limit lines
        while (terminal.children.length > 5000) {
            terminal.removeChild(terminal.firstChild);
        }
    }

    clearTerminal() {
        document.getElementById('terminal').innerHTML = '';
        this.addBootMessage();
    }

    addBootMessage() {
        this.addLine('VelocityDRIVE Terminal v1.0', 'info');
        this.addLine('Use Ctrl+K to connect, Ctrl+L to clear', 'info');
        this.addLine('─'.repeat(60), 'boot');
    }

    updateConnectionStatus(connected) {
        const indicator = document.getElementById('statusIndicator');
        const status = document.getElementById('connectionStatus');
        const btn = document.getElementById('connectBtn');
        
        if (connected) {
            indicator.classList.add('connected');
            status.textContent = 'Connected';
            btn.textContent = 'Disconnect';
        } else {
            indicator.classList.remove('connected');
            status.textContent = 'Disconnected';
            btn.textContent = 'Connect';
        }
    }

    updateCounter() {
        document.getElementById('rxTxCounter').textContent = `RX: ${this.rxCount} | TX: ${this.txCount}`;
    }

    updateStatus(text) {
        document.getElementById('statusText').textContent = text;
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === tabName);
        });
    }

    exportLog() {
        const terminal = document.getElementById('terminal');
        const text = terminal.innerText;
        
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `velocitydrive-terminal-${Date.now()}.log`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.addLine('✅ Log exported', 'info');
    }

    saveConfig() {
        const config = {
            baudRate: document.getElementById('baudRate').value,
            lineEnding: document.getElementById('lineEnding')?.value,
            dataBits: document.getElementById('dataBits')?.value,
            stopBits: document.getElementById('stopBits')?.value,
            parity: document.getElementById('parity')?.value,
            yaml: document.getElementById('yamlInput')?.value
        };
        
        localStorage.setItem('velocitydrive-terminal-config', JSON.stringify(config));
        this.addLine('✅ Configuration saved', 'info');
    }

    loadConfig() {
        const saved = localStorage.getItem('velocitydrive-terminal-config');
        if (saved) {
            try {
                const config = JSON.parse(saved);
                
                if (config.baudRate) document.getElementById('baudRate').value = config.baudRate;
                if (config.lineEnding) document.getElementById('lineEnding').value = config.lineEnding;
                if (config.dataBits) document.getElementById('dataBits').value = config.dataBits;
                if (config.stopBits) document.getElementById('stopBits').value = config.stopBits;
                if (config.parity) document.getElementById('parity').value = config.parity;
                if (config.yaml) document.getElementById('yamlInput').value = config.yaml;
                
                this.addLine('✅ Configuration loaded', 'info');
            } catch (error) {
                this.addLine('❌ Failed to load configuration', 'error');
            }
        }
    }
}

// Global functions for button onclick handlers
function sendCommand(cmd) {
    if (window.terminal && window.terminal.isConnected) {
        window.terminal.sendData(cmd);
    } else {
        alert('Not connected to device');
    }
}

function sendCustomCommand() {
    const cmd = document.getElementById('customCommand').value;
    if (cmd) {
        sendCommand(cmd);
        document.getElementById('customCommand').value = '';
    }
}

function applyPortConfig() {
    const port = document.getElementById('portNumber').value;
    const speed = document.getElementById('portSpeed').value;
    const duplex = document.getElementById('portDuplex').value;
    
    // Convert to AT commands
    const commands = [
        `AT+PORTCFG=${port},${speed},${duplex}`,
        `AT+APPLY`
    ];
    
    commands.forEach(cmd => sendCommand(cmd));
}

function applyCBSConfig() {
    const tc = document.getElementById('cbsTC').value;
    const idleSlope = document.getElementById('cbsIdleSlope').value;
    const sendSlope = document.getElementById('cbsSendSlope').value;
    
    // Convert to AT commands
    const commands = [
        `AT+CBS=${tc},${idleSlope},${sendSlope}`,
        `AT+APPLY`
    ];
    
    commands.forEach(cmd => sendCommand(cmd));
}

function validateYAML() {
    const yaml = document.getElementById('yamlInput').value;
    try {
        // Basic YAML validation (you can enhance this)
        if (yaml.includes(':') && yaml.includes('\n')) {
            document.getElementById('yamlOutput').style.display = 'block';
            document.getElementById('yamlOutput').textContent = '✅ YAML appears valid';
        } else {
            throw new Error('Invalid YAML structure');
        }
    } catch (error) {
        document.getElementById('yamlOutput').style.display = 'block';
        document.getElementById('yamlOutput').textContent = `❌ Validation error: ${error.message}`;
    }
}

function convertYAML() {
    const yaml = document.getElementById('yamlInput').value;
    const output = document.getElementById('yamlOutput');
    
    // Parse YAML and convert to commands
    const commands = [];
    
    // Simple parsing for demonstration
    const lines = yaml.split('\n');
    let currentSection = '';
    
    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        
        if (trimmed === 'ports:') {
            currentSection = 'ports';
        } else if (trimmed === 'tsn:') {
            currentSection = 'tsn';
        } else if (trimmed === 'vlans:') {
            currentSection = 'vlans';
        } else if (currentSection === 'ports' && trimmed.includes('number:')) {
            const port = trimmed.split(':')[1].trim();
            commands.push(`# Configure port ${port}`);
        } else if (currentSection === 'tsn' && trimmed.includes('idle_slope:')) {
            const value = trimmed.split(':')[1].trim();
            commands.push(`AT+CBS_IDLE=${value}`);
        }
    });
    
    if (commands.length === 0) {
        commands.push('# No commands generated from YAML');
    }
    
    output.style.display = 'block';
    output.textContent = 'Generated Commands:\n' + commands.join('\n');
}

function applyYAML() {
    const yaml = document.getElementById('yamlInput').value;
    
    // Convert YAML to device commands
    convertYAML();
    
    // Send commands
    const output = document.getElementById('yamlOutput').textContent;
    const commands = output.split('\n').filter(line => 
        line.startsWith('AT+') && !line.startsWith('#')
    );
    
    if (commands.length > 0) {
        if (confirm(`Apply ${commands.length} commands to device?`)) {
            commands.forEach(cmd => sendCommand(cmd));
        }
    } else {
        alert('No valid commands to apply');
    }
}

function exportLog() {
    if (window.terminal) {
        window.terminal.exportLog();
    }
}

function saveConfig() {
    if (window.terminal) {
        window.terminal.saveConfig();
    }
}

function loadConfig() {
    if (window.terminal) {
        window.terminal.loadConfig();
    }
}

// Initialize terminal
document.addEventListener('DOMContentLoaded', () => {
    window.terminal = new VelocityDriveTerminal();
});