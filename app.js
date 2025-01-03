// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => console.log('ServiceWorker registered'))
            .catch(err => console.log('ServiceWorker registration failed: ', err));
    });
}

let socket;
let isHost = false;
let clientId = null;
let currentRoomId = null;
let clientList = []; // Store the current client list
let participants = new Map();
let isReconnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000;

// Get guest color by index - this is now fixed per guest
function getGuestColor(colorIndex) {
    const colors = [
        '#FFA4A4', // Coral Red
        '#4ECDC4', // Turquoise
        '#45B7D1', // Sky Blue
        '#96CEB4', // Sage Green
        '#FFEEAD', // Cream Yellow
        '#D4A5A5', // Dusty Rose
        '#9B59B6', // Purple
        '#3498DB', // Blue
        '#E67E22', // Orange
        '#1ABC9C'  // Emerald
    ];
    return colors[colorIndex % colors.length];
}

// DOM Elements
const chatContainer = document.querySelector('.chat-container');
const expandBtn = document.getElementById('expandBtn');
const headerExpanded = document.querySelector('.header-expanded');
const chatScreen = document.getElementById('chat-screen');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const copyUrlBtn = document.getElementById('copy-url');
const guestsContainer = document.querySelector('.guests');
const hostIndicator = document.querySelector('.host .status-indicator');
const hostName = document.getElementById('hostName');

// Function to toggle header expansion
function setHeaderExpanded(expanded) {
    isHeaderExpanded = expanded;
    if (expanded) {
        headerExpanded.classList.add('open');
    } else {
        headerExpanded.classList.remove('open');
    }
    expandBtn.style.transform = expanded ? 'rotate(180deg)' : 'rotate(0deg)';
}

// Set initial header state for host
if (isHost) {
    setHeaderExpanded(true);
}

// Toggle header on button click
expandBtn.addEventListener('click', () => {
    setHeaderExpanded(!isHeaderExpanded);
});

// Close header when focusing on message input
messageInput.addEventListener('focus', () => {
    if (isHost) {
        setHeaderExpanded(false);
    }
});

// Update participants list
function updateParticipants(newClientList) {
    console.log('Updating participants:', newClientList);
    
    // Get list of disconnected users (in old list but not in new list)
    const disconnectedUsers = clientList
        .filter(oldClient => !newClientList.some(newClient => newClient.id === oldClient.id))
        .map(client => client.id);
    
    // Fade out messages from disconnected users
    if (disconnectedUsers.length > 0) {
        disconnectedUsers.forEach(userId => {
            document.querySelectorAll(`.message[data-sender="${userId}"]`).forEach(msg => {
                msg.classList.add('disconnected');
            });
        });
    }
    
    // Check for name changes and update message labels
    newClientList.forEach(newClient => {
        const oldClient = clientList.find(c => c.id === newClient.id);
        if (oldClient && oldClient.name !== newClient.name) {
            // Name has changed, update all message labels for this user
            document.querySelectorAll(`.message[data-sender="${newClient.id}"] .guest-label`).forEach(label => {
                label.textContent = newClient.name || (newClient.isHost ? 'Host' : `Guest ${newClient.colorIndex + 1}`);
            });
        }
    });
    
    clientList = newClientList;
    
    // Clear existing guests
    guestsContainer.innerHTML = '';
    
    // Find host client
    const hostClient = newClientList.find(client => client.isHost);
    const hostOnline = hostClient && hostClient.id;
    
    // Update host indicator and name
    if (hostOnline) {
        hostIndicator.classList.add('online');
        hostName.textContent = hostClient.name || 'Host';
        if (hostClient.id === clientId) {
            makeNameEditable(hostName, true);
        }
    } else {
        hostIndicator.classList.remove('online');
    }
    
    // Sort guests by their color index to maintain consistent order
    const sortedGuests = newClientList
        .filter(client => !client.isHost)
        .sort((a, b) => a.colorIndex - b.colorIndex);
    
    // Add each guest
    sortedGuests.forEach((client) => {
        const participantEl = document.createElement('div');
        participantEl.className = 'participant';
        participantEl.id = `participant-${client.id}`;
        
        const indicator = document.createElement('span');
        indicator.className = 'status-indicator online';
        const guestColor = getGuestColor(client.colorIndex);
        indicator.style.backgroundColor = guestColor;
        
        const name = document.createElement('span');
        name.className = 'name';
        
        // If it's the current client, make the name editable
        if (client.id === clientId) {
            name.textContent = client.name || 'Me';
            makeNameEditable(name);
        } else {
            name.textContent = client.name || `Guest ${client.colorIndex + 1}`;
        }
        
        name.style.color = guestColor;
        
        participantEl.appendChild(indicator);
        participantEl.appendChild(name);
        guestsContainer.appendChild(participantEl);
        
        // Store participant info for message coloring
        participants.set(client.id, {
            number: client.colorIndex + 1,
            name: client.name,
            color: guestColor,
            isHost: client.isHost
        });
    });

    // Update current client's guest number if they're a guest
    if (!isHost) {
        const myIndex = sortedGuests.findIndex(client => client.id === clientId);
        if (myIndex !== -1) {
            const client = sortedGuests[myIndex];
            participants.set(clientId, {
                number: client.colorIndex + 1,
                name: client.name,
                color: getGuestColor(client.colorIndex),
                isHost: false
            });
        }
    }
    
    // Update guest labels after participants change
    updateGuestLabels();
}

function updateGuestLabels() {
    // Count guests (non-host participants)
    const guestCount = Array.from(participants.values()).filter(p => !p.isHost).length;
    
    // Show labels for all messages (both host and guest) when there are 2 or more guests
    const shouldShow = guestCount >= 2;
    document.querySelectorAll('.message .guest-label').forEach(label => {
        label.style.display = shouldShow ? 'block' : 'none';
        // Update opacity based on guest count
        label.style.opacity = shouldShow ? '0.7' : '0';
    });
    
    // Log for debugging
    console.log('Updating guest labels:', { guestCount, shouldShow, participants: Array.from(participants.entries()) });
}

// Make name editable
function makeNameEditable(nameElement, isHost = false) {
    nameElement.addEventListener('click', () => {
        const currentName = nameElement.textContent;
        nameElement.contentEditable = true;
        nameElement.textContent = '';  // Clear text to show placeholder
        nameElement.focus();
        
        const saveEdit = () => {
            const newName = nameElement.textContent.trim();
            if (newName && newName !== currentName) {
                socket.emit('name-change', newName);
            } else if (!newName) {
                // If empty, restore the previous name
                nameElement.textContent = currentName;
            }
            nameElement.contentEditable = false;
        };
        
        nameElement.addEventListener('blur', saveEdit, { once: true });
        nameElement.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                nameElement.blur();
            }
        });
    });
}

// Handle received messages
function handleReceivedMessage(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.dataset.sender = data.senderId; // Add sender ID as data attribute
    
    // Add host/guest class based on sender's role
    if (data.isHost) {
        messageDiv.classList.add('host');
        // Add guest label for host messages too
        const label = document.createElement('div');
        label.className = 'guest-label';
        label.textContent = 'Host';
        messageDiv.appendChild(label);
    } else {
        messageDiv.classList.add('guest');
        // Get sender info for guest messages
        const sender = participants.get(data.senderId);
        if (sender) {
            messageDiv.style.backgroundColor = sender.color;
            // Add guest label
            const label = document.createElement('div');
            label.className = 'guest-label';
            label.textContent = sender.name || `Guest ${sender.number}`;
            label.style.color = sender.color;
            messageDiv.appendChild(label);
        }
    }
    
    // Check if sender is disconnected
    if (!clientList.some(client => client.id === data.senderId)) {
        messageDiv.classList.add('disconnected');
    }
    
    // Add self indicator if message is from current client
    if (data.senderId === clientId) {
        messageDiv.classList.add('self');
    }
    
    const textDiv = document.createElement('div');
    textDiv.className = 'text';
    textDiv.textContent = data.content;  
    messageDiv.appendChild(textDiv);
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Update guest labels after adding new message
    updateGuestLabels();
}

// Send message when button is clicked
sendBtn.addEventListener('click', () => {
    const content = messageInput.value.trim();
    if (content) {
        socket.emit('chat-message', content);
        messageInput.value = '';
    }
});

// Send message when Enter is pressed
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
    }
});

// Update theme color based on host/guest status
function updateThemeColor(isHost) {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
        metaThemeColor.setAttribute('content', isHost ? '#1a1a1a' : '#ffffff');
    }
}

// Connect to chat room
function connectToRoom(roomId) {
    if (!roomId) {
        console.error('No room ID provided');
        return;
    }
    
    currentRoomId = roomId;
    isReconnecting = true;

    if (socket) {
        socket.disconnect();
    }

    try {
        // Initialize Socket.IO
        socket = io({
            reconnection: true,
            reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
            reconnectionDelay: RECONNECT_DELAY,
            reconnectionDelayMax: RECONNECT_DELAY * 2,
            timeout: 10000
        });

        // Connection event handlers
        socket.on('connect', () => {
            console.log('Connected to server');
            isReconnecting = false;
            reconnectAttempts = 0;
            socket.emit('join-room', roomId);
        });

        socket.on('disconnect', (reason) => {
            console.log('Disconnected:', reason);
            document.querySelectorAll('.status-indicator').forEach(indicator => {
                indicator.classList.remove('online');
            });
        });

        socket.on('reconnect_attempt', (attemptNumber) => {
            console.log(`Reconnection attempt ${attemptNumber}`);
            isReconnecting = true;
        });

        socket.on('reconnect', (attemptNumber) => {
            console.log(`Reconnected after ${attemptNumber} attempts`);
            isReconnecting = false;
            socket.emit('join-room', roomId);
        });

        socket.on('reconnect_failed', () => {
            console.log('Failed to reconnect');
            isReconnecting = false;
        });

        // Chat event handlers
        socket.on('init', (data) => {
            clientId = data.clientId;
            isHost = data.isHost;
            updateThemeColor(isHost);

            if (!isHost) {
                headerExpanded.style.display = 'none';
                expandBtn.style.display = 'none';
                
                const myColor = getGuestColor(data.colorIndex);
                
                const header = document.querySelector('.header-main');
                const sendButton = document.getElementById('sendBtn');
                header.style.backgroundColor = myColor;
                header.style.color = '#ffffff';
                sendButton.style.backgroundColor = myColor;
                sendButton.style.color = 'color-mix(in srgb, var(--black) 100%, var(--black))';
                sendButton.style.border = 'none';
            } else {
                const hostName = document.getElementById('hostName');
                makeNameEditable(hostName, true);
                setHeaderExpanded(true);
                
                const header = document.querySelector('.header-main');
                const headerColor = getComputedStyle(header).backgroundColor;
                
                const sendButton = document.getElementById('sendBtn');
                sendButton.style.backgroundColor = headerColor;
                sendButton.style.color = 'color-mix(in srgb, var(--black) 100%, var(--black))';
                sendButton.style.border = 'none';
            }
            
            updateParticipants(data.clients);
        });

        socket.on('participants', (clients) => {
            updateParticipants(clients);
        });

        socket.on('chat-message', (data) => {
            handleReceivedMessage(data);
        });

    } catch (error) {
        console.error('Connection error:', error);
        if (!isReconnecting && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            setTimeout(() => connectToRoom(roomId), RECONNECT_DELAY);
        }
    }
}

// Get room ID from URL and connect
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
if (roomId) {
    connectToRoom(roomId);
}

// Generate random room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 15);
}

// Initialize room URL
function initializeRoomUrl(roomId) {
    const fullUrl = `${window.location.origin}?room=${roomId}`;
    const roomUrlInput = document.getElementById('room-url');
    const qrcodeElement = document.getElementById('qrcode');
    
    // Clear existing QR code
    qrcodeElement.innerHTML = '';
    
    // Only display the room number
    roomUrlInput.value = roomId;
    
    // Create QR code with full URL
    new QRCode(qrcodeElement, {
        text: fullUrl,
        width: 128,
        height: 128,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });
    
    // Copy URL button functionality - copies full URL
    const copyUrlBtn = document.getElementById('copy-url');
    copyUrlBtn.addEventListener('click', () => {
        // Create temporary input with full URL
        const tempInput = document.createElement('input');
        tempInput.value = fullUrl;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        
        // Don't select the displayed room ID
        roomUrlInput.blur();
        
        // Visual feedback
        copyUrlBtn.textContent = 'Copied!';
        setTimeout(() => {
            copyUrlBtn.textContent = 'Copy URL';
        }, 2000);
    });
    
    // Prevent editing of room ID
    roomUrlInput.addEventListener('focus', (e) => {
        e.target.select();
    });
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (socket) {
        socket.disconnect();
    }
});

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    chatScreen.style.display = 'flex';
    messageInput.focus();
    
    // Get or generate room ID
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room') || generateRoomId();
    
    if (!urlParams.has('room')) {
        // Update URL with room ID without reloading
        const newUrl = `${window.location.origin}?room=${roomId}`;
        window.history.pushState({ roomId }, '', newUrl);
    }
    
    initializeRoomUrl(roomId);
    connectToRoom(roomId);
});