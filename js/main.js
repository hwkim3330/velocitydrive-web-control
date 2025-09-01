/**
 * Main Application Controller
 * Handles UI interactions and coordinates between modules
 */

class VelocityDriveController {
    constructor() {
        this.serialHandler = new SerialHandler();
        this.coapClient = new CoAPClient();
        this.cborEncoder = new CBOREncoder();
        this.yamlParser = new YAMLParser();
        
        this.deviceInfo = null;
        this.isConnected = false;
        this.logEntries = [];
        
        this.init();
    }

    /**
     * Initialize application
     */
    init() {
        this.setupEventListeners();
        this.setupSerialHandlers();
        this.setupUIHandlers();
        this.loadSavedConfig();
        
        // Check WebSerial support
        if (!this.serialHandler.isSupported()) {
            this.showError('WebSerial API is not supported. Please use Chrome or Edge browser.');
            document.getElementById('connectBtn').disabled = true;
        }
    }

    /**
     * Setup serial event handlers
     */
    setupSerialHandlers() {
        // Connection events
        this.serialHandler.on('connect', (info) => {
            this.isConnected = true;
            this.updateConnectionStatus(true);
            this.log('Connected to serial port', 'info');
            document.getElementById('portName').textContent = 'Connected';
            document.getElementById('baudRate').textContent = info.baudRate;
        });

        this.serialHandler.on('disconnect', () => {
            this.isConnected = false;
            this.updateConnectionStatus(false);
            this.log('Disconnected from serial port', 'info');
            document.getElementById('portName').textContent = 'Not connected';
            document.getElementById('deviceInfo').textContent = 'Unknown';
        });

        // Device info from PONG
        this.serialHandler.on('device-info', (info) => {
            this.deviceInfo = info;
            document.getElementById('deviceInfo').textContent = info.version || 'Unknown';
            this.log(`Device: ${info.raw}`, 'info');
        });

        // CoAP responses
        this.serialHandler.on('coap-response', (data) => {
            this.handleCoAPResponse(data);
        });

        // Raw data logging
        this.serialHandler.on('raw-send', (data) => {
            this.log(`TX: ${data.hex}`, 'send');
        });

        this.serialHandler.on('raw-receive', (data) => {
            this.log(`RX: ${data.hex}`, 'receive');
        });

        // Errors
        this.serialHandler.on('error', (error) => {
            this.log(`Error: ${error.message}`, 'error');
            this.showError(error.message);
        });
    }

    /**
     * Setup UI event handlers
     */
    setupUIHandlers() {
        // Connection button
        document.getElementById('connectBtn').addEventListener('click', () => {
            this.toggleConnection();
        });

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Basic controls
        document.getElementById('pingBtn').addEventListener('click', () => {
            this.sendPing();
        });

        document.getElementById('getVersionBtn').addEventListener('click', () => {
            this.getVersion();
        });

        document.getElementById('getStatusBtn').addEventListener('click', () => {
            this.getStatus();
        });

        document.getElementById('resetBtn').addEventListener('click', () => {
            this.resetDevice();
        });

        document.getElementById('applyPortConfig').addEventListener('click', () => {
            this.applyPortConfiguration();
        });

        // TSN configuration
        document.getElementById('applyCBS').addEventListener('click', () => {
            this.applyCBSConfiguration();
        });

        document.getElementById('applyTAS').addEventListener('click', () => {
            this.applyTASConfiguration();
        });

        document.getElementById('applyPTP').addEventListener('click', () => {
            this.applyPTPConfiguration();
        });

        document.getElementById('addGateEntry').addEventListener('click', () => {
            this.addGateControlEntry();
        });

        // YAML configuration
        document.getElementById('validateYaml').addEventListener('click', () => {
            this.validateYAML();
        });

        document.getElementById('loadYaml').addEventListener('click', () => {
            document.getElementById('yamlFileInput').click();
        });

        document.getElementById('yamlFileInput').addEventListener('change', (e) => {
            this.loadYAMLFile(e.target.files[0]);
        });

        document.getElementById('applyYaml').addEventListener('click', () => {
            this.applyYAMLConfiguration();
        });

        // CoAP controls
        document.getElementById('sendCoap').addEventListener('click', () => {
            this.sendCoAPRequest();
        });

        // Raw MUP1 controls
        document.getElementById('sendMup1').addEventListener('click', () => {
            this.sendRawMUP1();
        });

        // Monitor controls
        document.getElementById('clearLog').addEventListener('click', () => {
            this.clearLog();
        });

        document.getElementById('exportLog').addEventListener('click', () => {
            this.exportLog();
        });

        // Initialize gate control list
        this.addGateControlEntry();
    }

    /**
     * Setup general event listeners
     */
    setupEventListeners() {
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+K to connect/disconnect
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                this.toggleConnection();
            }
            // Ctrl+L to clear log
            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                this.clearLog();
            }
        });
    }

    /**
     * Toggle serial connection
     */
    async toggleConnection() {
        if (this.isConnected) {
            await this.serialHandler.disconnect();
            document.getElementById('connectBtn').textContent = 'Connect Serial';
        } else {
            try {
                await this.serialHandler.connect(115200);
                document.getElementById('connectBtn').textContent = 'Disconnect';
            } catch (error) {
                this.showError(`Connection failed: ${error.message}`);
            }
        }
    }

    /**
     * Update connection status indicator
     */
    updateConnectionStatus(connected) {
        const status = document.getElementById('status');
        if (connected) {
            status.textContent = '● Connected';
            status.className = 'connected';
        } else {
            status.textContent = '● Disconnected';
            status.className = 'disconnected';
        }
    }

    /**
     * Switch tab
     */
    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === tabName);
        });
    }

    /**
     * Send ping command
     */
    async sendPing() {
        if (!this.isConnected) {
            this.showError('Not connected to device');
            return;
        }

        try {
            await this.serialHandler.ping();
            this.showResponse('Ping sent, waiting for response...');
        } catch (error) {
            this.showError(`Ping failed: ${error.message}`);
        }
    }

    /**
     * Get device version
     */
    async getVersion() {
        if (!this.isConnected) {
            this.showError('Not connected to device');
            return;
        }

        // Send CoAP GET request for system info
        const message = this.coapClient.createGET('/ietf-system:system-state/platform');
        await this.serialHandler.sendCoAP(message.bytes);
        this.showResponse('Getting version information...');
    }

    /**
     * Get device status
     */
    async getStatus() {
        if (!this.isConnected) {
            this.showError('Not connected to device');
            return;
        }

        // Send status request
        await this.serialHandler.sendFrame('S');
        this.showResponse('Getting device status...');
    }

    /**
     * Reset device
     */
    async resetDevice() {
        if (!this.isConnected) {
            this.showError('Not connected to device');
            return;
        }

        if (!confirm('Are you sure you want to reset the device?')) {
            return;
        }

        // Send reset command
        await this.serialHandler.sendAT('AT+RESET');
        this.showResponse('Reset command sent');
    }

    /**
     * Apply port configuration
     */
    async applyPortConfiguration() {
        if (!this.isConnected) {
            this.showError('Not connected to device');
            return;
        }

        const port = document.getElementById('portSelect').value;
        const speed = document.getElementById('speedSelect').value;
        const duplex = document.getElementById('duplexSelect').value;

        // Create configuration object
        const config = {
            port: parseInt(port),
            speed: speed === 'auto' ? 0 : parseInt(speed),
            duplex: duplex === 'auto' ? 2 : (duplex === 'full' ? 1 : 0)
        };

        // Send configuration via CoAP
        const payload = this.cborEncoder.encode(config);
        const message = this.coapClient.createPOST(`/interfaces/port${port}`, payload);
        await this.serialHandler.sendCoAP(message.bytes);
        
        this.showResponse(`Configuring port ${port}...`);
    }

    /**
     * Apply CBS configuration
     */
    async applyCBSConfiguration() {
        if (!this.isConnected) {
            this.showError('Not connected to device');
            return;
        }

        const tc = document.getElementById('cbsTC').value;
        const idleSlope = parseInt(document.getElementById('cbsIdleSlope').value);
        const sendSlope = parseInt(document.getElementById('cbsSendSlope').value);

        const config = {
            tc: parseInt(tc),
            idleSlope: idleSlope,
            sendSlope: sendSlope
        };

        const payload = this.cborEncoder.encode(config);
        const message = this.coapClient.createPOST(`/tsn/cbs/tc${tc}`, payload);
        await this.serialHandler.sendCoAP(message.bytes);
        
        this.showResponse(`Configuring CBS for TC${tc}...`);
    }

    /**
     * Apply TAS configuration
     */
    async applyTASConfiguration() {
        if (!this.isConnected) {
            this.showError('Not connected to device');
            return;
        }

        const cycleTime = parseInt(document.getElementById('tasCycleTime').value);
        const baseTime = document.getElementById('tasBaseTime').value;
        
        // Collect gate control entries
        const gcl = [];
        document.querySelectorAll('.gate-entry').forEach(entry => {
            const states = entry.querySelector('.gate-states').value;
            const interval = entry.querySelector('.time-interval').value;
            if (states && interval) {
                gcl.push({
                    gateStates: parseInt(states, 16),
                    timeInterval: parseInt(interval)
                });
            }
        });

        const config = {
            cycleTime: cycleTime,
            baseTime: baseTime ? new Date(baseTime).getTime() : 0,
            gateControlList: gcl
        };

        const payload = this.cborEncoder.encode(config);
        const message = this.coapClient.createPOST('/tsn/tas', payload);
        await this.serialHandler.sendCoAP(message.bytes);
        
        this.showResponse('Configuring TAS...');
    }

    /**
     * Apply PTP configuration
     */
    async applyPTPConfiguration() {
        if (!this.isConnected) {
            this.showError('Not connected to device');
            return;
        }

        const profile = document.getElementById('ptpProfile').value;
        const domain = parseInt(document.getElementById('ptpDomain').value);

        const config = {
            profile: profile,
            domain: domain
        };

        const payload = this.cborEncoder.encode(config);
        const message = this.coapClient.createPOST('/tsn/ptp', payload);
        await this.serialHandler.sendCoAP(message.bytes);
        
        this.showResponse('Configuring PTP...');
    }

    /**
     * Add gate control entry
     */
    addGateControlEntry() {
        const container = document.getElementById('gateControlEntries');
        const entry = document.createElement('div');
        entry.className = 'gate-entry';
        entry.innerHTML = `
            <input type="text" class="gate-states" placeholder="Gate states (hex, e.g., 0xFF)">
            <input type="number" class="time-interval" placeholder="Time interval (μs)">
            <button onclick="this.parentElement.remove()">Remove</button>
        `;
        container.appendChild(entry);
    }

    /**
     * Validate YAML configuration
     */
    validateYAML() {
        const yamlText = document.getElementById('yamlInput').value;
        const result = this.yamlParser.validate(yamlText);
        
        if (result.valid) {
            this.showResponse('YAML configuration is valid');
        } else {
            this.showError(`YAML validation error: ${result.error}`);
        }
    }

    /**
     * Load YAML file
     */
    async loadYAMLFile(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('yamlInput').value = e.target.result;
            this.showResponse(`Loaded ${file.name}`);
        };
        reader.onerror = () => {
            this.showError('Failed to read file');
        };
        reader.readAsText(file);
    }

    /**
     * Apply YAML configuration
     */
    async applyYAMLConfiguration() {
        if (!this.isConnected) {
            this.showError('Not connected to device');
            return;
        }

        const yamlText = document.getElementById('yamlInput').value;
        
        try {
            const yamlObj = this.yamlParser.parse(yamlText);
            const config = this.yamlParser.convertTSNConfig(yamlObj);
            
            // Send configuration to device
            const payload = this.cborEncoder.encode(config);
            const message = this.coapClient.createPOST('/config/apply', payload);
            await this.serialHandler.sendCoAP(message.bytes);
            
            this.showResponse('YAML configuration applied');
        } catch (error) {
            this.showError(`Failed to apply YAML: ${error.message}`);
        }
    }

    /**
     * Send CoAP request
     */
    async sendCoAPRequest() {
        if (!this.isConnected) {
            this.showError('Not connected to device');
            return;
        }

        const method = document.getElementById('coapMethod').value;
        const path = document.getElementById('coapPath').value;
        const payloadText = document.getElementById('coapPayload').value;

        let message;
        let payload = null;

        if (payloadText) {
            try {
                const payloadObj = JSON.parse(payloadText);
                payload = this.cborEncoder.encode(payloadObj);
            } catch (error) {
                this.showError('Invalid JSON payload');
                return;
            }
        }

        switch (method) {
            case 'GET':
                message = this.coapClient.createGET(path);
                break;
            case 'POST':
                message = this.coapClient.createPOST(path, payload);
                break;
            case 'PUT':
                message = this.coapClient.createMessage(
                    this.coapClient.TYPE.CON,
                    this.coapClient.METHOD.PUT,
                    { 'uri-path': path, payload }
                );
                break;
            case 'DELETE':
                message = this.coapClient.createMessage(
                    this.coapClient.TYPE.CON,
                    this.coapClient.METHOD.DELETE,
                    { 'uri-path': path }
                );
                break;
            case 'FETCH':
                message = this.coapClient.createFETCH(path, payload);
                break;
        }

        await this.serialHandler.sendCoAP(message.bytes);
        this.showResponse(`Sent CoAP ${method} request to ${path}`);
    }

    /**
     * Send raw MUP1 command
     */
    async sendRawMUP1() {
        if (!this.isConnected) {
            this.showError('Not connected to device');
            return;
        }

        const type = document.getElementById('mup1Type').value;
        const hexData = document.getElementById('mup1Data').value;
        
        let data = [];
        if (hexData) {
            // Convert hex string to bytes
            const hex = hexData.replace(/\s/g, '');
            for (let i = 0; i < hex.length; i += 2) {
                data.push(parseInt(hex.substr(i, 2), 16));
            }
        }

        await this.serialHandler.sendFrame(type, data);
        this.showResponse(`Sent MUP1 command: ${type}`);
    }

    /**
     * Handle CoAP response
     */
    handleCoAPResponse(data) {
        try {
            const response = this.coapClient.parseMessage(data);
            
            let content = `CoAP Response:\n`;
            content += `Type: ${response.type}\n`;
            content += `Code: ${response.codeClass}.${response.codeDetail.toString().padStart(2, '0')}\n`;
            content += `Message ID: ${response.messageId}\n`;
            
            if (response.payload) {
                try {
                    const decoded = this.cborEncoder.decode(response.payload);
                    content += `Payload: ${JSON.stringify(decoded, null, 2)}`;
                } catch (e) {
                    content += `Raw payload: ${Array.from(response.payload).map(b => b.toString(16).padStart(2, '0')).join(' ')}`;
                }
            }
            
            this.showResponse(content);
        } catch (error) {
            this.showError(`Failed to parse CoAP response: ${error.message}`);
        }
    }

    /**
     * Log message
     */
    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            fractionalSecondDigits: 3 
        });
        
        const entry = {
            timestamp,
            type,
            message
        };
        
        this.logEntries.push(entry);
        
        // Add to UI
        const container = document.getElementById('logContainer');
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        
        let html = `<span class="log-timestamp">${timestamp}</span>`;
        html += `<span class="log-type">${type.toUpperCase()}</span>`;
        html += `<span class="log-data">${this.escapeHtml(message)}</span>`;
        
        // Add hex view for send/receive
        if ((type === 'send' || type === 'receive') && document.getElementById('showHex').checked) {
            const hexMatch = message.match(/[0-9A-F]{2}(\s[0-9A-F]{2})*/i);
            if (hexMatch) {
                html += `<div class="log-hex">${hexMatch[0]}</div>`;
            }
        }
        
        logEntry.innerHTML = html;
        container.appendChild(logEntry);
        
        // Auto-scroll
        if (document.getElementById('autoScroll').checked) {
            container.scrollTop = container.scrollHeight;
        }
        
        // Limit log size
        if (this.logEntries.length > 1000) {
            this.logEntries.shift();
            container.removeChild(container.firstChild);
        }
    }

    /**
     * Clear log
     */
    clearLog() {
        this.logEntries = [];
        document.getElementById('logContainer').innerHTML = '';
        this.log('Log cleared', 'info');
    }

    /**
     * Export log
     */
    exportLog() {
        const content = this.logEntries.map(entry => 
            `${entry.timestamp} [${entry.type}] ${entry.message}`
        ).join('\n');
        
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `velocitydrive-log-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.showResponse('Log exported');
    }

    /**
     * Show response
     */
    showResponse(message) {
        const display = document.getElementById('responseDisplay');
        display.innerHTML = `<pre>${this.escapeHtml(message)}</pre>`;
    }

    /**
     * Show error
     */
    showError(message) {
        const display = document.getElementById('responseDisplay');
        display.innerHTML = `<pre style="color: #f44336;">ERROR: ${this.escapeHtml(message)}</pre>`;
        this.log(message, 'error');
    }

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Load saved configuration
     */
    loadSavedConfig() {
        // Load from localStorage if available
        const saved = localStorage.getItem('velocitydrive-config');
        if (saved) {
            try {
                const config = JSON.parse(saved);
                // Apply saved configuration to UI
                if (config.yaml) {
                    document.getElementById('yamlInput').value = config.yaml;
                }
            } catch (error) {
                console.error('Failed to load saved config:', error);
            }
        }
        
        // Load example YAML
        const example = this.yamlParser.generateExample();
        if (!document.getElementById('yamlInput').value) {
            document.getElementById('yamlInput').value = example;
        }
    }

    /**
     * Save configuration
     */
    saveConfig() {
        const config = {
            yaml: document.getElementById('yamlInput').value
        };
        localStorage.setItem('velocitydrive-config', JSON.stringify(config));
    }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new VelocityDriveController();
    console.log('VelocityDRIVE Web Control initialized');
});