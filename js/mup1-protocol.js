/**
 * MUP1 Protocol Implementation
 * Microchip UART Protocol #1
 * Frame format: >TYPE[DATA]<[<]CHECKSUM
 */

class MUP1Protocol {
    constructor() {
        this.SOF = 0x3E; // '>'
        this.EOF = 0x3C; // '<'
        this.ESCAPE = 0x5C; // '\'
        
        // Command types
        this.COMMANDS = {
            PING: 'p',
            PONG: 'P',
            COAP: 'c',
            COAP_RESPONSE: 'C',
            AT: 'A',
            TEXT: 'T',
            STATUS: 'S'
        };
    }

    /**
     * Calculate 16-bit one's complement checksum
     */
    calculateChecksum(data) {
        let sum = 0;
        for (let i = 0; i < data.length; i += 2) {
            if (i + 1 < data.length) {
                sum += (data[i] << 8) | data[i + 1];
            } else {
                sum += data[i] << 8;
            }
        }
        
        // Add carry bits
        while (sum >> 16) {
            sum = (sum & 0xFFFF) + (sum >> 16);
        }
        
        // One's complement
        return (~sum) & 0xFFFF;
    }

    /**
     * Escape special characters in data
     */
    escapeData(data) {
        const escaped = [];
        const specialChars = [this.SOF, this.EOF, this.ESCAPE];
        
        for (const byte of data) {
            if (specialChars.includes(byte)) {
                escaped.push(this.ESCAPE);
            }
            escaped.push(byte);
        }
        
        return escaped;
    }

    /**
     * Unescape data
     */
    unescapeData(data) {
        const unescaped = [];
        let i = 0;
        
        while (i < data.length) {
            if (data[i] === this.ESCAPE && i + 1 < data.length) {
                i++; // Skip escape character
            }
            unescaped.push(data[i]);
            i++;
        }
        
        return unescaped;
    }

    /**
     * Create MUP1 frame
     */
    createFrame(type, data = []) {
        const frame = [];
        
        // Start of frame
        frame.push(this.SOF);
        
        // Command type
        frame.push(type.charCodeAt(0));
        
        // Escaped data
        if (data.length > 0) {
            frame.push(...this.escapeData(data));
        }
        
        // End of frame (double for even-sized frames)
        frame.push(this.EOF);
        if ((frame.length + 4) % 2 === 0) {
            frame.push(this.EOF);
        }
        
        // Calculate checksum on the entire frame so far
        const checksum = this.calculateChecksum(frame);
        
        // Add checksum as hex string
        const checksumStr = checksum.toString(16).padStart(4, '0');
        for (let i = 0; i < checksumStr.length; i++) {
            frame.push(checksumStr.charCodeAt(i));
        }
        
        return new Uint8Array(frame);
    }

    /**
     * Parse MUP1 frame
     */
    parseFrame(buffer) {
        const data = new Uint8Array(buffer);
        
        // Find start of frame
        let startIdx = -1;
        for (let i = 0; i < data.length; i++) {
            if (data[i] === this.SOF) {
                startIdx = i;
                break;
            }
        }
        
        if (startIdx === -1) {
            throw new Error('No start of frame found');
        }
        
        // Find end of frame
        let endIdx = -1;
        let eofCount = 0;
        for (let i = startIdx + 1; i < data.length; i++) {
            if (data[i] === this.EOF && (i === 0 || data[i-1] !== this.ESCAPE)) {
                eofCount++;
                if (eofCount === 1) {
                    endIdx = i;
                }
                // Check for double EOF
                if (i + 1 < data.length && data[i + 1] === this.EOF) {
                    endIdx = i + 1;
                    break;
                }
                if (eofCount === 1) {
                    break;
                }
            }
        }
        
        if (endIdx === -1) {
            throw new Error('No end of frame found');
        }
        
        // Extract checksum (last 4 bytes after EOF)
        const checksumStart = endIdx + 1;
        if (checksumStart + 4 > data.length) {
            throw new Error('Incomplete checksum');
        }
        
        const checksumStr = String.fromCharCode(...data.slice(checksumStart, checksumStart + 4));
        const receivedChecksum = parseInt(checksumStr, 16);
        
        // Verify checksum
        const frameData = data.slice(startIdx, endIdx + 1);
        const calculatedChecksum = this.calculateChecksum(frameData);
        
        if (calculatedChecksum !== receivedChecksum) {
            console.warn(`Checksum mismatch: calculated ${calculatedChecksum.toString(16)}, received ${receivedChecksum.toString(16)}`);
        }
        
        // Extract command type
        const commandType = String.fromCharCode(data[startIdx + 1]);
        
        // Extract and unescape payload
        const payloadStart = startIdx + 2;
        const payloadEnd = endIdx;
        let payload = [];
        
        if (payloadEnd > payloadStart) {
            const escapedPayload = Array.from(data.slice(payloadStart, payloadEnd));
            // Remove EOF markers from payload
            while (escapedPayload.length > 0 && escapedPayload[escapedPayload.length - 1] === this.EOF) {
                escapedPayload.pop();
            }
            if (escapedPayload.length > 0) {
                payload = this.unescapeData(escapedPayload);
            }
        }
        
        return {
            type: commandType,
            data: new Uint8Array(payload),
            checksum: receivedChecksum,
            checksumValid: calculatedChecksum === receivedChecksum
        };
    }

    /**
     * Create ping command
     */
    createPing() {
        return this.createFrame(this.COMMANDS.PING);
    }

    /**
     * Parse pong response
     */
    parsePong(frame) {
        if (frame.type !== this.COMMANDS.PONG) {
            throw new Error('Not a PONG response');
        }
        
        const text = new TextDecoder().decode(frame.data);
        // Parse version info from pong response
        // Format: "VelocitySP-v2025.06-LAN9662-ung8291 248 300 2"
        const parts = text.split(' ');
        
        return {
            version: parts[0] || 'Unknown',
            info1: parts[1] || '',
            info2: parts[2] || '',
            info3: parts[3] || '',
            raw: text
        };
    }

    /**
     * Create CoAP frame
     */
    createCoAPFrame(coapData) {
        return this.createFrame(this.COMMANDS.COAP, Array.from(coapData));
    }

    /**
     * Parse CoAP response
     */
    parseCoAPResponse(frame) {
        if (frame.type !== this.COMMANDS.COAP_RESPONSE) {
            throw new Error('Not a CoAP response');
        }
        
        return frame.data;
    }

    /**
     * Helper to convert hex string to byte array
     */
    hexToBytes(hex) {
        const bytes = [];
        for (let i = 0; i < hex.length; i += 2) {
            bytes.push(parseInt(hex.substr(i, 2), 16));
        }
        return bytes;
    }

    /**
     * Helper to convert byte array to hex string
     */
    bytesToHex(bytes) {
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join(' ')
            .toUpperCase();
    }
}

// Export for use in other modules
window.MUP1Protocol = MUP1Protocol;