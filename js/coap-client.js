/**
 * CoAP Client Implementation
 * RFC 7252 - Constrained Application Protocol
 */

class CoAPClient {
    constructor() {
        // CoAP message types
        this.TYPE = {
            CON: 0,  // Confirmable
            NON: 1,  // Non-confirmable
            ACK: 2,  // Acknowledgement
            RST: 3   // Reset
        };

        // CoAP method codes (0.XX)
        this.METHOD = {
            EMPTY: 0,
            GET: 1,
            POST: 2,
            PUT: 3,
            DELETE: 4,
            FETCH: 5  // RFC 8132
        };

        // CoAP response codes (X.XX)
        this.RESPONSE_CODE = {
            // 2.XX Success
            CREATED: 65,     // 2.01
            DELETED: 66,     // 2.02
            VALID: 67,       // 2.03
            CHANGED: 68,     // 2.04
            CONTENT: 69,     // 2.05
            
            // 4.XX Client Error
            BAD_REQUEST: 128,        // 4.00
            UNAUTHORIZED: 129,       // 4.01
            BAD_OPTION: 130,        // 4.02
            FORBIDDEN: 131,         // 4.03
            NOT_FOUND: 132,         // 4.04
            METHOD_NOT_ALLOWED: 133, // 4.05
            
            // 5.XX Server Error
            INTERNAL_SERVER_ERROR: 160,  // 5.00
            NOT_IMPLEMENTED: 161,        // 5.01
            BAD_GATEWAY: 162,           // 5.02
            SERVICE_UNAVAILABLE: 163,   // 5.03
            GATEWAY_TIMEOUT: 164        // 5.04
        };

        // CoAP option numbers
        this.OPTION = {
            IF_MATCH: 1,
            URI_HOST: 3,
            ETAG: 4,
            IF_NONE_MATCH: 5,
            URI_PORT: 7,
            LOCATION_PATH: 8,
            URI_PATH: 11,
            CONTENT_FORMAT: 12,
            MAX_AGE: 14,
            URI_QUERY: 15,
            ACCEPT: 17,
            LOCATION_QUERY: 20,
            SIZE2: 28,
            PROXY_URI: 35,
            PROXY_SCHEME: 39,
            SIZE1: 60
        };

        // Content formats
        this.CONTENT_FORMAT = {
            TEXT_PLAIN: 0,
            LINK_FORMAT: 40,
            XML: 41,
            OCTET_STREAM: 42,
            EXI: 47,
            JSON: 50,
            CBOR: 60,
            'YANG_CBOR': 112,  // application/yang-data+cbor
            'YANG_IDENTIFIERS_CBOR_SEQ': 61441, // application/yang-identifiers+cbor-seq
            'YANG_INSTANCES_CBOR_SEQ': 61442    // application/yang-instances+cbor-seq
        };

        this.messageId = 1;
        this.token = 0;
    }

    /**
     * Create CoAP message
     */
    createMessage(type, code, options = {}) {
        const message = [];
        
        // Generate message ID and token
        const messageId = this.messageId++;
        const token = this.generateToken();
        const tokenLength = token.length;

        // Byte 0: Version (2 bits) | Type (2 bits) | Token Length (4 bits)
        const version = 1; // CoAP version 1
        const byte0 = (version << 6) | (type << 4) | tokenLength;
        message.push(byte0);

        // Byte 1: Code (3 bits class | 5 bits detail)
        message.push(code);

        // Bytes 2-3: Message ID
        message.push((messageId >> 8) & 0xFF);
        message.push(messageId & 0xFF);

        // Token (if present)
        if (tokenLength > 0) {
            message.push(...token);
        }

        // Add options
        const optionBytes = this.encodeOptions(options);
        if (optionBytes.length > 0) {
            message.push(...optionBytes);
        }

        // Payload marker and payload (if present)
        if (options.payload) {
            message.push(0xFF); // Payload marker
            
            // Convert payload to bytes
            let payloadBytes;
            if (options.payload instanceof Uint8Array) {
                payloadBytes = options.payload;
            } else if (typeof options.payload === 'string') {
                payloadBytes = new TextEncoder().encode(options.payload);
            } else if (typeof options.payload === 'object') {
                // Assume CBOR encoding needed
                payloadBytes = this.encodeCBOR(options.payload);
            } else {
                payloadBytes = new Uint8Array(options.payload);
            }
            
            message.push(...payloadBytes);
        }

        return {
            bytes: new Uint8Array(message),
            messageId: messageId,
            token: token
        };
    }

    /**
     * Parse CoAP message
     */
    parseMessage(data) {
        const bytes = new Uint8Array(data);
        let offset = 0;

        // Byte 0: Version | Type | Token Length
        const byte0 = bytes[offset++];
        const version = (byte0 >> 6) & 0x03;
        const type = (byte0 >> 4) & 0x03;
        const tokenLength = byte0 & 0x0F;

        // Byte 1: Code
        const code = bytes[offset++];
        const codeClass = (code >> 5) & 0x07;
        const codeDetail = code & 0x1F;

        // Bytes 2-3: Message ID
        const messageId = (bytes[offset++] << 8) | bytes[offset++];

        // Token
        const token = tokenLength > 0 ? bytes.slice(offset, offset + tokenLength) : new Uint8Array(0);
        offset += tokenLength;

        // Parse options
        const { options, newOffset } = this.parseOptions(bytes, offset);
        offset = newOffset;

        // Check for payload
        let payload = null;
        if (offset < bytes.length && bytes[offset] === 0xFF) {
            offset++; // Skip payload marker
            payload = bytes.slice(offset);
        }

        return {
            version,
            type,
            code,
            codeClass,
            codeDetail,
            messageId,
            token,
            options,
            payload
        };
    }

    /**
     * Encode CoAP options
     */
    encodeOptions(options) {
        const encoded = [];
        let lastOptionNumber = 0;
        
        // Sort options by number
        const sortedOptions = Object.entries(options)
            .filter(([key]) => key !== 'payload')
            .map(([key, value]) => {
                const optionNumber = this.getOptionNumber(key);
                return { number: optionNumber, value };
            })
            .sort((a, b) => a.number - b.number);

        for (const option of sortedOptions) {
            const delta = option.number - lastOptionNumber;
            lastOptionNumber = option.number;

            // Encode option value
            let valueBytes;
            if (typeof option.value === 'string') {
                valueBytes = new TextEncoder().encode(option.value);
            } else if (typeof option.value === 'number') {
                valueBytes = this.encodeNumber(option.value);
            } else {
                valueBytes = new Uint8Array(option.value);
            }

            // Encode option header
            const length = valueBytes.length;
            
            if (delta < 13 && length < 13) {
                // Both fit in one byte
                encoded.push((delta << 4) | length);
            } else {
                // Extended delta or length
                let headerByte = 0;
                
                // Handle delta
                if (delta < 13) {
                    headerByte = delta << 4;
                } else if (delta < 269) {
                    headerByte = 13 << 4;
                    encoded.push(headerByte | (length < 13 ? length : (length < 269 ? 13 : 14)));
                    encoded.push(delta - 13);
                } else {
                    headerByte = 14 << 4;
                    encoded.push(headerByte | (length < 13 ? length : (length < 269 ? 13 : 14)));
                    encoded.push((delta - 269) >> 8);
                    encoded.push((delta - 269) & 0xFF);
                }

                // Handle length (if not already added)
                if (delta < 13) {
                    if (length < 13) {
                        encoded.push(headerByte | length);
                    } else if (length < 269) {
                        encoded.push(headerByte | 13);
                        encoded.push(length - 13);
                    } else {
                        encoded.push(headerByte | 14);
                        encoded.push((length - 269) >> 8);
                        encoded.push((length - 269) & 0xFF);
                    }
                } else if (length >= 269) {
                    encoded.push((length - 269) >> 8);
                    encoded.push((length - 269) & 0xFF);
                } else if (length >= 13) {
                    encoded.push(length - 13);
                }
            }

            // Add option value
            encoded.push(...valueBytes);
        }

        return encoded;
    }

    /**
     * Parse CoAP options
     */
    parseOptions(bytes, offset) {
        const options = {};
        let currentOption = 0;

        while (offset < bytes.length && bytes[offset] !== 0xFF) {
            const byte = bytes[offset++];
            
            let delta = (byte >> 4) & 0x0F;
            let length = byte & 0x0F;

            // Handle extended delta
            if (delta === 13) {
                delta = 13 + bytes[offset++];
            } else if (delta === 14) {
                delta = 269 + (bytes[offset++] << 8) + bytes[offset++];
            } else if (delta === 15) {
                break; // Reserved value, stop parsing
            }

            // Handle extended length
            if (length === 13) {
                length = 13 + bytes[offset++];
            } else if (length === 14) {
                length = 269 + (bytes[offset++] << 8) + bytes[offset++];
            } else if (length === 15) {
                break; // Reserved value, stop parsing
            }

            currentOption += delta;
            
            // Extract option value
            const value = bytes.slice(offset, offset + length);
            offset += length;

            // Store option
            const optionName = this.getOptionName(currentOption);
            if (!options[optionName]) {
                options[optionName] = [];
            }
            options[optionName].push(value);
        }

        return { options, newOffset: offset };
    }

    /**
     * Get option number from name
     */
    getOptionNumber(name) {
        if (typeof name === 'number') return name;
        
        const optionMap = {
            'uri-path': this.OPTION.URI_PATH,
            'uri-query': this.OPTION.URI_QUERY,
            'content-format': this.OPTION.CONTENT_FORMAT,
            'accept': this.OPTION.ACCEPT,
            'uri-host': this.OPTION.URI_HOST,
            'uri-port': this.OPTION.URI_PORT
        };
        
        return optionMap[name.toLowerCase()] || parseInt(name);
    }

    /**
     * Get option name from number
     */
    getOptionName(number) {
        const reverseMap = {
            [this.OPTION.URI_PATH]: 'uri-path',
            [this.OPTION.URI_QUERY]: 'uri-query',
            [this.OPTION.CONTENT_FORMAT]: 'content-format',
            [this.OPTION.ACCEPT]: 'accept',
            [this.OPTION.URI_HOST]: 'uri-host',
            [this.OPTION.URI_PORT]: 'uri-port'
        };
        
        return reverseMap[number] || `option-${number}`;
    }

    /**
     * Encode number to bytes
     */
    encodeNumber(num) {
        if (num === 0) return new Uint8Array([]);
        if (num < 256) return new Uint8Array([num]);
        if (num < 65536) return new Uint8Array([num >> 8, num & 0xFF]);
        return new Uint8Array([num >> 24, (num >> 16) & 0xFF, (num >> 8) & 0xFF, num & 0xFF]);
    }

    /**
     * Generate random token
     */
    generateToken() {
        const length = 4; // 4-byte token
        const token = new Uint8Array(length);
        for (let i = 0; i < length; i++) {
            token[i] = Math.floor(Math.random() * 256);
        }
        return token;
    }

    /**
     * Simple CBOR encoding (basic implementation)
     */
    encodeCBOR(obj) {
        // This is a simplified CBOR encoder
        // For production, use a proper CBOR library
        const encoded = [];
        
        if (typeof obj === 'number') {
            if (obj >= 0 && obj <= 23) {
                encoded.push(obj);
            } else if (obj >= 0 && obj <= 255) {
                encoded.push(0x18);
                encoded.push(obj);
            } else if (obj >= 0 && obj <= 65535) {
                encoded.push(0x19);
                encoded.push(obj >> 8);
                encoded.push(obj & 0xFF);
            }
        } else if (typeof obj === 'string') {
            const bytes = new TextEncoder().encode(obj);
            if (bytes.length <= 23) {
                encoded.push(0x60 | bytes.length);
            } else if (bytes.length <= 255) {
                encoded.push(0x78);
                encoded.push(bytes.length);
            }
            encoded.push(...bytes);
        } else if (obj === true) {
            encoded.push(0xF5);
        } else if (obj === false) {
            encoded.push(0xF4);
        } else if (obj === null) {
            encoded.push(0xF6);
        } else if (Array.isArray(obj)) {
            if (obj.length <= 23) {
                encoded.push(0x80 | obj.length);
            } else {
                encoded.push(0x98);
                encoded.push(obj.length);
            }
            for (const item of obj) {
                encoded.push(...this.encodeCBOR(item));
            }
        } else if (typeof obj === 'object') {
            const entries = Object.entries(obj);
            if (entries.length <= 23) {
                encoded.push(0xA0 | entries.length);
            } else {
                encoded.push(0xB8);
                encoded.push(entries.length);
            }
            for (const [key, value] of entries) {
                encoded.push(...this.encodeCBOR(key));
                encoded.push(...this.encodeCBOR(value));
            }
        }
        
        return new Uint8Array(encoded);
    }

    /**
     * Create GET request
     */
    createGET(path, options = {}) {
        return this.createMessage(
            this.TYPE.CON,
            this.METHOD.GET,
            {
                'uri-path': path,
                ...options
            }
        );
    }

    /**
     * Create POST request
     */
    createPOST(path, payload, contentFormat = this.CONTENT_FORMAT.CBOR, options = {}) {
        return this.createMessage(
            this.TYPE.CON,
            this.METHOD.POST,
            {
                'uri-path': path,
                'content-format': contentFormat,
                payload: payload,
                ...options
            }
        );
    }

    /**
     * Create FETCH request
     */
    createFETCH(path, payload, options = {}) {
        return this.createMessage(
            this.TYPE.CON,
            this.METHOD.FETCH,
            {
                'uri-path': path,
                'content-format': this.CONTENT_FORMAT.YANG_IDENTIFIERS_CBOR_SEQ,
                payload: payload,
                ...options
            }
        );
    }
}

// Export for use in other modules
window.CoAPClient = CoAPClient;