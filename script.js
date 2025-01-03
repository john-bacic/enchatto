document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const inputArea = messageInput.parentElement;
    const DEFAULT_HEIGHT = '48px';

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
        // console.log('adjustHeight called with value:', messageInput.value);
        // Reset to default if placeholder is showing (input is empty)
        if (!messageInput.value) {
            resetToDefault();
            // console.log('Reset to default - input is empty');
            return;
        }

        const scrollTop = messageInput.scrollTop;
        
        // Reset height to minimum to get the correct scrollHeight
        messageInput.style.height = DEFAULT_HEIGHT;
        
        // Calculate new height based on content
        const newHeight = Math.min(Math.max(messageInput.scrollHeight, 47), 120);
        // console.log('New height calculated:', newHeight);
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
        // console.log('Input event fired');
        adjustHeight();
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
        } else if (e.key === 'Backspace' && messageInput.value.length <= 1) {
            // If backspace will make the input empty, reset height
            setTimeout(resetToDefault, 0);
        }
    });

    // Send message only when send button is clicked
    sendBtn.addEventListener('click', () => {
        const message = messageInput.value.trim();
        if (message) {
            // Clear content first
            messageInput.value = '';
            
            // Reset height in multiple steps to ensure it takes effect
            resetToDefault();
            // messageInput.style.height = 'auto';
            // messageInput.offsetHeight; // Force reflow
            // messageInput.style.height = DEFAULT_HEIGHT;
            inputArea.style.height = '68px';
            
            // Force another reflow
            messageInput.offsetHeight;
            
            // Trigger input event for good measure
            messageInput.dispatchEvent(new Event('input'));
        }
    });

    // Set initial height and add initial logging
    // console.log('Setting initial height');
    resetToDefault();
});
