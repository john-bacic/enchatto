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

// Store client session info
const clientSessions = new Map();

function createRoom(roomId) {
    rooms.set(roomId, {
        hostId: null,
        clients: [],
        colorIndex: 0,
        lastActivity: Date.now()
    });
    return rooms.get(roomId);
}

function broadcastParticipants(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const message = JSON.stringify({
        type: 'participants',
        clients: room.clients
    });

    // Broadcast to all clients in the room
    room.clients.forEach(client => {
        if (client.ws && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(message);
        }
    });
}

function broadcastToRoom(roomId, message, excludeClientId = null) {
    const room = rooms.get(roomId);
    if (!room) return;

    const messageStr = JSON.stringify(message);
    room.clients.forEach(client => {
        if (client.clientId !== excludeClientId && client.ws && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(messageStr);
        }
    });
}

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const roomId = url.searchParams.get('room');
    const sessionId = url.searchParams.get('sessionId');
    
    // Create room if it doesn't exist
    if (!rooms.has(roomId)) {
        createRoom(roomId);
    }
    
    const room = rooms.get(roomId);
    let clientId;
    let isHost = false;

    // Check if this is a reconnection
    if (sessionId && clientSessions.has(sessionId)) {
        const session = clientSessions.get(sessionId);
        clientId = session.clientId;
        isHost = session.isHost;
        
        // Remove old websocket connection if it exists
        const existingClient = room.clients.find(c => c.clientId === clientId);
        if (existingClient) {
            existingClient.ws = ws;
        } else {
            // Add client back to room
            room.clients.push({
                clientId,
                name: session.name || `Guest ${room.clients.length + 1}`,
                isHost,
                joinTime: session.joinTime,
                colorIndex: session.colorIndex,
                ws
            });
        }
    } else {
        // Generate new client ID and session
        clientId = Math.random().toString(36).substr(2, 9);
        isHost = !room.hostId;
        
        if (isHost) {
            room.hostId = clientId;
        }

        const session = {
            clientId,
            isHost,
            joinTime: Date.now(),
            colorIndex: room.colorIndex++,
            roomId
        };
        
        const newSessionId = Math.random().toString(36).substr(2, 9);
        clientSessions.set(newSessionId, session);

        room.clients.push({
            clientId,
            name: isHost ? 'Host' : `Guest ${room.clients.length + 1}`,
            isHost,
            joinTime: session.joinTime,
            colorIndex: session.colorIndex,
            ws
        });

        // Send session ID to client
        ws.send(JSON.stringify({
            type: 'session',
            sessionId: newSessionId
        }));
    }

    // Send initial data to client
    ws.send(JSON.stringify({
        type: 'init',
        clientId,
        isHost,
        colorIndex: room.clients.find(c => c.clientId === clientId)?.colorIndex || 0
    }));

    broadcastParticipants(roomId);

    console.log(`Client ${clientId} ${sessionId ? 'reconnected to' : 'joined'} room ${roomId} as ${isHost ? 'host' : 'guest'}. Total clients: ${room.clients.length}`);

    // Handle messages
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            
            if (message.type === 'name_change') {
                const client = room.clients.find(c => c.clientId === clientId);
                if (client) {
                    client.name = message.name;
                    // Update session name
                    const session = Array.from(clientSessions.entries())
                        .find(([_, s]) => s.clientId === clientId);
                    if (session) {
                        session[1].name = message.name;
                    }
                    broadcastParticipants(roomId);
                }
            } else if (message.type === 'message') {
                const messageObj = {
                    type: 'message',
                    content: message.content,
                    senderId: clientId,
                    senderName: room.clients.find(c => c.clientId === clientId)?.name || 'Unknown',
                    isHost,
                    timestamp: Date.now()
                };
                
                broadcastToRoom(roomId, messageObj);
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    // Handle client disconnect
    ws.on('close', () => {
        const client = room.clients.find(c => c.clientId === clientId);
        if (!client) return;

        // Don't remove client immediately if they're the host
        if (isHost) {
            // Mark client as disconnected but keep in room
            client.ws = null;
            setTimeout(() => {
                // Only remove if they haven't reconnected
                if (!client.ws) {
                    room.clients = room.clients.filter(c => c.clientId !== clientId);
                    if (room.clients.length > 0) {
                        // Assign new host
                        const newHost = room.clients.sort((a, b) => a.joinTime - b.joinTime)[0];
                        newHost.isHost = true;
                        room.hostId = newHost.clientId;
                        
                        // Update session
                        const session = Array.from(clientSessions.entries())
                            .find(([_, s]) => s.clientId === newHost.clientId);
                        if (session) {
                            session[1].isHost = true;
                        }
                    }
                    broadcastParticipants(roomId);
                }
            }, 30000); // Wait 30 seconds before removing host
        } else {
            // Remove non-host clients immediately
            room.clients = room.clients.filter(c => c.clientId !== clientId);
            broadcastParticipants(roomId);
        }

        // Clean up empty rooms
        if (room.clients.length === 0) {
            rooms.delete(roomId);
            // Clean up associated sessions
            for (const [sessionId, session] of clientSessions.entries()) {
                if (session.roomId === roomId) {
                    clientSessions.delete(sessionId);
                }
            }
            console.log(`Room ${roomId} deleted`);
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