document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const inputArea = messageInput.parentElement;
    const DEFAULT_HEIGHT = '48px';

    function updateSendButtonVisibility() {
        if (messageInput.value.trim().length > 0) {
            sendBtn.classList.add('visible');
            messageInput.style.marginRight = '10px';
        } else {
            sendBtn.classList.remove('visible');
            messageInput.style.marginRight = '20px';
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
    messageInput.addEventListener('input', (e) => {
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
