const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');
const qrcode = require('qrcode-terminal');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname)));

// Store active rooms and their connections
const rooms = new Map();

// Generate unique client ID
function generateClientId() {
    return Math.random().toString(36).substring(2, 15);
}

// Get room participants list
function getClientList(room) {
    return room.clients.map(client => ({
        id: client.clientId,
        isHost: client.isHost,
        joinTime: client.joinTime,
        name: client.name,
        colorIndex: client.colorIndex
    }));
}

// Broadcast room participants
function broadcastParticipants(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const message = JSON.stringify({
        type: 'participants',
        clients: getClientList(room)
    });

    room.clients.forEach(client => {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(message);
        }
    });
}

// Create room if it doesn't exist
function createRoom(roomId) {
    return {
        id: roomId,
        clients: [],
        guestColors: new Map(), // Store guest colors permanently
        nextGuestIndex: 0, // Track the next available guest index
        hostId: null
    };
}

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const roomId = url.searchParams.get('room');
    
    if (!roomId) {
        ws.close();
        return;
    }

    let room = rooms.get(roomId);
    if (!room) {
        room = createRoom(roomId);
        rooms.set(roomId, room);
    }
    
    const clientId = generateClientId();
    const isHost = !room.hostId; // First client becomes host

    // Assign a permanent color index for guests
    let colorIndex = isHost ? -1 : room.guestColors.get(clientId);
    if (!isHost && colorIndex === undefined) {
        colorIndex = room.nextGuestIndex++;
        room.guestColors.set(clientId, colorIndex);
    }

    // Add client to room
    const clientInfo = {
        ws,
        clientId,
        isHost,
        joinTime: Date.now(),
        name: null,
        colorIndex // Store the color index with client info
    };
    room.clients.push(clientInfo);

    if (isHost) {
        room.hostId = clientId;
    }

    // Send initial state to client
    ws.send(JSON.stringify({
        type: 'init',
        clientId,
        isHost,
        colorIndex,
        clients: getClientList(room)
    }));

    // Broadcast updated participants list
    broadcastParticipants(roomId);

    console.log(`Client ${clientId} joined room ${roomId} as ${isHost ? 'host' : 'guest'}. Total clients: ${room.clients.length}`);

    // Handle messages
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            
            if (message.type === 'name_change') {
                // Update client's name in the room
                const client = room.clients.find(c => c.clientId === clientId);
                if (client) {
                    client.name = message.name;
                    // Broadcast updated participant list
                    broadcastParticipants(roomId);
                }
            } else if (message.type === 'message') {
                // Create message object with sender info
                const messageObj = {
                    type: 'message',
                    content: message.content,
                    senderId: clientId,
                    senderName: room.clients.find(c => c.clientId === clientId)?.name || 'Unknown',
                    isHost: isHost,
                    timestamp: Date.now()
                };
                
                // Send to all clients in the room
                room.clients.forEach(client => {
                    if (client.ws.readyState === WebSocket.OPEN) {
                        client.ws.send(JSON.stringify(messageObj));
                    }
                });
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    });

    // Handle client disconnect
    ws.on('close', () => {
        const index = room.clients.findIndex(client => client.clientId === clientId);
        if (index !== -1) {
            room.clients.splice(index, 1);
        }
        console.log(`Client ${clientId} left room ${roomId}. Total clients: ${room.clients.length}`);
        
        // If host left and there are other clients, assign new host
        if (isHost && room.clients.length > 0) {
            // Find the client that joined first
            const newHost = room.clients.sort((a, b) => a.joinTime - b.joinTime)[0];
            newHost.isHost = true;
            room.hostId = newHost.clientId;
        }

        // Clean up empty rooms
        if (room.clients.length === 0) {
            rooms.delete(roomId);
            console.log(`Room ${roomId} deleted`);
        } else {
            // Broadcast updated participants list
            broadcastParticipants(roomId);
        }
    });
});

// Start server
const PORT = process.env.PORT || 3005;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    
    // Get deployment URL
    const isProduction = process.env.NODE_ENV === 'production';
    const deploymentURL = isProduction ? 'https://enchatto.onrender.com' : `http://localhost:${PORT}`;
    
    console.log('\nAccess URLs:');
    console.log(`Local: ${deploymentURL}`);
    
    // Only show network URL and QR code in development
    if (!isProduction) {
        // Get local IP address
        const interfaces = os.networkInterfaces();
        let localIP;
        
        Object.keys(interfaces).forEach((interfaceName) => {
            interfaces[interfaceName].forEach((interface) => {
                if (interface.family === 'IPv4' && !interface.internal) {
                    localIP = interface.address;
                }
            });
        });
        
        const networkURL = localIP ? `http://${localIP}:${PORT}` : null;
        if (networkURL) {
            console.log(`Network: ${networkURL}`);
            console.log('\nQR Code for Network URL:');
            qrcode.generate(networkURL, { small: false });
        }
    }
});
