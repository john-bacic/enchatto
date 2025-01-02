// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => console.log('ServiceWorker registered'))
            .catch(err => console.log('ServiceWorker registration failed: ', err));
    });
}

let ws = null;
let sessionId = localStorage.getItem('sessionId');
let isHeaderExpanded = true;
let isHost = false;
let clientId = null;
let clientList = []; // Store the current client list
let participants = new Map();
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
function updateParticipants(clients) {
    const guestsContainer = document.getElementById('guests');
    guestsContainer.innerHTML = '';
    participants.clear();
    
    clients.forEach(client => {
        if (client.clientId === clientId) {
            // Update our own name if it's different
            const nameElement = isHost ? document.getElementById('hostName') : 
                                      document.querySelector('.guest-name');
            if (nameElement && nameElement.textContent !== client.name) {
                nameElement.textContent = client.name;
            }
        }
        
        if (!client.isHost) {
            const guestElement = document.createElement('div');
            guestElement.className = 'guest';
            guestElement.innerHTML = `
                <span class="name guest-name">${client.name}</span>
            `;
            
            // Make guest name editable if it's our own name
            if (client.clientId === clientId) {
                const nameSpan = guestElement.querySelector('.name');
                makeNameEditable(nameSpan, false);
            }
            
            guestsContainer.appendChild(guestElement);
            participants.set(client.clientId, {
                element: guestElement,
                name: client.name,
                isHost: client.isHost
            });
        } else if (client.isHost) {
            // Update host name in header if we're seeing the host
            const hostName = document.getElementById('hostName');
            if (hostName && client.name) {
                hostName.textContent = client.name;
                if (client.clientId === clientId) {
                    makeNameEditable(hostName, true);
                }
            }
            participants.set(client.clientId, {
                element: document.querySelector('.header-main'),
                name: client.name,
                isHost: true
            });
        }
    });
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
function makeNameEditable(element, isHost) {
    element.contentEditable = true;
    element.spellcheck = false;
    
    element.addEventListener('focus', function() {
        const range = document.createRange();
        range.selectNodeContents(this);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    });
    
    element.addEventListener('blur', function() {
        if (this.textContent.trim() === '') {
            this.textContent = isHost ? 'Host' : 'Guest';
        }
        // Send name change to server
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'name_change',
                name: this.textContent.trim()
            }));
        }
    });
    
    element.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.blur();
        }
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

// Update guest name in all their messages when it changes
function updateGuestName(guestId, newName) {
    document.querySelectorAll(`.message[data-sender="${guestId}"] .sender-name`).forEach(nameEl => {
        nameEl.textContent = newName;
    });
}

// Handle name changes
function handleNameChange(data) {
    const { clientId: changedClientId, name, isHost } = data;
    const participant = participants.get(changedClientId);
    
    if (participant) {
        participant.name = name;
        participant.element.querySelector('.name').textContent = name;
        
        // If this is the host, update the host name in the header
        if (isHost) {
            const hostName = document.getElementById('hostName');
            if (hostName) {
                hostName.textContent = name;
            }
        }
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
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}?room=${roomId}${sessionId ? `&sessionId=${sessionId}` : ''}`;
        console.log('Connecting to WebSocket:', wsUrl);
        
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('Connected to chat room:', roomId);
            reconnectAttempts = 0;
            messageInput.focus();
        };

        ws.onmessage = (event) => {
            console.log('Received message:', event.data);
            const data = JSON.parse(event.data);
            
            if (data.type === 'session') {
                sessionId = data.sessionId;
                localStorage.setItem('sessionId', sessionId);
                return;
            }
            
            if (data.type === 'participants') {
                updateParticipants(data.clients);
            } else if (data.type === 'message') {
                handleReceivedMessage(data);
            } else if (data.type === 'init') {
                clientId = data.clientId;
                isHost = data.isHost;
                updateThemeColor(isHost);  // Update theme color on init
                
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
            } else if (data.type === 'name_change') {
                handleNameChange(data);
            }
        };

        ws.onclose = () => {
            console.log('Disconnected from chat room');
            hostIndicator.classList.remove('online');
            guestsContainer.innerHTML = '';
            
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`Reconnecting... Attempt ${reconnectAttempts}`);
                setTimeout(() => connectToRoom(roomId), RECONNECT_DELAY);
            } else {
                console.log('Max reconnection attempts reached');
                displaySystemMessage('Connection lost. Please refresh the page to reconnect.');
                // Clear session on max retries
                localStorage.removeItem('sessionId');
                sessionId = null;
            }
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