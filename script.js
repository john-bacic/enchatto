document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const micBtn = document.getElementById('micBtn');
    const inputArea = messageInput.parentElement.parentElement;
    const DEFAULT_HEIGHT = '48px';

    // Speech recognition setup
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US'; // You can make this configurable later

        recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map(result => result[0].transcript)
                .join('');
            
            messageInput.value = transcript;
            updateSendButtonVisibility();
            adjustHeight();
            micBtn.classList.remove('active');
            micBtn.classList.add('has-input');
            recognition.stop();
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            micBtn.classList.remove('active');
        };

        recognition.onend = () => {
            micBtn.classList.remove('active');
        };
    }

    // Microphone button click handler
    if (micBtn) {
        micBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // If there's input, clear it
            if (micBtn.classList.contains('has-input')) {
                messageInput.value = '';
                micBtn.classList.remove('has-input');
                updateSendButtonVisibility();
                adjustHeight();
                return;
            }

            if (!recognition) {
                // If speech recognition is not supported, try to trigger mobile keyboard speech input
                messageInput.focus();
                if (window.matchMedia('(max-width: 768px)').matches) {
                    // Add speech input type for mobile devices
                    messageInput.setAttribute('x-webkit-speech', '');
                    messageInput.setAttribute('speech', '');
                    
                    // Trigger click on the speech input button if available
                    const speechButton = messageInput.querySelector('::-webkit-input-speech-button');
                    if (speechButton) {
                        speechButton.click();
                    }
                }
                return;
            }

            if (micBtn.classList.contains('active')) {
                recognition.stop();
                micBtn.classList.remove('active');
            } else {
                recognition.start();
                micBtn.classList.add('active');
                messageInput.focus();
            }
        });

        // Update mic button state when input changes
        messageInput.addEventListener('input', () => {
            if (messageInput.value.trim()) {
                micBtn.classList.add('has-input');
            } else {
                micBtn.classList.remove('has-input');
            }
        });
    }

    function updateSendButtonVisibility() {
        if (messageInput.value.trim().length > 0) {
            sendBtn.classList.add('visible');
            messageInput.style.marginRight = '15px';
            micBtn.style.marginRight = '0px';
        } else {
            sendBtn.classList.remove('visible');
            messageInput.style.marginRight = '20px';
            micBtn.style.marginRight = '5px';
        }
    }

    function resetToDefault() {
        console.log('resetToDefault called');
        // Force reflow
        messageInput.style.height = 'auto';
        messageInput.offsetHeight;
        
        // Set heights
        messageInput.style.height = DEFAULT_HEIGHT;
        inputArea.style.height = '68px';
    }

    function adjustHeight() {
        // Reset to default if placeholder is showing (input is empty)
        if (!messageInput.value) {
            resetToDefault();
            return;
        }

        const scrollTop = messageInput.scrollTop;
        
        // Reset height to minimum to get the correct scrollHeight
        messageInput.style.height = DEFAULT_HEIGHT;
        
        // Calculate new height based on content
        const newHeight = Math.min(Math.max(messageInput.scrollHeight, 47), 120);
        messageInput.style.height = newHeight + 'px';
        
        // Adjust input area height
        const baseInputAreaHeight = 68;
        const additionalHeight = Math.max(0, newHeight - 48);
        inputArea.style.height = (baseInputAreaHeight + additionalHeight) + 'px';
        
        // Restore scroll position
        messageInput.scrollTop = scrollTop;
    }

    // Handle all text changes (including deletion)
    messageInput.addEventListener('input', () => {
        adjustHeight();
        updateSendButtonVisibility();
    });

    // Handle Enter key for manual line breaks
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            
            const start = messageInput.selectionStart;
            const end = messageInput.selectionEnd;
            
            const text = messageInput.value;
            messageInput.value = text.substring(0, start) + '\n' + text.substring(end);
            
            messageInput.selectionStart = messageInput.selectionEnd = start + 1;
            
            adjustHeight();
            updateSendButtonVisibility();
        } else if (e.key === 'Backspace' && messageInput.value.length <= 1) {
            // If backspace will make the input empty, reset height
            setTimeout(() => {
                resetToDefault();
                updateSendButtonVisibility();
            }, 0);
        }
    });

    // Set initial state
    resetToDefault();
    updateSendButtonVisibility();
});
