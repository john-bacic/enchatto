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

const PORT = 3005;

// Generate unique client ID
function generateClientId() {
    return Math.random().toString(36).substring(2, 15);
}

// Get client list for a room
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
        guestColors: new Map(),
        nextGuestIndex: 0,
        hostId: null,
        disconnectedClients: new Map() // Store info about disconnected clients
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

    // Check if there's a disconnected client trying to reconnect
    let colorIndex = -1;
    let existingClient = room.disconnectedClients.get(clientId);
    
    if (existingClient) {
        // Reuse the existing client's information
        colorIndex = existingClient.colorIndex;
        room.disconnectedClients.delete(clientId);
    } else if (!isHost) {
        // Assign new color index for new guests
        colorIndex = room.guestColors.get(clientId);
        if (colorIndex === undefined) {
            colorIndex = room.nextGuestIndex++;
            room.guestColors.set(clientId, colorIndex);
        }
    }

    // Add client to room
    const clientInfo = {
        ws,
        clientId,
        isHost,
        joinTime: Date.now(),
        name: existingClient?.name || null,
        colorIndex
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
            } else if (message.type === 'typing' || message.type === 'stopTyping') {
                // Broadcast typing status to other clients in the room
                const room = rooms.get(message.roomId);
                if (!room) return;

                // Forward typing status to all other clients in the room
                room.clients.forEach(client => {
                    if (client.ws.readyState === WebSocket.OPEN && client.clientId !== ws.clientId) {
                        client.ws.send(JSON.stringify({
                            type: message.type,
                            isHost: message.isHost,
                            clientId: message.clientId
                        }));
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
            const disconnectedClient = room.clients[index];
            // Store disconnected client info for potential reconnection
            room.disconnectedClients.set(clientId, {
                colorIndex: disconnectedClient.colorIndex,
                name: disconnectedClient.name,
                isHost: disconnectedClient.isHost
            });
            
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

        // Clean up empty rooms after a delay to allow for reconnection
        if (room.clients.length === 0) {
            setTimeout(() => {
                if (rooms.has(roomId) && rooms.get(roomId).clients.length === 0) {
                    rooms.delete(roomId);
                    console.log(`Room ${roomId} deleted after timeout`);
                }
            }, 300000); // 5 minutes timeout
        } else {
            // Broadcast updated participants list
            broadcastParticipants(roomId);
        }
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    const networkInterfaces = os.networkInterfaces();
    const addresses = [];
    
    Object.keys(networkInterfaces).forEach((interfaceName) => {
        networkInterfaces[interfaceName].forEach((interface) => {
            if (interface.family === 'IPv4' && !interface.internal) {
                addresses.push(interface.address);
            }
        });
    });
    
    console.log('Access your chat room at:');
    addresses.forEach(address => {
        console.log(`http://${address}:${PORT}`);
        qrcode.generate(`http://${address}:${PORT}`, {small: true});
    });
});