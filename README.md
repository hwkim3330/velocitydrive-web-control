# VelocityDRIVE Web Control Terminal

Web-based serial terminal and control interface for Microchip LAN9662 VelocityDRIVE platform with MUP1 protocol support.

## 🌟 Features

- **WebSerial API Support**: Direct browser-to-device serial communication (no server required)
- **MUP1 Protocol**: Full support for Microchip UART Protocol #1
- **Real-time Terminal**: Interactive terminal with command history
- **Quick Commands**: One-click access to common commands
- **YAML Configuration**: Convert YAML configs to device commands
- **CoAP/CBOR Support**: RESTful device configuration

## 🚀 Quick Start

### Option 1: GitHub Pages (Recommended)
Visit: https://hwkim3330.github.io/velocitydrive-web-control/

### Option 2: Local Server
```bash
# Clone repository
git clone https://github.com/hwkim3330/velocitydrive-web-control.git
cd velocitydrive-web-control

# Start local server
python3 -m http.server 8000
# or
npx http-server -p 8000

# Open in browser
http://localhost:8000/mup1-terminal.html  # MUP1 Protocol Terminal (Recommended)
http://localhost:8000/simple-terminal.html  # Basic Terminal
```

## 📋 Requirements

- **Browser**: Chrome 89+ or Edge 89+ (WebSerial API support)
- **Device**: LAN9662 board with VelocityDRIVE-SP firmware
- **Connection**: USB serial connection (typically /dev/ttyACM0 or COM port)

## 🎯 Usage

### MUP1 Terminal (mup1-terminal.html) - **Recommended**
1. Click **Connect** button
2. Select serial port (usually /dev/ttyACM0 or COM port)
3. Use quick commands or type MUP1 frames directly
4. Device info updates automatically from PONG responses

### Basic Terminal (simple-terminal.html)
1. Click **Connect** button
2. Select serial port
3. Type commands or use quick buttons
4. View device responses in real-time

### Advanced Control (index.html)
Full-featured interface with:
- TSN configuration (CBS, TAS, PTP)
- Port configuration
- YAML config editor
- CoAP/CBOR messaging
- Raw MUP1 protocol access

## 🔧 MUP1 Protocol

Frame format:
```
>TYPE[DATA]<[<]CHECKSUM
```

- `>` - Start of frame (0x3E)
- `TYPE` - Command type (p=ping, A=auto, T=text, C=CoAP, S=status)
- `DATA` - Escaped payload
- `<` - End of frame (0x3C, double for even-sized)
- `CHECKSUM` - 16-bit one's complement

### Example Communication
```
TX: >p<<8553           # Ping request
RX: >PVelocitySP-v2025.06-LAN9662-ung8291 0 300 2<<98e8  # Pong response
```

## 📁 Project Structure

```
velocitydrive-web-control/
├── mup1-terminal.html      # MUP1 Protocol Terminal (NEW - Recommended)
├── simple-terminal.html    # Basic terminal interface
├── index.html              # Advanced control interface
├── terminal.html           # Full-featured terminal
├── tsn-config.html         # TSN Configuration Tool
├── styles.css              # Stylesheet
├── js/
│   ├── webserial-terminal.js  # Improved WebSerial handler
│   ├── mup1-protocol.js       # MUP1 protocol implementation
│   ├── serial-handler.js      # Serial communication
│   ├── coap-client.js         # CoAP client
│   ├── cbor-encoder.js        # CBOR encoder/decoder
│   ├── yaml-parser.js         # YAML parser
│   ├── tsn-config.js          # TSN configuration logic
│   ├── tsn-test-scenarios.js  # TSN test automation
│   └── main.js                # Main application
└── README.md               # This file
```

## 🛠️ Common Commands

### System Commands
- `p` - Ping device
- `?` - Show help
- `AT+VERSION` - Get firmware version
- `AT+RESET` - Reset device
- `AT+BOOTLOG` - Show boot log
- `AT+MEMINFO` - Memory information

### Network Commands
- `AT+IFCONFIG` - Interface configuration
- `AT+MACADDR` - MAC addresses
- `AT+LINKSTATUS` - Link status
- `AT+STATS` - Statistics

### TSN Commands
- `AT+CBS?` - CBS status
- `AT+TAS?` - TAS status
- `AT+PTP?` - PTP status
- `AT+FRER?` - FRER status

## 🐛 Troubleshooting

### Connection Issues
- Ensure browser supports WebSerial (Chrome/Edge 89+)
- Check USB cable and connections
- Verify correct baud rate (usually 115200)
- Close other programs using the serial port

### Permission Denied
```bash
# Linux: Add user to dialout group
sudo usermod -a -G dialout $USER
# Logout and login again

# Or temporarily:
sudo chmod 666 /dev/ttyACM0
```

### No Response
- Check if device is powered on
- Try different baud rates
- Send ping command (`p`) to test connection
- Check terminal output for boot messages

## 📄 License

MIT License - See [LICENSE](LICENSE) file

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 🔗 Resources

- [VelocityDRIVE Documentation](https://microchip-ung.github.io/velocitydrivesp-documentation/)
- [WebSerial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)
- [Microchip LAN9662](https://www.microchip.com/en-us/product/lan9662)

## 👨‍💻 Author

Kim Jinsung - 2025

## 🙏 Acknowledgments

- Based on Microchip VelocityDRIVE-SP platform
- WebSerial API for browser-based serial communication
- CoAP/CORECONF protocol specifications
