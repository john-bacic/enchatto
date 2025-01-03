const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const qrcode = require('qrcode-terminal');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// Serve static files
app.use(express.static(path.join(__dirname)));

// Store active rooms and their connections
const rooms = new Map();

// Generate unique client ID
function generateClientId() {
    return Math.random().toString(36).substring(2, 15);
}

// Get client list for a room
function getClientList(roomId) {
    const room = rooms.get(roomId);
    if (!room) return [];
    
    return Array.from(room.clients.values()).map(client => ({
        id: client.id,
        isHost: client.isHost,
        joinTime: client.joinTime,
        name: client.name,
        colorIndex: client.colorIndex
    }));
}

// Create room if it doesn't exist
function createRoom(roomId) {
    return {
        id: roomId,
        clients: new Map(),
        guestColors: new Map(),
        nextGuestIndex: 0,
        hostId: null
    };
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    let currentRoom = null;
    let clientInfo = null;

    // Handle room join
    socket.on('join-room', (roomId) => {
        currentRoom = roomId;
        let room = rooms.get(roomId);
        
        if (!room) {
            room = createRoom(roomId);
            rooms.set(roomId, room);
        }

        const clientId = generateClientId();
        const isHost = !room.hostId;
        
        // Assign color index for guests
        let colorIndex = -1;
        if (!isHost) {
            colorIndex = room.nextGuestIndex++;
            room.guestColors.set(clientId, colorIndex);
        }

        // Store client info
        clientInfo = {
            id: clientId,
            socket,
            isHost,
            joinTime: Date.now(),
            name: null,
            colorIndex
        };
        
        room.clients.set(clientId, clientInfo);
        
        if (isHost) {
            room.hostId = clientId;
        }

        // Join Socket.IO room
        socket.join(roomId);

        // Send initial state to client
        socket.emit('init', {
            clientId,
            isHost,
            colorIndex,
            clients: getClientList(roomId)
        });

        // Broadcast updated participant list
        io.to(roomId).emit('participants', getClientList(roomId));

        console.log(`Client ${clientId} joined room ${roomId} as ${isHost ? 'host' : 'guest'}. Total clients: ${room.clients.size}`);
    });

    // Handle name changes
    socket.on('name-change', (name) => {
        if (!currentRoom || !clientInfo) return;
        
        const room = rooms.get(currentRoom);
        if (!room) return;

        clientInfo.name = name;
        io.to(currentRoom).emit('participants', getClientList(currentRoom));
    });

    // Handle chat messages
    socket.on('chat-message', (content) => {
        if (!currentRoom || !clientInfo) return;
        
        const room = rooms.get(currentRoom);
        if (!room) return;

        const messageObj = {
            content,
            senderId: clientInfo.id,
            senderName: clientInfo.name,
            isHost: clientInfo.isHost,
            timestamp: Date.now()
        };

        io.to(currentRoom).emit('chat-message', messageObj);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        if (!currentRoom || !clientInfo) return;
        
        const room = rooms.get(currentRoom);
        if (!room) return;

        // Remove client from room
        room.clients.delete(clientInfo.id);
        console.log(`Client ${clientInfo.id} left room ${currentRoom}. Total clients: ${room.clients.size}`);

        // If host left and there are other clients, assign new host
        if (clientInfo.isHost && room.clients.size > 0) {
            // Find the client that joined first
            const [newHostId, newHost] = Array.from(room.clients.entries())
                .sort(([, a], [, b]) => a.joinTime - b.joinTime)[0];
            
            newHost.isHost = true;
            room.hostId = newHostId;
            
            // Notify client of host status
            newHost.socket.emit('init', {
                clientId: newHostId,
                isHost: true,
                colorIndex: -1,
                clients: getClientList(currentRoom)
            });
        }

        // Clean up empty rooms after a delay
        if (room.clients.size === 0) {
            setTimeout(() => {
                const currentRoom = rooms.get(currentRoom);
                if (currentRoom && currentRoom.clients.size === 0) {
                    rooms.delete(currentRoom);
                    console.log(`Room ${currentRoom} deleted after timeout`);
                }
            }, 300000); // 5 minutes
        }

        // Broadcast updated participant list
        io.to(currentRoom).emit('participants', getClientList(currentRoom));
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