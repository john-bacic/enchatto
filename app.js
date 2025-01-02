// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => console.log('ServiceWorker registered'))
            .catch(err => console.log('ServiceWorker registration failed: ', err));
    });
}

let ws = null;
let isHeaderExpanded = true;
let isHost = false;
let clientId = null;
let clientList = []; // Store the current client list
let participants = new Map();

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

// Function to make a name element editable
function makeNameEditable(nameElement, isHost = false) {
    nameElement.addEventListener('click', () => {
        const currentName = nameElement.textContent;
        nameElement.contentEditable = true;
        nameElement.textContent = '';  // Clear text to show placeholder
        nameElement.focus();
        
        const saveEdit = () => {
            const newName = nameElement.textContent.trim();
            if (newName && newName !== currentName) {
                ws.send(JSON.stringify({
                    type: 'name_change',
                    name: newName
                }));
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

// Create participant element
function createParticipantElement(id, isGuest = true) {
    const participant = document.createElement('div');
    participant.className = 'participant';
    participant.id = `participant-${id}`;
    
    const indicator = document.createElement('span');
    indicator.className = 'status-indicator online';
    
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = isGuest ? `Guest ${participants.size}` : 'Me (Host)';
    
    participant.appendChild(indicator);
    participant.appendChild(name);
    
    return participant;
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

// Update guest name in all their messages when it changes
function updateGuestName(guestId, newName) {
    document.querySelectorAll(`.message[data-sender="${guestId}"] .sender-name`).forEach(nameEl => {
        nameEl.textContent = newName;
    });
}

// Handle name changes
function handleNameChange(data) {
    const participant = participants.get(data.id);
    if (participant) {
        participant.name = data.name;
        updateGuestName(data.id, data.name);
        updateParticipants(Array.from(participants.values()));
    }
}

// Send message
function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
        ws.send(JSON.stringify({
            type: 'message',
            content: message  
        }));
        messageInput.value = '';
        // Blur input to dismiss keyboard on mobile
        messageInput.blur();
    }
}

// Add event listeners for sending messages
sendBtn.addEventListener('click', () => {
    sendMessage();
    // Extra blur for mobile keyboard dismissal
    messageInput.blur();
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
        // Blur input to dismiss keyboard on mobile
        messageInput.blur();
    }
});

// Update theme color based on role
function updateThemeColor(isHost) {
    const themeColor = '#1A1B25';  // Same dark theme for both host and guest
    document.querySelector('meta[name="theme-color"]').setAttribute('content', themeColor);
}

// Connect to WebSocket room
function connectToRoom(roomId) {
    if (ws) {
        ws.close();
    }

    try {
        // Use current window location to determine WebSocket URL
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}?room=${roomId}`;
        console.log('Connecting to WebSocket:', wsUrl);
        
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('Connected to chat room:', roomId);
            messageInput.focus();
        };

        ws.onmessage = (event) => {
            console.log('Received message:', event.data);
            const data = JSON.parse(event.data);
            
            if (data.type === 'participants') {
                updateParticipants(data.clients);
            } else if (data.type === 'message') {
                handleReceivedMessage(data);
            } else if (data.type === 'init') {
                clientId = data.clientId;
                isHost = data.isHost;
                updateThemeColor(isHost);  // Update theme color on init
                
                // Show/hide QR code section based on role
                if (!isHost) {
                    headerExpanded.style.display = 'none';
                    expandBtn.style.display = 'none';
                    
                    // Get guest color based on color index
                    const myColor = getGuestColor(data.colorIndex);
                    
                    // Color the header and send button
                    const header = document.querySelector('.header-main');
                    const sendButton = document.getElementById('sendBtn');
                    header.style.backgroundColor = myColor;
                    header.style.color = '#ffffff';
                    sendButton.style.backgroundColor = myColor;
                    sendButton.style.color = 'color-mix(in srgb, var(--black) 100%, var(--black))';
                    sendButton.style.border = 'none';
                } else {
                    // Make host name editable and set initial header state
                    const hostName = document.getElementById('hostName');
                    makeNameEditable(hostName, true);
                    setHeaderExpanded(true);
                    
                    // Get the computed background color of the header
                    const header = document.querySelector('.header-main');
                    const headerColor = getComputedStyle(header).backgroundColor;
                    
                    // Set host send button to match header color
                    const sendButton = document.getElementById('sendBtn');
                    sendButton.style.backgroundColor = headerColor;
                    sendButton.style.color = 'color-mix(in srgb, var(--black) 100%, var(--black))';
                    sendButton.style.border = 'none';
                }
                
                updateParticipants(data.clients);
            } else if (data.type === 'name_change') {
                handleNameChange(data);
            }
        };

        ws.onclose = () => {
            console.log('Disconnected from chat room');
            hostIndicator.classList.remove('online');
            guestsContainer.innerHTML = '';
            setTimeout(() => {
                console.log('Attempting to reconnect...');
                connectToRoom(roomId);
            }, 2000);
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            hostIndicator.classList.remove('online');
            guestsContainer.innerHTML = '';
        };
    } catch (error) {
        console.error('WebSocket connection error:', error);
        hostIndicator.classList.remove('online');
        guestsContainer.innerHTML = '';
    }
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