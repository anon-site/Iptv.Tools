// ==================== Advanced Player System ====================
let mainPlayer = null;
let modalPlayer = null;

document.addEventListener('DOMContentLoaded', () => {
    initializePlayers();
    setupPlayerControls();
});

// ==================== Initialize Players ====================
function initializePlayers() {
    // Initialize main player
    if (document.getElementById('main-player')) {
        mainPlayer = videojs('main-player', {
            controls: true,
            autoplay: false,
            preload: 'auto',
            fluid: true,
            responsive: true,
            liveui: true,
            controlBar: {
                volumePanel: {
                    inline: false
                },
                pictureInPictureToggle: true
            }
        });
        
        mainPlayer.on('error', handlePlayerError);
        mainPlayer.on('loadedmetadata', () => {
            console.log('✅ تم تحميل البيانات الوصفية');
        });
        
        mainPlayer.on('playing', () => {
            console.log('▶️ بدء التشغيل');
            app.showToast('بدء التشغيل', 'success');
        });
    }
    
    // Initialize modal player
    if (document.getElementById('modal-player')) {
        modalPlayer = videojs('modal-player', {
            controls: true,
            autoplay: true,
            preload: 'auto',
            fluid: true,
            responsive: true,
            liveui: true,
            controlBar: {
                volumePanel: {
                    inline: false
                },
                pictureInPictureToggle: true
            }
        });
        
        modalPlayer.on('error', handlePlayerError);
    }
    
    console.log('🎬 تم تهيئة المشغلات');
}

// ==================== Player Controls Setup ====================
function setupPlayerControls() {
    // Play button
    const playBtn = document.getElementById('play-btn');
    if (playBtn) {
        playBtn.addEventListener('click', () => {
            const url = document.getElementById('stream-url').value.trim();
            if (url) {
                playStream(url, mainPlayer);
            } else {
                app.showToast('الرجاء إدخال رابط البث', 'warning');
            }
        });
    }
    
    // Enter key to play
    const streamInput = document.getElementById('stream-url');
    if (streamInput) {
        streamInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const url = streamInput.value.trim();
                if (url) {
                    playStream(url, mainPlayer);
                }
            }
        });
    }
    
    // Fullscreen button
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            if (mainPlayer) {
                if (mainPlayer.isFullscreen()) {
                    mainPlayer.exitFullscreen();
                } else {
                    mainPlayer.requestFullscreen();
                }
            }
        });
    }
    
    // Picture-in-Picture button
    const pipBtn = document.getElementById('pip-btn');
    if (pipBtn) {
        pipBtn.addEventListener('click', () => {
            if (mainPlayer && document.pictureInPictureEnabled) {
                const videoElement = mainPlayer.el().querySelector('video');
                if (document.pictureInPictureElement) {
                    document.exitPictureInPicture();
                } else {
                    videoElement.requestPictureInPicture().catch(err => {
                        console.error('خطأ في PIP:', err);
                        app.showToast('متصفحك لا يدعم خاصية الصورة في صورة', 'error');
                    });
                }
            }
        });
    }
}

// ==================== Play Stream Function ====================
async function playStream(url, player = mainPlayer, type = null) {
    if (!app.isValidUrl(url)) {
        app.showToast('الرابط غير صحيح', 'error');
        return;
    }
    
    try {
        app.showToast('جاري تحميل البث...', 'info');
        
        // If type is iframe, open in new window or modal with iframe
        if (type === 'iframe') {
            const playerContainer = player.el().parentElement;
            const videoElement = player.el();
            
            // Hide video player
            videoElement.style.display = 'none';
            
            // Create iframe
            let iframe = playerContainer.querySelector('.embedded-iframe');
            if (!iframe) {
                iframe = document.createElement('iframe');
                iframe.className = 'embedded-iframe';
                iframe.style.width = '100%';
                iframe.style.height = '100%';
                iframe.style.border = 'none';
                iframe.allow = 'autoplay; fullscreen';
                iframe.allowFullscreen = true;
                playerContainer.appendChild(iframe);
            }
            
            iframe.src = url;
            iframe.style.display = 'block';
            
            app.showToast('تم تحميل المشغل', 'success');
            return;
        }
        
        // Remove any existing iframe
        const playerContainer = player.el().parentElement;
        const existingIframe = playerContainer.querySelector('.embedded-iframe');
        if (existingIframe) {
            existingIframe.remove();
        }
        player.el().style.display = 'block';
        
        const streamType = type || app.detectStreamType(url);
        console.log(`🎬 نوع البث: ${streamType}`);
        
        // Reset player
        player.pause();
        player.reset();
        
        // Clean up previous instances
        if (player.hls) {
            player.hls.destroy();
            player.hls = null;
        }
        if (player.dash) {
            player.dash.reset();
            player.dash = null;
        }
        
        switch (streamType) {
            case 'hls':
                await playHLS(url, player);
                break;
            case 'dash':
                await playDASH(url, player);
                break;
            case 'video':
                player.src({
                    src: url,
                    type: getVideoMimeType(url)
                });
                player.play();
                break;
            default:
                // For IPTV links, try multiple methods
                await playIPTV(url, player);
        }
        
        console.log('✅ تم تحميل البث بنجاح');
    } catch (error) {
        console.error('❌ خطأ في تشغيل البث:', error);
        app.showToast('فشل في تشغيل البث. جرب فتح الرابط في VLC', 'error', 5000);
    }
}

// ==================== IPTV Playback (Multi-method) ====================
async function playIPTV(url, player) {
    console.log('📡 محاولة تشغيل IPTV...');
    
    // Method 1: Try as direct TS stream
    try {
        player.src({
            src: url,
            type: 'application/x-mpegURL'
        });
        
        await player.play();
        
        // If play succeeded, we're good
        app.showToast('✅ تم تشغيل القناة', 'success', 2000);
        return;
    } catch (e) {
        console.log('❌ فشلت الطريقة 1:', e.message);
    }
    
    // Method 2: Try HLS with custom config
    if (Hls.isSupported()) {
        try {
            const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                backBufferLength: 90,
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
                xhrSetup: function(xhr, url) {
                    // Add any custom headers if needed
                    xhr.withCredentials = false;
                }
            });
            
            hls.loadSource(url);
            hls.attachMedia(player.el().querySelector('video'));
            
            await new Promise((resolve, reject) => {
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    player.play();
                    app.showToast('✅ تم تشغيل القناة', 'success', 2000);
                    resolve();
                });
                
                hls.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        console.error('❌ HLS Error:', data);
                        reject(new Error(data.type));
                    }
                });
                
                // Timeout after 10 seconds
                setTimeout(() => reject(new Error('Timeout')), 10000);
            });
            
            player.hls = hls;
            return;
        } catch (e) {
            console.log('❌ فشلت الطريقة 2:', e.message);
        }
    }
    
    // Method 3: Try as direct video/mp2t
    try {
        player.src({
            src: url,
            type: 'video/mp2t'
        });
        
        await player.play();
        app.showToast('✅ تم تشغيل القناة', 'success', 2000);
        return;
    } catch (e) {
        console.log('❌ فشلت الطريقة 3:', e.message);
    }
    
    // If all methods failed, throw error
    throw new Error('فشل تشغيل IPTV. الرابط قد يحتاج مصادقة أو غير متاح');
}

// ==================== HLS Playback ====================
async function playHLS(url, player) {
    if (Hls.isSupported()) {
        const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 90
        });
        
        hls.loadSource(url);
        hls.attachMedia(player.el().querySelector('video'));
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            player.play();
            console.log('✅ HLS Manifest تم تحميله');
        });
        
        hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        console.error('خطأ في الشبكة');
                        hls.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        console.error('خطأ في الوسائط');
                        hls.recoverMediaError();
                        break;
                    default:
                        console.error('خطأ غير قابل للإصلاح');
                        hls.destroy();
                        break;
                }
            }
        });
        
        // Store hls instance for cleanup
        player.hls = hls;
    } else if (player.el().querySelector('video').canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari)
        player.src({
            src: url,
            type: 'application/x-mpegURL'
        });
        player.play();
    } else {
        throw new Error('HLS not supported');
    }
}

// ==================== DASH Playback ====================
async function playDASH(url, player) {
    if (typeof dashjs !== 'undefined') {
        const dashPlayer = dashjs.MediaPlayer().create();
        dashPlayer.initialize(player.el().querySelector('video'), url, true);
        
        dashPlayer.on(dashjs.MediaPlayer.events.ERROR, (e) => {
            console.error('DASH Error:', e);
            app.showToast('خطأ في تشغيل DASH', 'error');
        });
        
        // Store dash instance for cleanup
        player.dash = dashPlayer;
    } else {
        throw new Error('DASH.js not loaded');
    }
}

// ==================== Get Video MIME Type ====================
function getVideoMimeType(url) {
    const ext = app.getFileExtension(url);
    const mimeTypes = {
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'ogg': 'video/ogg',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',
        'mkv': 'video/x-matroska',
        'flv': 'video/x-flv'
    };
    return mimeTypes[ext] || 'video/mp4';
}

// ==================== Error Handling ====================
function handlePlayerError(error) {
    const player = this;
    const errorData = player.error();
    
    if (errorData) {
        console.error('Player Error:', errorData);
        
        let errorMessage = 'خطأ في التشغيل';
        switch (errorData.code) {
            case 1:
                errorMessage = 'تم إلغاء التحميل';
                break;
            case 2:
                errorMessage = 'خطأ في الشبكة';
                break;
            case 3:
                errorMessage = 'خطأ في فك التشفير';
                break;
            case 4:
                errorMessage = 'المصدر غير مدعوم';
                break;
        }
        
        app.showToast(errorMessage, 'error');
    }
}

// ==================== Modal Player Functions ====================
let currentChannelData = null;

function openVideoModal(channelData) {
    const modal = document.getElementById('video-modal');
    const channelName = document.getElementById('channel-name');
    const channelCategory = document.getElementById('channel-category');
    const channelUrl = document.getElementById('channel-url');
    const iptvWarning = document.getElementById('iptv-warning');
    
    // Store current channel data
    currentChannelData = channelData;
    
    // Set channel info
    channelName.textContent = channelData.name || 'قناة غير معروفة';
    channelCategory.textContent = channelData.category || '-';
    channelUrl.textContent = channelData.url;
    
    // Show IPTV warning if it's an IPTV link
    if (isIPTVUrl(channelData.url)) {
        iptvWarning.style.display = 'block';
    } else {
        iptvWarning.style.display = 'none';
    }
    
    // Setup copy button
    const copyBtn = document.getElementById('copy-url-btn');
    copyBtn.onclick = () => {
        app.copyToClipboard(channelData.url);
    };
    
    // Show modal
    modal.classList.add('active');
    
    // Play stream in modal player
    if (modalPlayer) {
        playStream(channelData.url, modalPlayer, channelData.type || null);
    }
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
}

// Check if URL is IPTV
function isIPTVUrl(url) {
    return url.includes(':8080/') || 
           url.includes('/live/') || 
           url.match(/\/[a-z0-9]+\/[a-z0-9]+\/\d+$/i);
}

// Download single channel as M3U
function downloadSingleChannel() {
    if (!currentChannelData) return;
    
    const channel = currentChannelData;
    let m3uContent = '#EXTM3U\n\n';
    m3uContent += `#EXTINF:-1,${channel.name}\n`;
    m3uContent += `${channel.url}\n`;
    
    const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${channel.name.replace(/[^a-z0-9]/gi, '_')}.m3u`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    app.showToast(`✅ تم تحميل ${channel.name}.m3u`, 'success', 3000);
}

function closeVideoModal() {
    const modal = document.getElementById('video-modal');
    modal.classList.remove('active');
    
    // Stop modal player
    if (modalPlayer) {
        modalPlayer.pause();
        modalPlayer.reset();
        
        // Clean up HLS/DASH instances
        if (modalPlayer.hls) {
            modalPlayer.hls.destroy();
            modalPlayer.hls = null;
        }
        if (modalPlayer.dash) {
            modalPlayer.dash.reset();
            modalPlayer.dash = null;
        }
    }
    
    // Enable body scroll
    document.body.style.overflow = '';
}

// Setup modal close button
document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('close-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeVideoModal);
    }
    
    // Close modal on backdrop click
    const modal = document.getElementById('video-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeVideoModal();
            }
        });
    }
    
    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('video-modal');
            if (modal.classList.contains('active')) {
                closeVideoModal();
            }
        }
    });
});

// ==================== Export Functions ====================
window.player = {
    playStream,
    openVideoModal,
    closeVideoModal,
    mainPlayer: () => mainPlayer,
    modalPlayer: () => modalPlayer
};

// Make downloadSingleChannel globally accessible
window.downloadSingleChannel = downloadSingleChannel;
