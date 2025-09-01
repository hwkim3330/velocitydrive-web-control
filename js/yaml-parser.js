/**
 * Simple YAML Parser
 * Basic YAML to JSON conversion for configuration files
 */

class YAMLParser {
    constructor() {
        this.indentSize = 2; // Default indent size
    }

    /**
     * Parse YAML string to JavaScript object
     */
    parse(yamlString) {
        const lines = yamlString.split('\n');
        const result = {};
        const stack = [{ obj: result, indent: -1 }];
        let currentList = null;
        let listIndent = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            // Calculate indentation
            const indent = line.search(/\S/);
            if (indent === -1) continue;

            // Handle list items
            if (trimmed.startsWith('- ')) {
                const value = trimmed.substring(2).trim();
                
                // Find parent object
                while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
                    stack.pop();
                }
                
                const parent = stack[stack.length - 1].obj;
                
                // Create or continue list
                if (!currentList || listIndent !== indent) {
                    currentList = [];
                    listIndent = indent;
                    
                    // Find the last key in parent
                    const keys = Object.keys(parent);
                    if (keys.length > 0) {
                        const lastKey = keys[keys.length - 1];
                        parent[lastKey] = currentList;
                    }
                }
                
                // Parse list item value
                if (value.includes(':')) {
                    const obj = this.parseKeyValue(value);
                    currentList.push(obj);
                    stack.push({ obj: obj, indent: indent + 2 });
                } else {
                    currentList.push(this.parseValue(value));
                }
                
                continue;
            }

            // Reset list tracking if not a list item
            if (!trimmed.startsWith('- ')) {
                currentList = null;
                listIndent = -1;
            }

            // Handle key-value pairs
            const colonIndex = trimmed.indexOf(':');
            if (colonIndex === -1) continue;

            const key = trimmed.substring(0, colonIndex).trim();
            const value = trimmed.substring(colonIndex + 1).trim();

            // Find appropriate parent based on indentation
            while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
                stack.pop();
            }

            const parent = stack[stack.length - 1].obj;

            if (!value) {
                // Empty value means this is a parent for nested content
                parent[key] = {};
                stack.push({ obj: parent[key], indent });
            } else {
                // Parse and assign value
                parent[key] = this.parseValue(value);
            }
        }

        return result;
    }

    /**
     * Parse a single key-value pair
     */
    parseKeyValue(str) {
        const colonIndex = str.indexOf(':');
        if (colonIndex === -1) {
            return this.parseValue(str);
        }
        
        const key = str.substring(0, colonIndex).trim();
        const value = str.substring(colonIndex + 1).trim();
        
        return { [key]: this.parseValue(value) };
    }

    /**
     * Parse a value (string, number, boolean, etc.)
     */
    parseValue(value) {
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            return value.slice(1, -1);
        }

        // Boolean values
        if (value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
        if (value === 'false' || value === 'no' || value === 'off') {
            return false;
        }

        // Null values
        if (value === 'null' || value === '~' || value === '') {
            return null;
        }

        // Hexadecimal
        if (value.startsWith('0x') || value.startsWith('0X')) {
            const hex = parseInt(value, 16);
            if (!isNaN(hex)) return hex;
        }

        // Numbers
        if (/^-?\d+$/.test(value)) {
            return parseInt(value, 10);
        }
        if (/^-?\d*\.?\d+([eE][+-]?\d+)?$/.test(value)) {
            return parseFloat(value);
        }

        // Arrays (inline)
        if (value.startsWith('[') && value.endsWith(']')) {
            const items = value.slice(1, -1).split(',');
            return items.map(item => this.parseValue(item.trim()));
        }

        // Objects (inline)
        if (value.startsWith('{') && value.endsWith('}')) {
            const obj = {};
            const items = value.slice(1, -1).split(',');
            for (const item of items) {
                const [k, v] = item.split(':').map(s => s.trim());
                if (k && v) {
                    obj[k] = this.parseValue(v);
                }
            }
            return obj;
        }

        // Default to string
        return value;
    }

    /**
     * Convert JavaScript object to YAML string
     */
    stringify(obj, indent = 0) {
        const lines = [];
        const spaces = ' '.repeat(indent);

        for (const [key, value] of Object.entries(obj)) {
            if (value === null || value === undefined) {
                lines.push(`${spaces}${key}:`);
            } else if (typeof value === 'object' && !Array.isArray(value)) {
                lines.push(`${spaces}${key}:`);
                lines.push(this.stringify(value, indent + this.indentSize));
            } else if (Array.isArray(value)) {
                lines.push(`${spaces}${key}:`);
                for (const item of value) {
                    if (typeof item === 'object' && !Array.isArray(item)) {
                        const itemLines = this.stringify(item, indent + this.indentSize + 2);
                        const firstLine = itemLines.split('\n')[0];
                        const restLines = itemLines.split('\n').slice(1).join('\n');
                        lines.push(`${spaces}  - ${firstLine.trim()}`);
                        if (restLines) {
                            lines.push(restLines);
                        }
                    } else {
                        lines.push(`${spaces}  - ${this.formatValue(item)}`);
                    }
                }
            } else {
                lines.push(`${spaces}${key}: ${this.formatValue(value)}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Format a value for YAML output
     */
    formatValue(value) {
        if (typeof value === 'string') {
            // Quote if contains special characters
            if (value.includes(':') || value.includes('#') || value.includes('"') || 
                value.includes("'") || value.includes('\n') || value.trim() !== value) {
                return `"${value.replace(/"/g, '\\"')}"`;
            }
            return value;
        }
        if (typeof value === 'boolean') {
            return value ? 'true' : 'false';
        }
        if (value === null) {
            return 'null';
        }
        return String(value);
    }

    /**
     * Validate YAML string
     */
    validate(yamlString) {
        try {
            this.parse(yamlString);
            return { valid: true, error: null };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    /**
     * Convert TSN configuration from YAML to device format
     */
    convertTSNConfig(yamlObj) {
        const config = {};

        // Port configuration
        if (yamlObj.ports) {
            config.ports = yamlObj.ports.map(port => ({
                number: port.number,
                speed: port.speed === 'auto' ? 0 : parseInt(port.speed),
                duplex: port.duplex === 'full' ? 1 : (port.duplex === 'half' ? 0 : 2),
                enabled: port.enabled !== false
            }));
        }

        // CBS configuration
        if (yamlObj.tsn && yamlObj.tsn.cbs) {
            config.cbs = {};
            for (const [tc, params] of Object.entries(yamlObj.tsn.cbs)) {
                const tcNumber = tc.replace('tc', '');
                config.cbs[tcNumber] = {
                    idleSlope: params.idle_slope || params.idleSlope,
                    sendSlope: params.send_slope || params.sendSlope,
                    hiCredit: params.hi_credit || params.hiCredit || 0,
                    loCredit: params.lo_credit || params.loCredit || 0
                };
            }
        }

        // TAS configuration
        if (yamlObj.tsn && yamlObj.tsn.tas) {
            config.tas = {
                cycleTime: yamlObj.tsn.tas.cycle_time || yamlObj.tsn.tas.cycleTime,
                baseTime: yamlObj.tsn.tas.base_time || yamlObj.tsn.tas.baseTime || 0,
                gateControlList: []
            };

            if (yamlObj.tsn.tas.gate_control_list || yamlObj.tsn.tas.gateControlList) {
                const gcl = yamlObj.tsn.tas.gate_control_list || yamlObj.tsn.tas.gateControlList;
                config.tas.gateControlList = gcl.map(entry => ({
                    gateStates: typeof entry.gate_states === 'string' ? 
                                parseInt(entry.gate_states, 16) : entry.gate_states,
                    timeInterval: entry.time_interval || entry.timeInterval
                }));
            }
        }

        // PTP configuration
        if (yamlObj.tsn && yamlObj.tsn.ptp) {
            config.ptp = {
                profile: yamlObj.tsn.ptp.profile || 'default',
                domain: yamlObj.tsn.ptp.domain || 0,
                priority1: yamlObj.tsn.ptp.priority1 || 128,
                priority2: yamlObj.tsn.ptp.priority2 || 128,
                clockClass: yamlObj.tsn.ptp.clock_class || yamlObj.tsn.ptp.clockClass || 248,
                clockAccuracy: yamlObj.tsn.ptp.clock_accuracy || yamlObj.tsn.ptp.clockAccuracy || 0xFE
            };
        }

        // VLAN configuration
        if (yamlObj.vlans) {
            config.vlans = yamlObj.vlans.map(vlan => ({
                id: vlan.id,
                name: vlan.name || `VLAN${vlan.id}`,
                ports: vlan.ports || [],
                tagged: vlan.tagged || [],
                untagged: vlan.untagged || []
            }));
        }

        return config;
    }

    /**
     * Generate example YAML configuration
     */
    generateExample() {
        const example = {
            ports: [
                { number: 0, speed: 1000, duplex: 'full', enabled: true },
                { number: 1, speed: 'auto', duplex: 'auto', enabled: true }
            ],
            tsn: {
                cbs: {
                    tc2: { idle_slope: 1500, send_slope: -98500 },
                    tc6: { idle_slope: 3500, send_slope: -96500 }
                },
                tas: {
                    cycle_time: 200000,
                    gate_control_list: [
                        { gate_states: '0xFF', time_interval: 50000 },
                        { gate_states: '0x01', time_interval: 150000 }
                    ]
                },
                ptp: {
                    profile: 'automotive',
                    domain: 0,
                    priority1: 128,
                    priority2: 128
                }
            },
            vlans: [
                { id: 100, name: 'Production', ports: [0, 1], tagged: [0], untagged: [1] },
                { id: 200, name: 'Management', ports: [0], tagged: [0] }
            ]
        };

        return this.stringify(example);
    }
}

// Export for use in other modules
window.YAMLParser = YAMLParser;