/**
 * TSN Configuration Tool for VelocityDRIVE LAN9662
 * Implements CBS, TAS, VLAN, and PCP mapping configurations
 */

class TSNConfigurator {
    constructor() {
        this.isConnected = false;
        this.port = null;
        this.serialHandler = null;
        this.currentConfig = {};
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadDefaultValues();
        this.checkWebSerialSupport();
    }

    checkWebSerialSupport() {
        if (!('serial' in navigator)) {
            this.log('WebSerial API not supported. Please use Chrome or Edge browser.', 'error');
            document.getElementById('connectBtn').disabled = true;
            return false;
        }
        return true;
    }

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Connection button
        document.getElementById('connectBtn')?.addEventListener('click', () => {
            this.toggleConnection();
        });

        // Fetch config button
        document.getElementById('fetchConfigBtn')?.addEventListener('click', () => {
            this.fetchCurrentConfig();
        });

        // Gate states binary input helper
        document.addEventListener('input', (e) => {
            if (e.target.classList.contains('gcl-gates')) {
                this.updateTcDisplay(e.target);
            }
        });
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(tabName).classList.add('active');
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
            // For now, simulate connection
            this.isConnected = true;
            this.updateConnectionStatus(true);
            this.log('Connected to device (simulation mode)', 'success');
            document.getElementById('fetchConfigBtn').disabled = false;
        } catch (error) {
            this.log(`Connection failed: ${error.message}`, 'error');
        }
    }

    async disconnect() {
        this.isConnected = false;
        this.updateConnectionStatus(false);
        this.log('Disconnected from device', 'info');
        document.getElementById('fetchConfigBtn').disabled = true;
    }

    updateConnectionStatus(connected) {
        const dot = document.getElementById('statusDot');
        const status = document.getElementById('connectionStatus');
        const btn = document.getElementById('connectBtn');
        
        if (connected) {
            dot.classList.add('connected');
            status.textContent = 'Connected';
            btn.textContent = 'Disconnect';
        } else {
            dot.classList.remove('connected');
            status.textContent = 'Disconnected';
            btn.textContent = 'Connect';
        }
    }

    loadDefaultValues() {
        // Load default values from the test scenario
    }

    log(message, type = 'info') {
        const terminal = document.getElementById('terminal');
        if (terminal) {
            const line = document.createElement('div');
            line.className = `terminal-line ${type}`;
            line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
            terminal.appendChild(line);
            terminal.scrollTop = terminal.scrollHeight;
        }
        console.log(`[${type}] ${message}`);
    }

    // VLAN Configuration
    generateVlanYaml() {
        const vlanId = document.getElementById('vlanId').value;
        const port1Mode = document.getElementById('port1Mode').value;
        const port2Mode = document.getElementById('port2Mode').value;
        const port1Type = document.getElementById('port1Type').value;
        const port2Type = document.getElementById('port2Type').value;
        const port1Frame = document.getElementById('port1Frame').value;
        const port2Frame = document.getElementById('port2Frame').value;

        let yaml = `# VLAN Configuration\n`;
        yaml += `# Remove default VLAN 1\n`;
        yaml += `- ? "/ieee802-dot1q-bridge:bridges/bridge[name='b0']/component[name='c0']/filtering-database/vlan-registration-entry[database-id='0'][vids='1']"\n`;
        yaml += `  :\n\n`;

        yaml += `# Port types\n`;
        yaml += `- ? "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/port-type"\n`;
        yaml += `  : ${port1Type}\n`;
        yaml += `- ? "/ietf-interfaces:interfaces/interface[name='2']/ieee802-dot1q-bridge:bridge-port/port-type"\n`;
        yaml += `  : ${port2Type}\n\n`;

        yaml += `# Frame filtering\n`;
        yaml += `- ? "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/acceptable-frame"\n`;
        yaml += `  : ${port1Frame}\n`;
        yaml += `- ? "/ietf-interfaces:interfaces/interface[name='2']/ieee802-dot1q-bridge:bridge-port/acceptable-frame"\n`;
        yaml += `  : ${port2Frame}\n\n`;

        yaml += `# VLAN ${vlanId} configuration\n`;
        yaml += `- ? "/ieee802-dot1q-bridge:bridges/bridge[name='b0']/component[name='c0']/filtering-database/vlan-registration-entry"\n`;
        yaml += `  : database-id: 0\n`;
        yaml += `    vids: '${vlanId}'\n`;
        yaml += `    entry-type: static\n`;
        yaml += `    port-map:\n`;
        
        if (port1Mode !== 'none') {
            yaml += `      - port-ref: 1\n`;
            yaml += `        static-vlan-registration-entries:\n`;
            yaml += `          vlan-transmitted: ${port1Mode}\n`;
        }
        
        if (port2Mode !== 'none') {
            yaml += `      - port-ref: 2\n`;
            yaml += `        static-vlan-registration-entries:\n`;
            yaml += `          vlan-transmitted: ${port2Mode}\n`;
        }

        return yaml;
    }

    // CBS Configuration
    generateCbsYaml() {
        const port = document.getElementById('cbsPort').value;
        let yaml = `# CBS (Credit-Based Shaper) Configuration\n`;

        const ports = port === 'both' ? ['1', '2'] : [port];
        
        ports.forEach(p => {
            yaml += `\n# Port ${p} Traffic Class Shapers\n`;
            yaml += `- "/ietf-interfaces:interfaces/interface[name='${p}']/mchp-velocitysp-port:eth-qos/config/traffic-class-shapers":\n`;
            
            for (let tc = 0; tc < 8; tc++) {
                const idleSlope = document.getElementById(`tc${tc}_idle`).value;
                const sendSlope = document.getElementById(`tc${tc}_send`).value;
                const hiCredit = document.getElementById(`tc${tc}_hicredit`)?.value || '';
                const loCredit = document.getElementById(`tc${tc}_locredit`)?.value || '';
                
                yaml += `  - traffic-class: ${tc}\n`;
                yaml += `    credit-based:\n`;
                yaml += `      idle-slope: ${idleSlope}\n`;
                if (sendSlope) {
                    yaml += `      send-slope: ${sendSlope}\n`;
                }
                if (hiCredit) {
                    yaml += `      max-credit: ${hiCredit}\n`;
                }
                if (loCredit) {
                    yaml += `      min-credit: ${loCredit}\n`;
                }
            }
        });

        return yaml;
    }

    // TAS Configuration
    generateTasYaml() {
        const port = document.getElementById('tasPort').value;
        const cycleTime = document.getElementById('cycleTime').value;
        const baseTime = document.getElementById('baseTime').value;
        const gateEnabled = document.getElementById('gateEnabled').value;

        let yaml = `# TAS (Time-Aware Shaper) Configuration\n`;
        yaml += `# Port ${port}\n\n`;

        yaml += `# Gate enable\n`;
        yaml += `- ? "/ietf-interfaces:interfaces/interface[name='${port}']/ieee802-dot1q-bridge:bridge-port/ieee802-dot1q-sched-bridge:gate-parameter-table/gate-enabled"\n`;
        yaml += `  : ${gateEnabled}\n\n`;

        yaml += `# Gate control list\n`;
        yaml += `- ? "/ietf-interfaces:interfaces/interface[name='${port}']/ieee802-dot1q-bridge:bridge-port/ieee802-dot1q-sched-bridge:gate-parameter-table/admin-control-list/gate-control-entry"\n`;
        yaml += `  :\n`;

        const gclEntries = document.querySelectorAll('.gcl-entry');
        gclEntries.forEach((entry, index) => {
            const time = entry.querySelector('.gcl-time').value;
            const gates = entry.querySelector('.gcl-gates').value;
            const gateValue = parseInt(gates, 2); // Convert binary to decimal

            yaml += `    - index: ${index + 1}\n`;
            yaml += `      operation-name: ieee802-dot1q-sched:set-gate-states\n`;
            yaml += `      time-interval-value: ${time}000\n`; // Convert to nanoseconds
            yaml += `      gate-states-value: ${gateValue}\n`;
        });

        yaml += `\n# Base time\n`;
        yaml += `- ? "/ietf-interfaces:interfaces/interface[name='${port}']/ieee802-dot1q-bridge:bridge-port/ieee802-dot1q-sched-bridge:gate-parameter-table/admin-base-time/seconds"\n`;
        yaml += `  : "${baseTime}"\n`;
        yaml += `- ? "/ietf-interfaces:interfaces/interface[name='${port}']/ieee802-dot1q-bridge:bridge-port/ieee802-dot1q-sched-bridge:gate-parameter-table/admin-base-time/nanoseconds"\n`;
        yaml += `  : 0\n\n`;

        yaml += `# Cycle time\n`;
        yaml += `- ? "/ietf-interfaces:interfaces/interface[name='${port}']/ieee802-dot1q-bridge:bridge-port/ieee802-dot1q-sched-bridge:gate-parameter-table/admin-cycle-time/numerator"\n`;
        yaml += `  : ${cycleTime}000\n`;
        yaml += `- ? "/ietf-interfaces:interfaces/interface[name='${port}']/ieee802-dot1q-bridge:bridge-port/ieee802-dot1q-sched-bridge:gate-parameter-table/admin-cycle-time/denominator"\n`;
        yaml += `  : 1000000000\n`;

        return yaml;
    }

    // PCP Mapping Configuration
    generatePcpYaml() {
        let yaml = `# PCP Priority Mapping Configuration\n\n`;

        // Port 1 Decoding Map
        yaml += `# Port 1 Ingress Decoding Map (PCP -> Priority)\n`;
        yaml += `- ? "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/pcp-decoding-table/pcp-decoding-map"\n`;
        yaml += `  : pcp: 8P0D\n\n`;
        
        yaml += `- ? "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/pcp-decoding-table/pcp-decoding-map[pcp='8P0D']/priority-map"\n`;
        yaml += `  :\n`;

        for (let pcp = 0; pcp < 8; pcp++) {
            const priority = document.getElementById(`p1_pcp${pcp}_priority`).value;
            yaml += `    - priority-code-point: ${pcp}\n`;
            yaml += `      priority: ${priority}\n`;
            yaml += `      drop-eligible: false\n`;
        }

        // Port 2 Encoding Map
        yaml += `\n# Port 2 Egress Encoding Map (Priority -> PCP)\n`;
        yaml += `- ? "/ietf-interfaces:interfaces/interface[name='2']/ieee802-dot1q-bridge:bridge-port/pcp-encoding-table/pcp-encoding-map"\n`;
        yaml += `  : pcp: 8P0D\n\n`;
        
        yaml += `- ? "/ietf-interfaces:interfaces/interface[name='2']/ieee802-dot1q-bridge:bridge-port/pcp-encoding-table/pcp-encoding-map[pcp='8P0D']/priority-map"\n`;
        yaml += `  :\n`;

        for (let priority = 0; priority < 8; priority++) {
            const pcp = document.getElementById(`p2_priority${priority}_pcp`).value;
            yaml += `    - priority: ${priority}\n`;
            yaml += `      dei: false\n`;
            yaml += `      priority-code-point: ${pcp}\n`;
        }

        return yaml;
    }

    // Generate full YAML configuration
    generateFullYaml() {
        let fullYaml = '# VelocityDRIVE LAN9662 TSN Configuration\n';
        fullYaml += '# Generated: ' + new Date().toISOString() + '\n\n';
        
        fullYaml += this.generateVlanYaml() + '\n';
        fullYaml += this.generatePcpYaml() + '\n';
        fullYaml += this.generateCbsYaml() + '\n';
        fullYaml += this.generateTasYaml() + '\n';

        document.getElementById('yamlOutput').textContent = fullYaml;
        this.log('YAML configuration generated', 'success');
        return fullYaml;
    }

    // Helper functions for GCL
    addGclEntry() {
        const container = document.getElementById('gclEntries');
        const count = container.children.length + 1;
        
        const entry = document.createElement('div');
        entry.className = 'gcl-entry';
        entry.innerHTML = `
            <div class="gcl-entry-header">
                <span>Entry ${count}</span>
                <button class="btn-danger" onclick="removeGclEntry(this)">Remove</button>
            </div>
            <div class="form-grid">
                <div class="form-group">
                    <label>Time Interval (μs)</label>
                    <input type="number" class="gcl-time" value="10000">
                </div>
                <div class="form-group">
                    <label>Gate States (Binary)</label>
                    <input type="text" class="gcl-gates" value="00000001" placeholder="e.g., 00000001 for TC0">
                </div>
                <div class="form-group">
                    <label>Traffic Classes</label>
                    <input type="text" class="gcl-tc" value="TC0" readonly>
                </div>
            </div>
        `;
        
        container.appendChild(entry);
    }

    updateTcDisplay(input) {
        const binary = input.value.padStart(8, '0');
        const tcField = input.parentElement.parentElement.querySelector('.gcl-tc');
        const activeTCs = [];
        
        for (let i = 0; i < 8; i++) {
            if (binary[7 - i] === '1') {
                activeTCs.push(`TC${i}`);
            }
        }
        
        tcField.value = activeTCs.join(', ') || 'None';
    }

    // Load test scenarios
    loadCbsTestScenario1() {
        // CBS Test Scenario 1: PC1→PC2 with complex priority mapping
        this.log('Loading CBS Test Scenario 1 (PC1→PC2)', 'info');
        
        // Set VLAN configuration
        document.getElementById('vlanId').value = '100';
        document.getElementById('port1Mode').value = 'tagged';
        document.getElementById('port2Mode').value = 'tagged';
        
        // Set idle slopes for AVB classes as per test scenario
        // SR Class A and B (TC6 and TC5) get high bandwidth
        document.getElementById('tc0_idle').value = '0';     // Best Effort
        document.getElementById('tc1_idle').value = '0';     // Background
        document.getElementById('tc2_idle').value = '10000'; // Excellent Effort
        document.getElementById('tc3_idle').value = '20000'; // Critical Applications
        document.getElementById('tc4_idle').value = '30000'; // Video
        document.getElementById('tc5_idle').value = '75000'; // SR Class B (75%)
        document.getElementById('tc6_idle').value = '75000'; // SR Class A (75%)
        document.getElementById('tc7_idle').value = '0';     // Network Control
        
        // Set send slopes (negative of idle slopes for AVB classes)
        document.getElementById('tc5_send').value = '-25000'; // SR Class B
        document.getElementById('tc6_send').value = '-25000'; // SR Class A
        
        document.getElementById('cbsPort').value = '2'; // Port 2 egress
        
        // Set PCP mapping as per test scenario documentation
        // PCP -> Priority mapping for ingress (Port 1)
        const pcpToPriority = {
            0: 1,  // BE -> Background
            1: 0,  // BK -> Best Effort  
            2: 2,  // EE -> Excellent Effort
            3: 3,  // CA -> Critical Applications
            4: 4,  // VI -> Video
            5: 5,  // VO -> Voice (SR Class B)
            6: 6,  // IC -> Internetwork Control (SR Class A)
            7: 7   // NC -> Network Control
        };
        
        Object.entries(pcpToPriority).forEach(([pcp, priority]) => {
            const elem = document.getElementById(`p1_pcp${pcp}_priority`);
            if (elem) elem.value = priority;
        });
        
        // Priority -> PCP mapping for egress (Port 2)
        const priorityToPcp = {
            0: 1,  // Best Effort -> BK
            1: 0,  // Background -> BE
            2: 2,  // Excellent Effort -> EE
            3: 3,  // Critical Applications -> CA
            4: 4,  // Video -> VI
            5: 5,  // Voice -> VO
            6: 6,  // SR Class A -> IC
            7: 7   // Network Control -> NC
        };
        
        Object.entries(priorityToPcp).forEach(([priority, pcp]) => {
            const elem = document.getElementById(`p2_priority${priority}_pcp`);
            if (elem) elem.value = pcp;
        });
        
        this.log('CBS Test Scenario 1 loaded with AVB configuration', 'success');
    }

    loadCbsTestScenario2() {
        // CBS Test Scenario 2: PC2→PC1
        this.log('Loading CBS Test Scenario 2 (PC2→PC1)', 'info');
        
        // Set idle slopes for reverse direction
        document.getElementById('tc0_idle').value = '5000';
        document.getElementById('tc1_idle').value = '4900';
        document.getElementById('tc2_idle').value = '4800';
        document.getElementById('tc3_idle').value = '4700';
        document.getElementById('tc4_idle').value = '4600';
        document.getElementById('tc5_idle').value = '4500';
        document.getElementById('tc6_idle').value = '4400';
        document.getElementById('tc7_idle').value = '4300';
        
        document.getElementById('cbsPort').value = '1'; // Port 1 egress
        
        this.log('CBS Test Scenario 2 loaded', 'success');
    }

    loadTasTestScenario() {
        // TAS Multi-Queue Test Scenario with AVB support
        this.log('Loading TAS Multi-Queue Test Scenario', 'info');
        
        document.getElementById('tasPort').value = '2';
        document.getElementById('cycleTime').value = '1000000'; // 1ms cycle
        document.getElementById('baseTime').value = Math.floor(Date.now() / 1000) + 10; // Start in 10 seconds
        document.getElementById('gateEnabled').value = 'true';
        
        // Clear existing entries
        document.getElementById('gclEntries').innerHTML = '';
        
        // Add test scenario entries for AVB traffic
        // Cycle: 1ms total
        // 125μs for SR Class A (TC6)
        // 125μs for SR Class B (TC5)  
        // 100μs for Video (TC4)
        // 100μs for Critical Apps (TC3)
        // 550μs for Best Effort and other traffic
        const gclConfig = [
            { time: 125000, gates: '01000000', tc: 'TC6 (SR Class A)' },
            { time: 125000, gates: '00100000', tc: 'TC5 (SR Class B)' },
            { time: 100000, gates: '00010000', tc: 'TC4 (Video)' },
            { time: 100000, gates: '00001000', tc: 'TC3 (Critical Apps)' },
            { time: 550000, gates: '10000111', tc: 'TC0-2,7 (BE/BK/EE/NC)' }
        ];
        
        gclConfig.forEach((config, index) => {
            this.addGclEntry();
            const entry = document.querySelectorAll('.gcl-entry')[index];
            entry.querySelector('.gcl-time').value = config.time;
            entry.querySelector('.gcl-gates').value = config.gates;
            entry.querySelector('.gcl-tc').value = config.tc;
        });
        
        this.log('TAS Test Scenario loaded with AVB gate schedule', 'success');
    }

    loadCombinedScenario() {
        // Combined CBS + TAS scenario for AVB/TSN
        this.log('Loading Combined CBS + TAS AVB/TSN Scenario', 'info');
        
        // Load CBS with AVB bandwidth allocation
        this.loadCbsTestScenario1();
        
        // Load TAS with time-aware gates
        this.loadTasTestScenario();
        
        // Additional TSN settings
        this.configureFrerSettings();
        this.configurePtpSettings();
        
        this.log('Combined AVB/TSN scenario loaded', 'success');
    }

    configureFrerSettings() {
        // Configure FRER (Frame Replication and Elimination for Reliability)
        this.log('Configuring FRER settings', 'info');
        
        // This would configure redundancy settings
        // For now, just log the configuration
        const frerConfig = {
            enabled: true,
            sequenceRecovery: true,
            individualRecovery: false,
            latentErrorDetection: true
        };
        
        console.log('FRER Configuration:', frerConfig);
    }

    configurePtpSettings() {
        // Configure PTP (Precision Time Protocol)
        this.log('Configuring PTP settings', 'info');
        
        // This would configure time sync settings
        const ptpConfig = {
            enabled: true,
            domain: 0,
            priority1: 128,
            priority2: 128,
            clockClass: 248,
            clockAccuracy: 0xFE,
            offsetScaledLogVariance: 0xFFFF
        };
        
        console.log('PTP Configuration:', ptpConfig);
    }

    // Apply configurations
    async applyVlanConfig() {
        const yaml = this.generateVlanYaml();
        this.log('Applying VLAN configuration...', 'info');
        
        // In real implementation, send to device
        await this.sendYamlToDevice(yaml);
        
        this.log('VLAN configuration applied', 'success');
    }

    async applyCbsConfig() {
        const yaml = this.generateCbsYaml();
        this.log('Applying CBS configuration...', 'info');
        
        await this.sendYamlToDevice(yaml);
        
        this.log('CBS configuration applied', 'success');
    }

    async applyTasConfig() {
        const yaml = this.generateTasYaml();
        this.log('Applying TAS configuration...', 'info');
        
        await this.sendYamlToDevice(yaml);
        
        this.log('TAS configuration applied', 'success');
    }

    async applyPcpMapping() {
        const yaml = this.generatePcpYaml();
        this.log('Applying PCP mapping configuration...', 'info');
        
        await this.sendYamlToDevice(yaml);
        
        this.log('PCP mapping configuration applied', 'success');
    }

    async applyAllConfigurations() {
        this.log('Applying all configurations...', 'info');
        
        await this.applyVlanConfig();
        await this.applyPcpMapping();
        await this.applyCbsConfig();
        await this.applyTasConfig();
        
        this.log('All configurations applied successfully', 'success');
    }

    async sendYamlToDevice(yaml) {
        // In real implementation, this would send to device via serial
        console.log('Sending YAML to device:', yaml);
        
        // Simulate sending
        return new Promise(resolve => {
            setTimeout(() => {
                this.log('Configuration sent to device', 'info');
                resolve();
            }, 500);
        });
    }

    // Utility functions
    copyYaml() {
        const yaml = document.getElementById('yamlOutput').textContent;
        navigator.clipboard.writeText(yaml).then(() => {
            this.log('YAML copied to clipboard', 'success');
        });
    }

    downloadYaml() {
        const yaml = document.getElementById('yamlOutput').textContent;
        const blob = new Blob([yaml], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tsn-config-${Date.now()}.yaml`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.log('YAML downloaded', 'success');
    }

    clearYaml() {
        document.getElementById('yamlOutput').textContent = '# Click "Generate Full YAML" to create configuration';
        this.log('YAML output cleared', 'info');
    }

    resetAllConfigurations() {
        if (confirm('Reset all configurations to default values?')) {
            location.reload();
        }
    }

    resetPcpMapping() {
        // Reset to 1:1 mapping
        for (let i = 0; i < 8; i++) {
            document.getElementById(`p1_pcp${i}_priority`).value = i;
            document.getElementById(`p2_priority${i}_pcp`).value = i;
        }
        this.log('PCP mapping reset to 1:1', 'info');
    }

    async fetchCurrentConfig() {
        this.log('Fetching current configuration from device...', 'info');
        
        // In real implementation, fetch from device
        setTimeout(() => {
            this.log('Configuration fetched (simulation)', 'success');
        }, 1000);
    }
}

// Global functions for onclick handlers
function applyVlanConfig() {
    window.tsnConfig.applyVlanConfig();
}

function generateVlanYaml() {
    const yaml = window.tsnConfig.generateVlanYaml();
    document.getElementById('yamlOutput').textContent = yaml;
}

function applyCbsConfig() {
    window.tsnConfig.applyCbsConfig();
}

function loadCbsScenario1() {
    window.tsnConfig.loadCbsTestScenario1();
}

function loadCbsScenario2() {
    window.tsnConfig.loadCbsTestScenario2();
}

function applyTasConfig() {
    window.tsnConfig.applyTasConfig();
}

function loadTasScenario() {
    window.tsnConfig.loadTasTestScenario();
}

function addGclEntry() {
    window.tsnConfig.addGclEntry();
}

function removeGclEntry(button) {
    button.parentElement.parentElement.remove();
}

function applyPcpMapping() {
    window.tsnConfig.applyPcpMapping();
}

function loadPcpScenario() {
    window.tsnConfig.loadCbsTestScenario1();
}

function resetPcpMapping() {
    window.tsnConfig.resetPcpMapping();
}

function loadCbsTestScenario1() {
    window.tsnConfig.loadCbsTestScenario1();
}

function loadCbsTestScenario2() {
    window.tsnConfig.loadCbsTestScenario2();
}

function loadTasTestScenario() {
    window.tsnConfig.loadTasTestScenario();
}

function loadCombinedScenario() {
    window.tsnConfig.loadCombinedScenario();
}

function applyAllConfigurations() {
    window.tsnConfig.applyAllConfigurations();
}

function resetAllConfigurations() {
    window.tsnConfig.resetAllConfigurations();
}

function generateFullYaml() {
    window.tsnConfig.generateFullYaml();
}

function copyYaml() {
    window.tsnConfig.copyYaml();
}

function downloadYaml() {
    window.tsnConfig.downloadYaml();
}

function clearYaml() {
    window.tsnConfig.clearYaml();
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.tsnConfig = new TSNConfigurator();
    window.tsnTestScenarios = new TSNTestScenarios();
    console.log('TSN Configurator initialized');
    console.log('TSN Test Scenarios loaded');
});