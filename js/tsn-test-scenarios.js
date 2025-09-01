/**
 * TSN Test Scenarios for VelocityDRIVE LAN9662
 * Based on CBS test documentation
 */

class TSNTestScenarios {
    constructor() {
        this.scenarios = this.defineScenarios();
    }

    defineScenarios() {
        return {
            // CBS Test Scenario 1: PC1→PC2 with complex priority mapping
            cbs_pc1_to_pc2: {
                name: "CBS Test 1: PC1→PC2",
                description: "Multi-queue CBS test with non-linear PCP mapping",
                config: {
                    vlan: {
                        id: 100,
                        port1: 'tagged',
                        port2: 'tagged'
                    },
                    cbs: {
                        port: 2,
                        shapers: [
                            { tc: 0, idleSlope: 0, sendSlope: null, name: "Best Effort" },
                            { tc: 1, idleSlope: 0, sendSlope: null, name: "Background" },
                            { tc: 2, idleSlope: 10000, sendSlope: null, name: "Excellent Effort" },
                            { tc: 3, idleSlope: 20000, sendSlope: null, name: "Critical Apps" },
                            { tc: 4, idleSlope: 30000, sendSlope: null, name: "Video" },
                            { tc: 5, idleSlope: 75000, sendSlope: -25000, name: "SR Class B" },
                            { tc: 6, idleSlope: 75000, sendSlope: -25000, name: "SR Class A" },
                            { tc: 7, idleSlope: 0, sendSlope: null, name: "Network Control" }
                        ]
                    },
                    pcp: {
                        ingress: { // PCP -> Priority
                            0: 1, 1: 0, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7
                        },
                        egress: { // Priority -> PCP  
                            0: 1, 1: 0, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7
                        }
                    }
                },
                testSteps: [
                    "Configure VLAN 100 on both ports as tagged",
                    "Apply CBS configuration to Port 2",
                    "Set PCP mappings for ingress and egress",
                    "Send test traffic from PC1 with different PCP values",
                    "Verify bandwidth allocation per traffic class"
                ]
            },

            // CBS Test Scenario 2: PC2→PC1 reverse direction
            cbs_pc2_to_pc1: {
                name: "CBS Test 2: PC2→PC1",
                description: "Reverse direction CBS test",
                config: {
                    vlan: {
                        id: 100,
                        port1: 'tagged',
                        port2: 'tagged'
                    },
                    cbs: {
                        port: 1,
                        shapers: [
                            { tc: 0, idleSlope: 0, sendSlope: null },
                            { tc: 1, idleSlope: 0, sendSlope: null },
                            { tc: 2, idleSlope: 10000, sendSlope: null },
                            { tc: 3, idleSlope: 20000, sendSlope: null },
                            { tc: 4, idleSlope: 30000, sendSlope: null },
                            { tc: 5, idleSlope: 75000, sendSlope: -25000 },
                            { tc: 6, idleSlope: 75000, sendSlope: -25000 },
                            { tc: 7, idleSlope: 0, sendSlope: null }
                        ]
                    },
                    pcp: {
                        ingress: { // Port 2 ingress
                            0: 1, 1: 0, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7
                        },
                        egress: { // Port 1 egress
                            0: 1, 1: 0, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7
                        }
                    }
                }
            },

            // TAS Multi-Queue Test
            tas_multi_queue: {
                name: "TAS Multi-Queue Test",
                description: "Time-aware shaping with 8 traffic classes",
                config: {
                    tas: {
                        port: 2,
                        cycleTime: 1000000, // 1ms
                        baseTime: 'now+10',
                        gateEnabled: true,
                        gcl: [
                            { time: 125000, gates: 0b01000000, description: "TC6 - SR Class A" },
                            { time: 125000, gates: 0b00100000, description: "TC5 - SR Class B" },
                            { time: 100000, gates: 0b00010000, description: "TC4 - Video" },
                            { time: 100000, gates: 0b00001000, description: "TC3 - Critical Apps" },
                            { time: 550000, gates: 0b10000111, description: "TC0-2,7 - BE/BK/EE/NC" }
                        ]
                    }
                },
                testSteps: [
                    "Configure TAS on Port 2",
                    "Set cycle time to 1ms",
                    "Configure Gate Control List entries",
                    "Start time-aware scheduling",
                    "Verify traffic timing per class"
                ]
            },

            // Combined CBS + TAS AVB/TSN Test
            avb_tsn_combined: {
                name: "AVB/TSN Combined Test",
                description: "CBS bandwidth allocation with TAS time windows",
                config: {
                    vlan: {
                        id: 100,
                        port1: 'tagged',
                        port2: 'tagged'
                    },
                    cbs: {
                        port: 2,
                        shapers: [
                            { tc: 0, idleSlope: 0 },
                            { tc: 1, idleSlope: 0 },
                            { tc: 2, idleSlope: 10000 },
                            { tc: 3, idleSlope: 20000 },
                            { tc: 4, idleSlope: 30000 },
                            { tc: 5, idleSlope: 75000, sendSlope: -25000, hiCredit: 1518, loCredit: -1518 },
                            { tc: 6, idleSlope: 75000, sendSlope: -25000, hiCredit: 1518, loCredit: -1518 },
                            { tc: 7, idleSlope: 0 }
                        ]
                    },
                    tas: {
                        port: 2,
                        cycleTime: 1000000,
                        baseTime: 'now+10',
                        gateEnabled: true,
                        gcl: [
                            { time: 125000, gates: 0b01000000 },
                            { time: 125000, gates: 0b00100000 },
                            { time: 100000, gates: 0b00010000 },
                            { time: 100000, gates: 0b00001000 },
                            { time: 550000, gates: 0b10000111 }
                        ]
                    },
                    pcp: {
                        ingress: {
                            0: 1, // BE -> Background
                            1: 0, // BK -> Best Effort
                            2: 2, // EE -> Excellent Effort
                            3: 3, // CA -> Critical Apps
                            4: 4, // VI -> Video
                            5: 5, // VO -> Voice (SR Class B)
                            6: 6, // IC -> SR Class A
                            7: 7  // NC -> Network Control
                        },
                        egress: {
                            0: 1, 1: 0, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7
                        }
                    },
                    ptp: {
                        enabled: true,
                        domain: 0,
                        priority1: 128,
                        priority2: 128
                    },
                    frer: {
                        enabled: false,
                        sequenceRecovery: false
                    }
                }
            },

            // Stress Test - Maximum Utilization
            stress_test_max: {
                name: "Stress Test - Maximum Utilization",
                description: "Test TSN features under maximum load",
                config: {
                    cbs: {
                        port: 'both',
                        shapers: [
                            { tc: 0, idleSlope: 5000 },
                            { tc: 1, idleSlope: 5000 },
                            { tc: 2, idleSlope: 10000 },
                            { tc: 3, idleSlope: 15000 },
                            { tc: 4, idleSlope: 20000 },
                            { tc: 5, idleSlope: 20000, sendSlope: -80000 },
                            { tc: 6, idleSlope: 20000, sendSlope: -80000 },
                            { tc: 7, idleSlope: 5000 }
                        ]
                    }
                },
                testSteps: [
                    "Configure CBS on both ports",
                    "Generate maximum traffic on all queues",
                    "Monitor for packet drops",
                    "Verify fair bandwidth distribution",
                    "Check latency and jitter"
                ]
            }
        };
    }

    // Apply a specific test scenario
    async applyScenario(scenarioKey, tsnConfig) {
        const scenario = this.scenarios[scenarioKey];
        if (!scenario) {
            console.error(`Scenario ${scenarioKey} not found`);
            return false;
        }

        console.log(`Applying scenario: ${scenario.name}`);
        console.log(`Description: ${scenario.description}`);

        const config = scenario.config;

        // Apply VLAN configuration
        if (config.vlan) {
            this.applyVlanConfig(config.vlan);
        }

        // Apply CBS configuration
        if (config.cbs) {
            this.applyCbsConfig(config.cbs);
        }

        // Apply TAS configuration
        if (config.tas) {
            this.applyTasConfig(config.tas);
        }

        // Apply PCP mapping
        if (config.pcp) {
            this.applyPcpMapping(config.pcp);
        }

        // Apply PTP configuration
        if (config.ptp) {
            console.log('PTP Configuration:', config.ptp);
        }

        // Apply FRER configuration
        if (config.frer) {
            console.log('FRER Configuration:', config.frer);
        }

        // Log test steps
        if (scenario.testSteps) {
            console.log('Test Steps:');
            scenario.testSteps.forEach((step, index) => {
                console.log(`  ${index + 1}. ${step}`);
            });
        }

        return true;
    }

    applyVlanConfig(vlanConfig) {
        if (vlanConfig.id) {
            document.getElementById('vlanId').value = vlanConfig.id;
        }
        if (vlanConfig.port1) {
            document.getElementById('port1Mode').value = vlanConfig.port1;
        }
        if (vlanConfig.port2) {
            document.getElementById('port2Mode').value = vlanConfig.port2;
        }
    }

    applyCbsConfig(cbsConfig) {
        if (cbsConfig.port) {
            document.getElementById('cbsPort').value = cbsConfig.port;
        }

        if (cbsConfig.shapers) {
            cbsConfig.shapers.forEach(shaper => {
                const tc = shaper.tc;
                
                if (shaper.idleSlope !== undefined) {
                    const idleElem = document.getElementById(`tc${tc}_idle`);
                    if (idleElem) idleElem.value = shaper.idleSlope;
                }
                
                if (shaper.sendSlope !== undefined && shaper.sendSlope !== null) {
                    const sendElem = document.getElementById(`tc${tc}_send`);
                    if (sendElem) sendElem.value = shaper.sendSlope;
                }
                
                if (shaper.hiCredit !== undefined) {
                    const hiElem = document.getElementById(`tc${tc}_hicredit`);
                    if (hiElem) hiElem.value = shaper.hiCredit;
                }
                
                if (shaper.loCredit !== undefined) {
                    const loElem = document.getElementById(`tc${tc}_locredit`);
                    if (loElem) loElem.value = shaper.loCredit;
                }
            });
        }
    }

    applyTasConfig(tasConfig) {
        if (tasConfig.port) {
            document.getElementById('tasPort').value = tasConfig.port;
        }
        if (tasConfig.cycleTime) {
            document.getElementById('cycleTime').value = tasConfig.cycleTime;
        }
        if (tasConfig.baseTime) {
            const baseTime = tasConfig.baseTime === 'now+10' ? 
                Math.floor(Date.now() / 1000) + 10 : tasConfig.baseTime;
            document.getElementById('baseTime').value = baseTime;
        }
        if (tasConfig.gateEnabled !== undefined) {
            document.getElementById('gateEnabled').value = tasConfig.gateEnabled.toString();
        }

        // Clear existing GCL entries
        const gclContainer = document.getElementById('gclEntries');
        if (gclContainer) {
            gclContainer.innerHTML = '';
        }

        // Add GCL entries
        if (tasConfig.gcl && window.tsnConfig) {
            tasConfig.gcl.forEach((entry, index) => {
                window.tsnConfig.addGclEntry();
                const gclEntry = document.querySelectorAll('.gcl-entry')[index];
                if (gclEntry) {
                    gclEntry.querySelector('.gcl-time').value = entry.time;
                    gclEntry.querySelector('.gcl-gates').value = 
                        entry.gates.toString(2).padStart(8, '0');
                    
                    // Update TC display
                    const tcField = gclEntry.querySelector('.gcl-tc');
                    if (tcField) {
                        tcField.value = entry.description || this.gatesToTcString(entry.gates);
                    }
                }
            });
        }
    }

    applyPcpMapping(pcpConfig) {
        // Apply ingress mapping (PCP -> Priority)
        if (pcpConfig.ingress) {
            Object.entries(pcpConfig.ingress).forEach(([pcp, priority]) => {
                const elem = document.getElementById(`p1_pcp${pcp}_priority`);
                if (elem) elem.value = priority;
            });
        }

        // Apply egress mapping (Priority -> PCP)
        if (pcpConfig.egress) {
            Object.entries(pcpConfig.egress).forEach(([priority, pcp]) => {
                const elem = document.getElementById(`p2_priority${priority}_pcp`);
                if (elem) elem.value = pcp;
            });
        }
    }

    gatesToTcString(gates) {
        const activeTCs = [];
        for (let i = 0; i < 8; i++) {
            if (gates & (1 << i)) {
                activeTCs.push(`TC${i}`);
            }
        }
        return activeTCs.join(', ') || 'None';
    }

    // Generate test report
    generateTestReport(scenarioKey) {
        const scenario = this.scenarios[scenarioKey];
        if (!scenario) return null;

        const report = {
            scenario: scenario.name,
            description: scenario.description,
            timestamp: new Date().toISOString(),
            configuration: scenario.config,
            testSteps: scenario.testSteps,
            expectedResults: this.getExpectedResults(scenarioKey),
            actualResults: [],
            status: 'pending'
        };

        return report;
    }

    getExpectedResults(scenarioKey) {
        const expectedResults = {
            cbs_pc1_to_pc2: [
                "VLAN 100 active on both ports",
                "CBS shapers active on Port 2",
                "SR Class A/B get 75% bandwidth each",
                "Video gets 30Mbps bandwidth",
                "Critical Apps get 20Mbps bandwidth",
                "PCP values correctly mapped to priorities"
            ],
            tas_multi_queue: [
                "Gates open/close according to schedule",
                "SR Class A gets 125μs window",
                "SR Class B gets 125μs window",
                "No traffic outside assigned windows",
                "1ms cycle time maintained"
            ],
            avb_tsn_combined: [
                "CBS and TAS work together",
                "AVB traffic prioritized",
                "Time synchronization maintained",
                "Latency < 2ms for SR classes",
                "No packet drops for guaranteed traffic"
            ]
        };

        return expectedResults[scenarioKey] || [];
    }

    // Validate configuration before applying
    validateConfiguration(config) {
        const errors = [];

        // Validate CBS
        if (config.cbs) {
            let totalIdleSlope = 0;
            config.cbs.shapers.forEach(shaper => {
                totalIdleSlope += shaper.idleSlope || 0;
            });
            
            if (totalIdleSlope > 100000) {
                errors.push(`Total idle slope (${totalIdleSlope}) exceeds 100Mbps`);
            }
        }

        // Validate TAS
        if (config.tas) {
            let totalTime = 0;
            config.tas.gcl.forEach(entry => {
                totalTime += entry.time;
            });
            
            if (totalTime !== config.tas.cycleTime) {
                errors.push(`GCL total time (${totalTime}) doesn't match cycle time (${config.tas.cycleTime})`);
            }
        }

        return errors;
    }

    // Export configuration to YAML
    exportToYaml(scenarioKey) {
        const scenario = this.scenarios[scenarioKey];
        if (!scenario) return null;

        let yaml = `# TSN Test Scenario: ${scenario.name}\n`;
        yaml += `# Description: ${scenario.description}\n`;
        yaml += `# Generated: ${new Date().toISOString()}\n\n`;

        // Add configuration in YAML format
        // This would use the existing YAML generation functions

        return yaml;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TSNTestScenarios;
}

// Initialize globally for browser use
if (typeof window !== 'undefined') {
    window.TSNTestScenarios = TSNTestScenarios;
}