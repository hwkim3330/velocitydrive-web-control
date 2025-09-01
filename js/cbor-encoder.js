/**
 * CBOR Encoder/Decoder
 * RFC 7049 - Concise Binary Object Representation
 */

class CBOREncoder {
    constructor() {
        // Major types
        this.MAJOR_TYPE = {
            UNSIGNED_INT: 0,
            NEGATIVE_INT: 1,
            BYTE_STRING: 2,
            TEXT_STRING: 3,
            ARRAY: 4,
            MAP: 5,
            TAG: 6,
            FLOAT_SIMPLE: 7
        };

        // Simple values
        this.SIMPLE = {
            FALSE: 20,
            TRUE: 21,
            NULL: 22,
            UNDEFINED: 23
        };

        // Common tags
        this.TAG = {
            DATE_TIME: 0,
            EPOCH_TIME: 1,
            POSITIVE_BIGNUM: 2,
            NEGATIVE_BIGNUM: 3,
            DECIMAL_FRACTION: 4,
            BIGFLOAT: 5,
            BASE64URL: 21,
            BASE64: 22,
            BASE16: 23,
            CBOR: 24,
            URI: 32,
            BASE64URL_NO_PAD: 33,
            BASE64_NO_PAD: 34,
            REGEXP: 35,
            MIME: 36,
            SELF_DESCRIBE_CBOR: 55799
        };
    }

    /**
     * Encode JavaScript value to CBOR
     */
    encode(value) {
        const bytes = [];
        this._encodeValue(value, bytes);
        return new Uint8Array(bytes);
    }

    /**
     * Internal encoding function
     */
    _encodeValue(value, bytes) {
        if (value === false) {
            bytes.push((this.MAJOR_TYPE.FLOAT_SIMPLE << 5) | this.SIMPLE.FALSE);
        } else if (value === true) {
            bytes.push((this.MAJOR_TYPE.FLOAT_SIMPLE << 5) | this.SIMPLE.TRUE);
        } else if (value === null) {
            bytes.push((this.MAJOR_TYPE.FLOAT_SIMPLE << 5) | this.SIMPLE.NULL);
        } else if (value === undefined) {
            bytes.push((this.MAJOR_TYPE.FLOAT_SIMPLE << 5) | this.SIMPLE.UNDEFINED);
        } else if (typeof value === 'number') {
            this._encodeNumber(value, bytes);
        } else if (typeof value === 'string') {
            this._encodeString(value, bytes);
        } else if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
            this._encodeByteString(value, bytes);
        } else if (Array.isArray(value)) {
            this._encodeArray(value, bytes);
        } else if (typeof value === 'object') {
            this._encodeObject(value, bytes);
        } else {
            throw new Error(`Cannot encode value of type ${typeof value}`);
        }
    }

    /**
     * Encode number
     */
    _encodeNumber(value, bytes) {
        if (Number.isInteger(value)) {
            if (value >= 0) {
                this._encodeUnsignedInt(value, bytes);
            } else {
                this._encodeNegativeInt(-value - 1, bytes);
            }
        } else {
            // Float encoding
            this._encodeFloat(value, bytes);
        }
    }

    /**
     * Encode unsigned integer
     */
    _encodeUnsignedInt(value, bytes) {
        this._encodeTypeAndValue(this.MAJOR_TYPE.UNSIGNED_INT, value, bytes);
    }

    /**
     * Encode negative integer
     */
    _encodeNegativeInt(value, bytes) {
        this._encodeTypeAndValue(this.MAJOR_TYPE.NEGATIVE_INT, value, bytes);
    }

    /**
     * Encode type and value
     */
    _encodeTypeAndValue(majorType, value, bytes) {
        const type = majorType << 5;
        
        if (value < 24) {
            bytes.push(type | value);
        } else if (value < 256) {
            bytes.push(type | 24);
            bytes.push(value);
        } else if (value < 65536) {
            bytes.push(type | 25);
            bytes.push((value >> 8) & 0xFF);
            bytes.push(value & 0xFF);
        } else if (value < 4294967296) {
            bytes.push(type | 26);
            bytes.push((value >> 24) & 0xFF);
            bytes.push((value >> 16) & 0xFF);
            bytes.push((value >> 8) & 0xFF);
            bytes.push(value & 0xFF);
        } else {
            // 64-bit integer
            bytes.push(type | 27);
            const high = Math.floor(value / 4294967296);
            const low = value % 4294967296;
            bytes.push((high >> 24) & 0xFF);
            bytes.push((high >> 16) & 0xFF);
            bytes.push((high >> 8) & 0xFF);
            bytes.push(high & 0xFF);
            bytes.push((low >> 24) & 0xFF);
            bytes.push((low >> 16) & 0xFF);
            bytes.push((low >> 8) & 0xFF);
            bytes.push(low & 0xFF);
        }
    }

    /**
     * Encode float
     */
    _encodeFloat(value, bytes) {
        // Use 64-bit float for simplicity
        bytes.push((this.MAJOR_TYPE.FLOAT_SIMPLE << 5) | 27);
        
        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);
        view.setFloat64(0, value, false); // Big-endian
        
        for (let i = 0; i < 8; i++) {
            bytes.push(view.getUint8(i));
        }
    }

    /**
     * Encode string
     */
    _encodeString(value, bytes) {
        const encoded = new TextEncoder().encode(value);
        this._encodeTypeAndValue(this.MAJOR_TYPE.TEXT_STRING, encoded.length, bytes);
        bytes.push(...encoded);
    }

    /**
     * Encode byte string
     */
    _encodeByteString(value, bytes) {
        const data = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
        this._encodeTypeAndValue(this.MAJOR_TYPE.BYTE_STRING, data.length, bytes);
        bytes.push(...data);
    }

    /**
     * Encode array
     */
    _encodeArray(value, bytes) {
        this._encodeTypeAndValue(this.MAJOR_TYPE.ARRAY, value.length, bytes);
        for (const item of value) {
            this._encodeValue(item, bytes);
        }
    }

    /**
     * Encode object/map
     */
    _encodeObject(value, bytes) {
        const entries = Object.entries(value);
        this._encodeTypeAndValue(this.MAJOR_TYPE.MAP, entries.length, bytes);
        for (const [key, val] of entries) {
            this._encodeValue(key, bytes);
            this._encodeValue(val, bytes);
        }
    }

    /**
     * Decode CBOR to JavaScript value
     */
    decode(bytes) {
        const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
        const result = this._decodeValue(data, 0);
        return result.value;
    }

    /**
     * Internal decoding function
     */
    _decodeValue(data, offset) {
        if (offset >= data.length) {
            throw new Error('Unexpected end of CBOR data');
        }

        const initialByte = data[offset];
        const majorType = (initialByte >> 5) & 0x07;
        const additionalInfo = initialByte & 0x1F;

        switch (majorType) {
            case this.MAJOR_TYPE.UNSIGNED_INT:
                return this._decodeUnsignedInt(data, offset);
            
            case this.MAJOR_TYPE.NEGATIVE_INT:
                const result = this._decodeUnsignedInt(data, offset);
                return { value: -result.value - 1, offset: result.offset };
            
            case this.MAJOR_TYPE.BYTE_STRING:
                return this._decodeByteString(data, offset);
            
            case this.MAJOR_TYPE.TEXT_STRING:
                return this._decodeTextString(data, offset);
            
            case this.MAJOR_TYPE.ARRAY:
                return this._decodeArray(data, offset);
            
            case this.MAJOR_TYPE.MAP:
                return this._decodeMap(data, offset);
            
            case this.MAJOR_TYPE.TAG:
                return this._decodeTag(data, offset);
            
            case this.MAJOR_TYPE.FLOAT_SIMPLE:
                return this._decodeFloatSimple(data, offset);
            
            default:
                throw new Error(`Unknown CBOR major type: ${majorType}`);
        }
    }

    /**
     * Decode unsigned integer
     */
    _decodeUnsignedInt(data, offset) {
        const additionalInfo = data[offset] & 0x1F;
        offset++;

        if (additionalInfo < 24) {
            return { value: additionalInfo, offset };
        } else if (additionalInfo === 24) {
            return { value: data[offset], offset: offset + 1 };
        } else if (additionalInfo === 25) {
            const value = (data[offset] << 8) | data[offset + 1];
            return { value, offset: offset + 2 };
        } else if (additionalInfo === 26) {
            const value = (data[offset] << 24) | (data[offset + 1] << 16) | 
                         (data[offset + 2] << 8) | data[offset + 3];
            return { value, offset: offset + 4 };
        } else if (additionalInfo === 27) {
            // 64-bit integer (simplified - may lose precision)
            const high = (data[offset] << 24) | (data[offset + 1] << 16) | 
                        (data[offset + 2] << 8) | data[offset + 3];
            const low = (data[offset + 4] << 24) | (data[offset + 5] << 16) | 
                       (data[offset + 6] << 8) | data[offset + 7];
            const value = high * 4294967296 + low;
            return { value, offset: offset + 8 };
        } else {
            throw new Error(`Invalid additional info: ${additionalInfo}`);
        }
    }

    /**
     * Decode byte string
     */
    _decodeByteString(data, offset) {
        const lengthResult = this._decodeLength(data, offset);
        const start = lengthResult.offset;
        const end = start + lengthResult.value;
        
        if (end > data.length) {
            throw new Error('Byte string extends beyond data');
        }
        
        return {
            value: data.slice(start, end),
            offset: end
        };
    }

    /**
     * Decode text string
     */
    _decodeTextString(data, offset) {
        const lengthResult = this._decodeLength(data, offset);
        const start = lengthResult.offset;
        const end = start + lengthResult.value;
        
        if (end > data.length) {
            throw new Error('Text string extends beyond data');
        }
        
        const bytes = data.slice(start, end);
        const value = new TextDecoder().decode(bytes);
        
        return { value, offset: end };
    }

    /**
     * Decode array
     */
    _decodeArray(data, offset) {
        const lengthResult = this._decodeLength(data, offset);
        offset = lengthResult.offset;
        const array = [];
        
        for (let i = 0; i < lengthResult.value; i++) {
            const result = this._decodeValue(data, offset);
            array.push(result.value);
            offset = result.offset;
        }
        
        return { value: array, offset };
    }

    /**
     * Decode map
     */
    _decodeMap(data, offset) {
        const lengthResult = this._decodeLength(data, offset);
        offset = lengthResult.offset;
        const map = {};
        
        for (let i = 0; i < lengthResult.value; i++) {
            const keyResult = this._decodeValue(data, offset);
            offset = keyResult.offset;
            const valueResult = this._decodeValue(data, offset);
            offset = valueResult.offset;
            map[keyResult.value] = valueResult.value;
        }
        
        return { value: map, offset };
    }

    /**
     * Decode tag
     */
    _decodeTag(data, offset) {
        const tagResult = this._decodeLength(data, offset);
        const valueResult = this._decodeValue(data, tagResult.offset);
        
        // For now, just return the value with tag info
        return {
            value: {
                tag: tagResult.value,
                value: valueResult.value
            },
            offset: valueResult.offset
        };
    }

    /**
     * Decode float or simple value
     */
    _decodeFloatSimple(data, offset) {
        const additionalInfo = data[offset] & 0x1F;
        offset++;

        if (additionalInfo < 20) {
            return { value: additionalInfo, offset };
        } else if (additionalInfo === this.SIMPLE.FALSE) {
            return { value: false, offset };
        } else if (additionalInfo === this.SIMPLE.TRUE) {
            return { value: true, offset };
        } else if (additionalInfo === this.SIMPLE.NULL) {
            return { value: null, offset };
        } else if (additionalInfo === this.SIMPLE.UNDEFINED) {
            return { value: undefined, offset };
        } else if (additionalInfo === 27) {
            // 64-bit float
            const buffer = new ArrayBuffer(8);
            const view = new DataView(buffer);
            for (let i = 0; i < 8; i++) {
                view.setUint8(i, data[offset + i]);
            }
            const value = view.getFloat64(0, false); // Big-endian
            return { value, offset: offset + 8 };
        } else {
            throw new Error(`Unsupported float/simple value: ${additionalInfo}`);
        }
    }

    /**
     * Decode length
     */
    _decodeLength(data, offset) {
        const additionalInfo = data[offset] & 0x1F;
        offset++;

        if (additionalInfo < 24) {
            return { value: additionalInfo, offset };
        } else if (additionalInfo === 24) {
            return { value: data[offset], offset: offset + 1 };
        } else if (additionalInfo === 25) {
            const value = (data[offset] << 8) | data[offset + 1];
            return { value, offset: offset + 2 };
        } else if (additionalInfo === 26) {
            const value = (data[offset] << 24) | (data[offset + 1] << 16) | 
                         (data[offset + 2] << 8) | data[offset + 3];
            return { value, offset: offset + 4 };
        } else if (additionalInfo === 27) {
            // 64-bit length (simplified)
            const high = (data[offset] << 24) | (data[offset + 1] << 16) | 
                        (data[offset + 2] << 8) | data[offset + 3];
            const low = (data[offset + 4] << 24) | (data[offset + 5] << 16) | 
                       (data[offset + 6] << 8) | data[offset + 7];
            const value = high * 4294967296 + low;
            return { value, offset: offset + 8 };
        } else if (additionalInfo === 31) {
            // Indefinite length
            return { value: -1, offset };
        } else {
            throw new Error(`Invalid length encoding: ${additionalInfo}`);
        }
    }
}

// Export for use in other modules
window.CBOREncoder = CBOREncoder;