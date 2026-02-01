// Circle Snip - Content Script
// Handles overlay UI, circle selection, and user interaction

(function () {
    'use strict';

    // Prevent multiple injections
    if (window.__circleSnipActive) return;
    window.__circleSnipActive = true;

    // State
    let state = {
        imageData: null,
        dpr: window.devicePixelRatio || 1,
        circle: {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            diameter: 256
        },
        isDragging: false,
        isResizing: false,
        hasInteracted: false,
        dragStart: { x: 0, y: 0 },
        lastDiameter: 256,
        captureCount: 0,  // Track successful captures
        isPro: false,      // Unlocked after purchase
        settings: {
            soundEnabled: false,
            autoCopy: true,
            autoDownload: true
        },
        captureHistory: []
    };

    // DOM elements
    let overlay, frozenBg, dimSvg, ring, crosshair, sizeLabel, panel;

    // Initialize
    async function init() {
        await loadPreferences();
        createOverlay();
        attachEventListeners();
    }
    // License server URL (replace with your deployed server URL)
    const LICENSE_SERVER = 'https://web-production-3832e.up.railway.app';

    // Load saved preferences (but always start at 256 for consistent experience)
    async function loadPreferences() {
        try {
            const result = await chrome.storage.local.get(['settings', 'captureCount', 'isPro', 'licenseCache', 'extensionId']);

            if (result.settings) {
                state.settings = { ...state.settings, ...result.settings };
            }
            if (typeof result.captureCount === 'number') {
                state.captureCount = result.captureCount;
            }

            // Get or create persistent extension ID for licensing
            let extensionId = result.extensionId;
            if (!extensionId) {
                extensionId = 'cs_' + Math.random().toString(36).substr(2, 16) + Date.now().toString(36);
                await chrome.storage.local.set({ extensionId });
            }
            state.extensionId = extensionId;

            // Check license with server (with fallback to cache)
            await verifyLicense(extensionId, result.licenseCache);

        } catch (e) {
            console.log('Could not load preferences:', e);
        }
    }

    // Verify license with server
    async function verifyLicense(extensionId, cachedLicense) {
        try {
            const response = await fetch(`${LICENSE_SERVER}/verify/${extensionId}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (response.ok) {
                const license = await response.json();
                if (license.valid) {
                    state.isPro = true;
                    state.licenseType = license.type;
                    // Cache the license for offline use (valid for 7 days)
                    await chrome.storage.local.set({
                        isPro: true,
                        licenseCache: {
                            valid: true,
                            type: license.type,
                            checkedAt: Date.now()
                        }
                    });
                } else {
                    state.isPro = false;
                    await chrome.storage.local.set({ isPro: false, licenseCache: null });
                }
            } else {
                // Server error - use cached license if recent
                useCachedLicense(cachedLicense);
            }
        } catch (e) {
            // Network error - use cached license if recent
            console.log('License check failed, using cache');
            useCachedLicense(cachedLicense);
        }
    }

    // Use cached license if it's less than 7 days old
    function useCachedLicense(cachedLicense) {
        if (cachedLicense && cachedLicense.valid) {
            const sevenDays = 7 * 24 * 60 * 60 * 1000;
            if (Date.now() - cachedLicense.checkedAt < sevenDays) {
                state.isPro = true;
                state.licenseType = cachedLicense.type;
            }
        }
    }

    // Start checkout process
    async function startCheckout(priceType) {
        try {
            showToast('Opening checkout...');

            const response = await fetch(`${LICENSE_SERVER}/create-checkout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    extensionId: state.extensionId,
                    priceType: priceType,
                    successUrl: window.location.href,
                    cancelUrl: window.location.href
                })
            });

            if (response.ok) {
                const { url } = await response.json();
                window.open(url, '_blank');
            } else {
                showToast('Checkout failed. Please try again.', true);
            }
        } catch (e) {
            console.error('Checkout error:', e);
            showToast('Connection error. Please try again.', true);
        }
    }

    // Create the overlay UI
    function createOverlay() {
        // Main overlay container
        overlay = document.createElement('div');
        overlay.id = 'circle-snip-overlay';

        // Frozen background (will be set when capture starts)
        frozenBg = document.createElement('div');
        frozenBg.id = 'circle-snip-frozen-bg';
        overlay.appendChild(frozenBg);

        // SVG for dim effect with circle cutout
        dimSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        dimSvg.id = 'circle-snip-dim';
        dimSvg.setAttribute('width', '100%');
        dimSvg.setAttribute('height', '100%');
        dimSvg.innerHTML = `
      <defs>
        <mask id="circle-snip-mask">
          <rect width="100%" height="100%" fill="white"/>
          <circle id="circle-snip-cutout" cx="${state.circle.x}" cy="${state.circle.y}" r="${state.circle.diameter / 2}" fill="black"/>
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#circle-snip-mask)"/>
    `;
        overlay.appendChild(dimSvg);

        // Circle ring
        ring = document.createElement('div');
        ring.id = 'circle-snip-ring';
        updateRingPosition();
        overlay.appendChild(ring);

        // Resize handle (for trackpad users) - visible from start
        const resizeHandle = document.createElement('div');
        resizeHandle.id = 'circle-snip-resize-handle';
        resizeHandle.title = 'Drag to resize';
        // Set initial position (bottom-right of circle at 45 degrees)
        const angle = Math.PI / 4;
        const radius = state.circle.diameter / 2;
        resizeHandle.style.left = (state.circle.x + Math.cos(angle) * radius) + 'px';
        resizeHandle.style.top = (state.circle.y + Math.sin(angle) * radius) + 'px';
        overlay.appendChild(resizeHandle);

        // Center crosshair
        crosshair = document.createElement('div');
        crosshair.id = 'circle-snip-crosshair';
        updateCrosshairPosition();
        overlay.appendChild(crosshair);

        // Size label
        sizeLabel = document.createElement('div');
        sizeLabel.id = 'circle-snip-size';
        updateSizeLabel();
        overlay.appendChild(sizeLabel);

        // Control panel
        panel = document.createElement('div');
        panel.id = 'circle-snip-panel';
        panel.innerHTML = `
      <div class="cs-panel-buttons">
        <button class="cs-btn-primary" id="cs-capture-btn">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2"/>
            <circle cx="8" cy="8" r="3"/>
          </svg>
          Capture
          <span class="cs-kbd">↵</span>
        </button>
        <button class="cs-btn-secondary" id="cs-cancel-btn">
          Cancel
          <span class="cs-kbd-subtle">Esc</span>
        </button>
        <button class="cs-btn-icon" id="cs-settings-btn" title="Settings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
      <div class="cs-hint" id="cs-hint">
        <span class="cs-hint-item">
          <span class="cs-hint-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M5 9l-3 3 3 3M19 9l3 3-3 3M9 5l3-3 3 3M9 19l3 3 3-3"/>
            </svg>
          </span>
          Drag to move
        </span>
        <span class="cs-hint-divider"></span>
        <span class="cs-hint-item">
          <span class="cs-hint-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <circle cx="12" cy="12" r="8"/>
              <path d="M12 8v8M8 12h8"/>
            </svg>
          </span>
          Scroll or drag edge
        </span>
        <span class="cs-hint-divider"></span>
        <span class="cs-hint-item">
          <span class="cs-hint-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </span>
          Enter to capture
        </span>
      </div>
    `;
        overlay.appendChild(panel);

        document.body.appendChild(overlay);

        // Animate size label in
        requestAnimationFrame(() => {
            sizeLabel.classList.add('visible');
        });

        // Gentle scroll hint - appears initially
        const scrollHint = document.createElement('div');
        scrollHint.id = 'circle-snip-scroll-hint';
        scrollHint.innerHTML = `
            <span class="cs-scroll-icon">⟳</span>
            Scroll to resize · or drag the purple handle
        `;
        document.body.appendChild(scrollHint);

        // Enter invite - hidden initially, shown after interaction
        const enterInvite = document.createElement('div');
        enterInvite.id = 'circle-snip-enter-invite';
        enterInvite.style.opacity = '0';
        enterInvite.style.animation = 'none';
        enterInvite.innerHTML = `
            Ready? Press <span class="cs-enter-key">Enter ↵</span> to capture
        `;
        document.body.appendChild(enterInvite);

        // Fallback: if no interaction after 6s, show Enter invite anyway
        setTimeout(() => {
            if (!state.hasInteracted) {
                showEnterInvite();
            }
        }, 6000);
    }

    // Called when user interacts (scrolls or drags)
    function onUserInteraction() {
        if (state.hasInteracted) return;
        state.hasInteracted = true;

        // Fade out scroll hint
        const scrollHint = document.getElementById('circle-snip-scroll-hint');
        if (scrollHint) {
            scrollHint.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            scrollHint.style.opacity = '0';
            scrollHint.style.transform = 'translateX(-50%) translateY(10px)';
            setTimeout(() => scrollHint.remove(), 400);
        }

        // Show Enter invite after a brief pause
        setTimeout(showEnterInvite, 600);
    }

    // Show the Enter invite with animation
    function showEnterInvite() {
        const enterInvite = document.getElementById('circle-snip-enter-invite');
        if (enterInvite && enterInvite.style.opacity === '0') {
            enterInvite.style.animation = 'cs-enter-invite-in 0.5s ease forwards';

            // Auto-fade after 5 seconds
            setTimeout(() => {
                if (enterInvite && enterInvite.parentNode) {
                    enterInvite.style.transition = 'opacity 0.5s ease';
                    enterInvite.style.opacity = '0';
                    setTimeout(() => enterInvite.remove(), 500);
                }
            }, 5000);
        }
    }

    // Update ring position and size
    function updateRingPosition() {
        ring.style.left = state.circle.x + 'px';
        ring.style.top = state.circle.y + 'px';
        ring.style.width = state.circle.diameter + 'px';
        ring.style.height = state.circle.diameter + 'px';
    }

    // Update crosshair position
    function updateCrosshairPosition() {
        crosshair.style.left = state.circle.x + 'px';
        crosshair.style.top = state.circle.y + 'px';
    }

    // Update size label
    function updateSizeLabel() {
        const diameter = Math.round(state.circle.diameter);
        sizeLabel.textContent = `${diameter} × ${diameter}`;
        sizeLabel.style.left = state.circle.x + 'px';
        sizeLabel.style.top = (state.circle.y + state.circle.diameter / 2 + 16) + 'px';
    }

    // Update SVG mask cutout
    function updateMaskCutout() {
        const cutout = document.getElementById('circle-snip-cutout');
        if (cutout) {
            cutout.setAttribute('cx', state.circle.x);
            cutout.setAttribute('cy', state.circle.y);
            cutout.setAttribute('r', state.circle.diameter / 2);
        }
    }

    // Update resize handle position (bottom-right of circle)
    function updateResizeHandle() {
        const handle = document.getElementById('circle-snip-resize-handle');
        if (handle) {
            const angle = Math.PI / 4; // 45 degrees (bottom-right)
            const radius = state.circle.diameter / 2;
            const handleX = state.circle.x + Math.cos(angle) * radius;
            const handleY = state.circle.y + Math.sin(angle) * radius;
            handle.style.left = handleX + 'px';
            handle.style.top = handleY + 'px';
        }
    }

    // Update all visual elements
    function updateVisuals() {
        updateRingPosition();
        updateCrosshairPosition();
        updateSizeLabel();
        updateMaskCutout();
        updateResizeHandle();
    }

    // Snap diameter to common sizes
    function snapToSize(diameter) {
        const snapSizes = [128, 256, 384, 512, 640, 768, 896, 1024];
        const threshold = 20;

        for (const size of snapSizes) {
            if (Math.abs(diameter - size) < threshold) {
                return size;
            }
        }
        return diameter;
    }

    // Constrain circle to viewport
    function constrainCircle(allowDiameterChange = true) {
        const radius = state.circle.diameter / 2;
        const padding = 10;

        // Only constrain diameter if explicitly allowed (during resize operations)
        if (allowDiameterChange) {
            const maxDiameter = Math.min(window.innerWidth, window.innerHeight) - padding * 2;
            state.circle.diameter = Math.max(64, Math.min(state.circle.diameter, maxDiameter));
        }

        // Update radius after potential diameter change
        const newRadius = state.circle.diameter / 2;

        // Constrain position (always)
        state.circle.x = Math.max(newRadius + padding, Math.min(state.circle.x, window.innerWidth - newRadius - padding));
        state.circle.y = Math.max(newRadius + padding, Math.min(state.circle.y, window.innerHeight - newRadius - padding));
    }

    // Attach event listeners
    function attachEventListeners() {
        // Mouse events for dragging
        overlay.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        // Resize handle drag
        const resizeHandle = document.getElementById('circle-snip-resize-handle');
        if (resizeHandle) {
            resizeHandle.addEventListener('mousedown', handleResizeStart);
        }

        // Scroll wheel for resizing
        overlay.addEventListener('wheel', handleWheel, { passive: false });

        // Keyboard shortcuts - use capture phase for reliability
        document.addEventListener('keydown', handleKeyDown, true);

        // Button clicks
        document.getElementById('cs-capture-btn').addEventListener('click', captureCircle);
        document.getElementById('cs-cancel-btn').addEventListener('click', cleanup);
        document.getElementById('cs-settings-btn').addEventListener('click', toggleSettings);
    }

    // Resize handle - start resize
    function handleResizeStart(e) {
        e.preventDefault();
        e.stopPropagation();
        state.isResizing = true;
        state.dragStart = { x: e.clientX, y: e.clientY, diameter: state.circle.diameter };
        overlay.style.cursor = 'nwse-resize';
    }

    // Mouse down - start drag (but not if clicking resize handle)
    function handleMouseDown(e) {
        if (e.target.closest('#circle-snip-panel')) return;
        if (e.target.id === 'circle-snip-resize-handle') return;

        e.preventDefault();
        state.isDragging = true;
        state.dragStart = { x: e.clientX - state.circle.x, y: e.clientY - state.circle.y };
        overlay.style.cursor = 'move';
    }

    // Mouse move - update position or resize
    function handleMouseMove(e) {
        if (state.isResizing) {
            // Check if we've moved enough to actually start resizing (prevents micro-movement jitter)
            const moveDistance = Math.sqrt(
                Math.pow(e.clientX - state.dragStart.x, 2) +
                Math.pow(e.clientY - state.dragStart.y, 2)
            );
            if (moveDistance < 5) return; // Need to move at least 5px before resizing activates

            // Calculate new diameter based on distance from center
            const dx = e.clientX - state.circle.x;
            const dy = e.clientY - state.circle.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const newDiameter = distance * 2;

            state.circle.diameter = newDiameter;
            constrainCircle();
            updateVisuals();
            onUserInteraction();
            savePreference('lastDiameter', Math.round(state.circle.diameter));
            return;
        }

        if (!state.isDragging) return;

        state.circle.x = e.clientX - state.dragStart.x;
        state.circle.y = e.clientY - state.dragStart.y;

        constrainCircle(false); // Don't change diameter when just moving
        updateVisuals();
        onUserInteraction();
    }

    // Mouse up - end drag or resize
    function handleMouseUp() {
        if (state.isDragging) {
            state.isDragging = false;
            overlay.style.cursor = 'default';
        }
        if (state.isResizing) {
            state.isResizing = false;
            overlay.style.cursor = 'default';
        }
    }

    // Scroll wheel - resize
    function handleWheel(e) {
        if (e.target.closest('#circle-snip-panel')) return;

        e.preventDefault();

        const delta = e.deltaY > 0 ? -20 : 20;
        let newDiameter = state.circle.diameter + delta;

        // Shift key snaps to common sizes
        if (e.shiftKey) {
            newDiameter = snapToSize(newDiameter);
        }

        // Alt key resizes from center (default behavior anyway)

        state.circle.diameter = newDiameter;
        constrainCircle();
        updateVisuals();
        onUserInteraction();

        // Save last diameter preference
        savePreference('lastDiameter', Math.round(state.circle.diameter));
    }

    // Keyboard handler - robust capture
    function handleKeyDown(e) {
        // Only handle if overlay is active
        if (!overlay) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cleanup();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            captureCircle();
        }
    }

    // Toggle settings panel
    function toggleSettings() {
        let settingsPanel = document.getElementById('circle-snip-settings');

        if (settingsPanel) {
            settingsPanel.remove();
            return;
        }

        settingsPanel = document.createElement('div');
        settingsPanel.id = 'circle-snip-settings';
        settingsPanel.innerHTML = `
      <div class="cs-settings-title">Settings</div>
      <div class="cs-settings-item">
        <span class="cs-settings-label">Auto-copy to clipboard</span>
        <label class="cs-toggle">
          <input type="checkbox" id="cs-setting-autocopy" ${state.settings.autoCopy ? 'checked' : ''}>
          <span class="cs-toggle-slider"></span>
        </label>
      </div>
      <div class="cs-settings-item">
        <span class="cs-settings-label">Auto-download</span>
        <label class="cs-toggle">
          <input type="checkbox" id="cs-setting-autodownload" ${state.settings.autoDownload ? 'checked' : ''}>
          <span class="cs-toggle-slider"></span>
        </label>
      </div>
      <div class="cs-settings-item">
        <span class="cs-settings-label">Sound feedback</span>
        <label class="cs-toggle">
          <input type="checkbox" id="cs-setting-sound" ${state.settings.soundEnabled ? 'checked' : ''}>
          <span class="cs-toggle-slider"></span>
        </label>
      </div>
    `;

        document.body.appendChild(settingsPanel);

        // Attach toggle listeners
        document.getElementById('cs-setting-autocopy').addEventListener('change', (e) => {
            state.settings.autoCopy = e.target.checked;
            savePreference('settings', state.settings);
        });

        document.getElementById('cs-setting-autodownload').addEventListener('change', (e) => {
            state.settings.autoDownload = e.target.checked;
            savePreference('settings', state.settings);
        });

        document.getElementById('cs-setting-sound').addEventListener('change', (e) => {
            state.settings.soundEnabled = e.target.checked;
            savePreference('settings', state.settings);
        });

        // Close when clicking outside
        setTimeout(() => {
            document.addEventListener('click', closeSettingsOnClickOutside);
        }, 100);
    }

    function closeSettingsOnClickOutside(e) {
        const settingsPanel = document.getElementById('circle-snip-settings');
        const settingsBtn = document.getElementById('cs-settings-btn');

        if (settingsPanel && !settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
            settingsPanel.remove();
            document.removeEventListener('click', closeSettingsOnClickOutside);
        }
    }

    // Save preference
    function savePreference(key, value) {
        try {
            chrome.storage.local.set({ [key]: value });
        } catch (e) {
            console.log('Could not save preference');
        }
    }

    // Capture the circle
    async function captureCircle() {
        if (!state.imageData) {
            showToast('No image captured', true);
            return;
        }

        // Check monetization before processing (after 3 free captures)
        const FREE_CAPTURES = 3;
        if (!state.isPro && state.captureCount >= FREE_CAPTURES) {
            cleanup();
            showUpgradeModal();
            return;
        }

        try {
            // Process the image - pass viewport dimensions for accurate scaling
            const processor = new window.CircleSnipProcessor();
            const viewport = {
                width: window.innerWidth,
                height: window.innerHeight
            };
            const resultDataUrl = await processor.process(
                state.imageData,
                state.circle,
                viewport
            );

            // Generate filename
            const filename = window.CircleSnipProcessor.generateFilename();

            // Results
            let copied = false;
            let downloaded = false;

            // Auto-copy to clipboard
            if (state.settings.autoCopy) {
                copied = await processor.copyToClipboard(resultDataUrl);
            }

            // Auto-download
            if (state.settings.autoDownload) {
                processor.download(resultDataUrl, filename);
                downloaded = true;
            }

            // Play sound if enabled
            if (state.settings.soundEnabled) {
                playClickSound();
            }

            // Increment capture count and save
            state.captureCount++;
            savePreference('captureCount', state.captureCount);

            // Show success feedback
            cleanup();
            showPreview(resultDataUrl, filename, copied, downloaded);

        } catch (error) {
            console.error('Capture failed:', error);
            showToast('Capture failed: ' + error.message, true);
        }
    }

    // Show warm upgrade modal
    function showUpgradeModal() {
        const modal = document.createElement('div');
        modal.id = 'circle-snip-upgrade-modal';
        modal.innerHTML = `
            <div class="cs-upgrade-backdrop"></div>
            <div class="cs-upgrade-card">
                <div class="cs-upgrade-icon">✨</div>
                <h2 class="cs-upgrade-title">You're on a roll!</h2>
                <p class="cs-upgrade-subtitle">You've captured ${state.captureCount} beautiful screenshots.<br>Keep the magic going!</p>
                
                <div class="cs-upgrade-value">
                    <div class="cs-upgrade-value-item">
                        <span class="cs-upgrade-check">✓</span>
                        Unlimited circle captures
                    </div>
                    <div class="cs-upgrade-value-item">
                        <span class="cs-upgrade-check">✓</span>
                        Auto-copy & instant download
                    </div>
                    <div class="cs-upgrade-value-item">
                        <span class="cs-upgrade-check">✓</span>
                        Premium support
                    </div>
                </div>
                
                <div class="cs-upgrade-options">
                    <div class="cs-upgrade-option" id="cs-upgrade-monthly">
                        <div class="cs-upgrade-option-price">$1.99</div>
                        <div class="cs-upgrade-option-period">per month</div>
                        <div class="cs-upgrade-option-desc">Cancel anytime</div>
                    </div>
                    <div class="cs-upgrade-option cs-upgrade-option-best" id="cs-upgrade-lifetime">
                        <div class="cs-upgrade-option-badge">Best Value</div>
                        <div class="cs-upgrade-option-price">$4.99</div>
                        <div class="cs-upgrade-option-period">one time</div>
                        <div class="cs-upgrade-option-desc">Forever yours</div>
                    </div>
                </div>
                
                <button class="cs-upgrade-btn-secondary" id="cs-upgrade-later">
                    Maybe later
                </button>
            </div>
        `;

        document.body.appendChild(modal);

        // Handle monthly subscription
        document.getElementById('cs-upgrade-monthly').addEventListener('click', async () => {
            await startCheckout('monthly');
        });

        // Handle lifetime purchase
        document.getElementById('cs-upgrade-lifetime').addEventListener('click', async () => {
            await startCheckout('lifetime');
        });

        // Handle later button
        document.getElementById('cs-upgrade-later').addEventListener('click', () => {
            modal.remove();
        });

        // Close on backdrop click
        modal.querySelector('.cs-upgrade-backdrop').addEventListener('click', () => {
            modal.remove();
        });
    }

    // Show preview after capture
    function showPreview(dataUrl, filename, copied, downloaded) {
        const preview = document.createElement('div');
        preview.id = 'circle-snip-preview';
        preview.innerHTML = `
      <img src="${dataUrl}" alt="Captured circle">
      <div class="cs-preview-status">
        ${copied ? '✓ Copied to clipboard' : ''}${copied && downloaded ? ' · ' : ''}${downloaded ? '✓ Saved' : ''}
      </div>
      <div class="cs-preview-actions">
        <button class="cs-btn-secondary" id="cs-preview-copy">
          ${copied ? '✓ Copied' : 'Copy'}
        </button>
        <button class="cs-btn-secondary" id="cs-preview-download">
          ${downloaded ? '✓ Saved' : 'Save'}
        </button>
      </div>
      <button class="cs-btn-another" id="cs-preview-another">
        ✨ Take another
      </button>
    `;

        document.body.appendChild(preview);

        // Show toast
        let message = [];
        if (copied) message.push('Copied');
        if (downloaded) message.push('Saved');
        if (message.length) {
            showToast('✓ ' + message.join(' + '));
        }

        // Attach preview button handlers
        document.getElementById('cs-preview-copy').addEventListener('click', async () => {
            const processor = new window.CircleSnipProcessor();
            const success = await processor.copyToClipboard(dataUrl);
            if (success) {
                document.getElementById('cs-preview-copy').textContent = '✓ Copied';
                showToast('✓ Copied to clipboard');
            }
        });

        document.getElementById('cs-preview-download').addEventListener('click', () => {
            const processor = new window.CircleSnipProcessor();
            processor.download(dataUrl, filename);
            document.getElementById('cs-preview-download').textContent = '✓ Saved';
        });

        document.getElementById('cs-preview-another').addEventListener('click', () => {
            preview.remove();
            // Request new capture
            chrome.runtime.sendMessage({ action: 'retake' });
        });

        // Auto-hide after 15 seconds (longer to give time to decide)
        setTimeout(() => {
            if (document.getElementById('circle-snip-preview')) {
                preview.style.animation = 'cs-toast-out 0.3s ease forwards';
                setTimeout(() => preview.remove(), 300);
            }
        }, 15000);

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (!preview.contains(e.target) && document.getElementById('circle-snip-preview')) {
                preview.style.animation = 'cs-toast-out 0.3s ease forwards';
                setTimeout(() => preview.remove(), 300);
            }
        }, { once: true });
    }

    // Show toast notification
    function showToast(message, isError = false) {
        // Remove existing toast
        const existing = document.querySelector('.cs-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'cs-toast' + (isError ? ' cs-toast-error' : '');
        toast.innerHTML = `<span>${message}</span>`;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('cs-toast-hide');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Play click sound
    function playClickSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            gainNode.gain.value = 0.1;

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.05);
        } catch (e) {
            // Sound not available
        }
    }

    // Cleanup - remove overlay and reset state
    function cleanup() {
        window.__circleSnipActive = false;

        // Remove all event listeners
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('keydown', handleKeyDown);

        // Remove overlay
        if (overlay) {
            overlay.remove();
            overlay = null;
        }

        // Remove settings panel if open
        const settingsPanel = document.getElementById('circle-snip-settings');
        if (settingsPanel) settingsPanel.remove();
    }

    // Listen for messages from service worker
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'startSelection') {
            state.imageData = request.imageData;
            state.dpr = request.devicePixelRatio || window.devicePixelRatio || 1;

            // Set frozen background
            if (frozenBg && state.imageData) {
                frozenBg.style.backgroundImage = `url(${state.imageData})`;
            }

            sendResponse({ success: true });
        }
        return true;
    });

    // Initialize when script loads
    init();

})();
