const headerRow = document.querySelector('.row.header')
const triangle = document.querySelector('.triangle')
const hiddenRows = document.querySelectorAll('.row.hidden')
let isExpanded = true
const langOptions = document.querySelectorAll('.lang-option')

const translations = {
  guest: {
    en: 'guest',
    jp: 'ゲスト',
  },
  me: {
    en: 'me',
    jp: '自分',
  },
  scanQR: {
    en: 'QRコードをスキャンしてチャットする',
    jp: 'Scan QR code to chat',
  },
  placeholder: {
    en: 'Type your message...',
    jp: 'メッセージを入力...',
  },
}

const translateIcon = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M5.07857 0.0327941C5.45543 0.0438585 5.72821 0.418792 5.63265 0.783505V0.783505C5.35894 2.06186 5.11405 4.04124 5.11405 5.7457C5.11405 7.47744 5.37966 8.80716 5.7283 9.97876C5.86937 10.4528 5.60685 10.9583 5.13082 11.0926V11.0926C4.69238 11.2163 4.23189 10.9775 4.11163 10.5381C3.7764 9.31323 3.5006 7.66239 3.5006 6.02062C3.5006 4.21993 3.7599 2.19931 3.91837 0.838488V0.838488C3.96545 0.389266 4.34999 0.0114035 4.80148 0.0246589L5.07857 0.0327941ZM3.2557 1.56701C5.61173 1.56701 7.55149 1.47535 9.45166 1.12545C9.92632 1.03805 10.3763 1.39216 10.3807 1.87478V1.87478C10.3841 2.24432 10.12 2.56276 9.75424 2.61591C7.80684 2.89889 5.16668 3.06529 3.21248 3.06529C2.67569 3.06529 1.96086 3.03132 1.34838 3.00159C0.954211 2.98246 0.639886 2.66279 0.629101 2.2683V2.2683C0.616479 1.80666 1.02025 1.43966 1.48044 1.47851C2.0436 1.52605 2.7194 1.56701 3.2557 1.56701ZM8.58121 3.37869C9.04395 3.48638 9.31049 4.00136 9.15351 4.44978C9.1121 4.56807 9.07497 4.67543 9.04682 4.75601C8.22569 7.23024 6.7419 9.08591 5.37335 10.0481C4.43697 10.7079 3.18367 11.3127 1.93037 11.3127C0.878752 11.3127 0 10.7079 0 9.30584C0 7.3677 1.81513 5.34708 4.10564 4.54983C5.05642 4.21993 6.2377 4.01375 7.31813 4.01375C10.012 4.01375 12 5.49828 12 7.64261C12 9.50316 10.9005 11.3013 7.74088 11.9179C7.44985 11.9747 7.15591 11.8421 6.99215 11.5949V11.5949C6.67508 11.1162 6.98222 10.469 7.53674 10.3201C9.41937 9.81472 10.2137 8.69702 10.2137 7.56014C10.2137 6.39175 9.16207 5.40206 7.21729 5.40206C5.90636 5.40206 4.86915 5.75945 4.16327 6.06186C2.72269 6.7079 1.69988 8.02749 1.69988 8.94845C1.69988 9.40206 1.88716 9.63574 2.36255 9.63574C3.03962 9.63574 4.0048 9.18213 4.88355 8.39863C5.93517 7.47766 6.91477 6.2543 7.491 4.35739C7.51882 4.27773 7.54665 4.17504 7.57266 4.06175C7.67719 3.60648 8.12626 3.27281 8.58121 3.37869V3.37869Z" fill="#00FF2A"/>
</svg>`

const jpIcon = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M1.78294 12C0.92977 12 0.347054 11.1374 0.665515 10.3459L4.38781 1.09454C4.65389 0.433226 5.29517 0 6.00801 0V0C6.72164 0 7.36349 0.434194 7.62903 1.09659L11.3106 10.2803C11.6407 11.1037 11.0344 12 10.1473 12V12C9.62861 12 9.16353 11.6805 8.97741 11.1964L6.80176 5.53714C6.73128 5.35429 6.64317 5.12 6.53745 4.83429C6.44347 4.54857 6.34361 4.24571 6.23789 3.92571C6.13216 3.60571 6.03231 3.30286 5.93833 3.01714C5.87669 2.82227 5.82516 2.64952 5.78374 2.49889C5.75276 2.38624 5.83613 2.27606 5.95289 2.27186V2.27186C6.07702 2.26738 6.17004 2.38425 6.13571 2.50363C6.08153 2.69208 6.0216 2.88611 5.95595 3.08571C5.87372 3.36 5.78561 3.64571 5.69163 3.94286C5.59765 4.22857 5.4978 4.50857 5.39207 4.78286C5.28634 5.05714 5.18649 5.32571 5.09251 5.58857L2.90603 11.2307C2.72635 11.6944 2.2802 12 1.78294 12V12ZM3.79301 9.48C3.05308 9.48 2.55116 8.7274 2.83551 8.04429V8.04429C2.99646 7.65762 3.37418 7.40571 3.79301 7.40571H8.07141C8.48752 7.40571 8.86334 7.6544 9.02601 8.03739V8.03739C9.31654 8.72139 8.81456 9.48 8.07141 9.48H3.79301Z" fill="#00FF2A"/>
</svg>`

document.addEventListener('DOMContentLoaded', () => {
  const messageInput = document.getElementById('messageInput')
  const content = document.getElementById('content')
  const langOptions = document.querySelectorAll('.lang-option')
  const headerRow = document.querySelector('.row.header')
  const triangle = document.querySelector('.triangle')
  const hiddenRows = document.querySelectorAll('.row.hidden')
  let isExpanded = true

  // Set initial state - expanded
  triangle.classList.add('open')
  hiddenRows.forEach((row) => {
    row.classList.remove('hidden')
    row.classList.add('visible')
  })

  // Toggle accordion on header click
  headerRow.addEventListener('click', () => {
    isExpanded = !isExpanded
    triangle.classList.toggle('open')

    hiddenRows.forEach((row) => {
      if (isExpanded) {
        row.classList.add('visible')
        row.classList.remove('hidden')
      } else {
        row.classList.remove('visible')
        row.classList.add('hidden')
      }
    })
  })

  // Close accordion on input focus
  messageInput.addEventListener('focus', () => {
    if (isExpanded) {
      isExpanded = false
      triangle.classList.remove('open')
      hiddenRows.forEach((row) => {
        row.classList.remove('visible')
        row.classList.add('hidden')
      })
    }
  })

  langOptions.forEach((option) => {
    option.addEventListener('click', () => {
      const lang = option.textContent
      console.log('Language clicked:', lang) // Debug

      // Update active state
      langOptions.forEach((opt) => opt.classList.remove('active'))
      option.classList.add('active')

      // Toggle background position
      const background = document.querySelector('.lang-background')
      background.classList.toggle('jp', lang === 'jp')

      // Update QR text (both hidden and visible states)
      const qrText = document.querySelector(
        '.row.hidden, .row.visible:nth-child(2)'
      )
      if (qrText) {
        qrText.textContent = translations.scanQR[lang]
        // Adjust font size for Japanese
        // qrText.style.fontSize = lang === 'jp' ? '1.2em' : '1.2em'
      }

      // Update guest text
      const guestElement = document.querySelector(
        '.row:last-child div:first-child'
      )
      if (guestElement) {
        guestElement.innerHTML = `<span class="status-dot"></span>${translations.guest[lang]}`
        guestElement.style.fontSize = lang === 'jp' ? '1em' : '1em'
      }

      // Update me text with dynamic icon
      const meElement = document.querySelector('.row:last-child div:last-child')
      if (meElement) {
        const currentIcon = lang === 'jp' ? jpIcon : translateIcon
        meElement.innerHTML = `<span class="translate-icon">${currentIcon}</span>${translations.me[lang]}<span class="status-dot"></span>`
        meElement.style.fontSize = lang === 'jp' ? '1em' : '1em'
      }

      // Update input placeholder
      const messageInput = document.getElementById('messageInput')
      if (messageInput) {
        messageInput.placeholder = translations.placeholder[lang]
        messageInput.style.fontSize = lang === 'jp' ? '1.0em' : '1em'
      }
    })
  })

  const autoResize = () => {
    // Only resize if there are line breaks
    if (messageInput.value.includes('\n')) {
      messageInput.style.height = 'auto'
      messageInput.style.height = messageInput.scrollHeight + 'px'
    } else {
      messageInput.style.height = '24px' // Reset to default height
    }
  }

  messageInput.addEventListener('input', autoResize)

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      // Allow line break and trigger resize
      setTimeout(autoResize, 0)
    }
  })

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => console.log('ServiceWorker registered'))
      .catch((err) => console.log('ServiceWorker failed: ', err))
  }
})
