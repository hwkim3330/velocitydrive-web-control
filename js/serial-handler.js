/**
 * WebSerial API Handler
 * Manages serial port communication with the LAN9662 device
 */

class SerialHandler {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.isConnected = false;
        this.listeners = {};
        this.readBuffer = [];
        this.mup1Protocol = new MUP1Protocol();
    }

    /**
     * Check if WebSerial is supported
     */
    isSupported() {
        return 'serial' in navigator;
    }

    /**
     * Connect to serial port
     */
    async connect(baudRate = 115200) {
        if (!this.isSupported()) {
            throw new Error('WebSerial API is not supported in this browser. Please use Chrome or Edge.');
        }

        try {
            // Request port access
            this.port = await navigator.serial.requestPort();
            
            // Open port with specified baud rate
            await this.port.open({ 
                baudRate: baudRate,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                flowControl: 'none'
            });

            // Setup reader and writer
            const textEncoder = new TextEncoderStream();
            const writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
            this.writer = textEncoder.writable.getWriter();

            // Start reading
            this.isConnected = true;
            this.startReading();
            
            // Get port info
            const info = await this.port.getInfo();
            
            this.emit('connect', {
                baudRate: baudRate,
                vendorId: info.usbVendorId,
                productId: info.usbProductId
            });

            // Send initial ping
            setTimeout(() => this.ping(), 100);

            return true;
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Disconnect from serial port
     */
    async disconnect() {
        if (!this.isConnected) return;

        try {
            this.isConnected = false;
            
            if (this.reader) {
                await this.reader.cancel();
                this.reader = null;
            }

            if (this.writer) {
                await this.writer.close();
                this.writer = null;
            }

            if (this.port) {
                await this.port.close();
                this.port = null;
            }

            this.emit('disconnect');
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Start reading from serial port
     */
    async startReading() {
        while (this.port.readable && this.isConnected) {
            this.reader = this.port.readable.getReader();
            
            try {
                while (true) {
                    const { value, done } = await this.reader.read();
                    if (done) break;
                    
                    // Add to buffer
                    this.readBuffer.push(...value);
                    
                    // Try to parse MUP1 frames
                    this.processBuffer();
                }
            } catch (error) {
                this.emit('error', error);
            } finally {
                if (this.reader) {
                    this.reader.releaseLock();
                    this.reader = null;
                }
            }
        }
    }

    /**
     * Process read buffer for complete MUP1 frames
     */
    processBuffer() {
        // Look for complete frame (SOF to checksum)
        const SOF = 0x3E; // '>'
        const EOF = 0x3C; // '<'
        
        // Find start of frame
        let startIdx = this.readBuffer.indexOf(SOF);
        if (startIdx === -1) return;
        
        // Remove data before SOF
        if (startIdx > 0) {
            this.readBuffer.splice(0, startIdx);
            startIdx = 0;
        }
        
        // Look for end of frame and checksum
        let eofIdx = -1;
        for (let i = startIdx + 2; i < this.readBuffer.length; i++) {
            if (this.readBuffer[i] === EOF) {
                // Check if it's double EOF
                if (i + 1 < this.readBuffer.length && this.readBuffer[i + 1] === EOF) {
                    eofIdx = i + 1;
                } else {
                    eofIdx = i;
                }
                
                // Check if we have checksum (4 bytes after EOF)
                if (eofIdx + 4 < this.readBuffer.length) {
                    // We have a complete frame
                    const frameEnd = eofIdx + 5; // Include checksum
                    const frameData = this.readBuffer.slice(0, frameEnd);
                    
                    // Remove frame from buffer
                    this.readBuffer.splice(0, frameEnd);
                    
                    // Parse and emit frame
                    try {
                        const frame = this.mup1Protocol.parseFrame(frameData);
                        this.handleFrame(frame);
                        
                        // Log raw data
                        this.emit('raw-receive', {
                            data: frameData,
                            hex: this.mup1Protocol.bytesToHex(frameData)
                        });
                    } catch (error) {
                        console.error('Error parsing frame:', error);
                        this.emit('error', error);
                    }
                    
                    // Process remaining buffer
                    if (this.readBuffer.length > 0) {
                        this.processBuffer();
                    }
                    
                    break;
                }
            }
        }
    }

    /**
     * Handle parsed MUP1 frame
     */
    handleFrame(frame) {
        console.log('Received frame:', frame);
        
        switch (frame.type) {
            case 'P': // PONG response
                const pongData = this.mup1Protocol.parsePong(frame);
                this.emit('pong', pongData);
                this.emit('device-info', pongData);
                break;
                
            case 'C': // CoAP response
                this.emit('coap-response', frame.data);
                break;
                
            case 'A': // AT response
                const text = new TextDecoder().decode(frame.data);
                this.emit('at-response', text);
                break;
                
            case 'T': // Text message
                const message = new TextDecoder().decode(frame.data);
                this.emit('text', message);
                break;
                
            case 'S': // Status
                this.emit('status', frame.data);
                break;
                
            default:
                this.emit('unknown-frame', frame);
        }
        
        // Emit generic frame event
        this.emit('frame', frame);
    }

    /**
     * Send raw data
     */
    async sendRaw(data) {
        if (!this.isConnected || !this.writer) {
            throw new Error('Not connected to serial port');
        }

        try {
            // Convert data to Uint8Array if needed
            let bytes = data;
            if (!(data instanceof Uint8Array)) {
                bytes = new Uint8Array(data);
            }

            // Send data
            await this.port.writable.getWriter().write(bytes);
            
            // Log raw data
            this.emit('raw-send', {
                data: bytes,
                hex: this.mup1Protocol.bytesToHex(bytes)
            });
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Send MUP1 frame
     */
    async sendFrame(type, data = []) {
        const frame = this.mup1Protocol.createFrame(type, data);
        await this.sendRaw(frame);
    }

    /**
     * Send ping command
     */
    async ping() {
        const frame = this.mup1Protocol.createPing();
        await this.sendRaw(frame);
    }

    /**
     * Send CoAP data
     */
    async sendCoAP(coapData) {
        const frame = this.mup1Protocol.createCoAPFrame(coapData);
        await this.sendRaw(frame);
    }

    /**
     * Send AT command
     */
    async sendAT(command) {
        const data = new TextEncoder().encode(command);
        await this.sendFrame('A', Array.from(data));
    }

    /**
     * Add event listener
     */
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        if (!this.listeners[event]) return;
        
        const index = this.listeners[event].indexOf(callback);
        if (index !== -1) {
            this.listeners[event].splice(index, 1);
        }
    }

    /**
     * Emit event
     */
    emit(event, data) {
        if (!this.listeners[event]) return;
        
        this.listeners[event].forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in event listener for ${event}:`, error);
            }
        });
    }

    /**
     * Get connection status
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            port: this.port ? 'Connected' : 'Not connected',
            bufferSize: this.readBuffer.length
        };
    }
}

// Export for use in other modules
window.SerialHandler = SerialHandler;