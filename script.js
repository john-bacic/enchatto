document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const inputArea = messageInput.parentElement;

    function adjustHeight() {
        // Store scroll position
        const scrollTop = messageInput.scrollTop;
        
        // Reset height to minimum to get the correct scrollHeight
        messageInput.style.height = '48px';
        
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
    messageInput.addEventListener('input', adjustHeight);

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
        }
    });

    // Send message only when send button is clicked
    sendBtn.addEventListener('click', () => {
        const message = messageInput.value.trim();
        if (message) {
            messageInput.value = '';
            messageInput.style.height = '48px';
            inputArea.style.height = '68px';
        }
    });
});
