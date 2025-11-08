// ==================== M3U Parser System ====================
let channels = [];
let filteredChannels = [];
let hideOffline = false;
let myPlaylist = []; // User's custom playlist

document.addEventListener('DOMContentLoaded', () => {
    setupM3UParser();
    loadPlaylistFromStorage();
});

function setupM3UParser() {
    const parseBtn = document.getElementById('parse-m3u-btn');
    const downloadBtn = document.getElementById('download-m3u-btn');
    const m3uUrlInput = document.getElementById('m3u-url');
    const fileInput = document.getElementById('m3u-file-input');
    const fileNameDisplay = document.getElementById('file-name-display');
    
    if (parseBtn) {
        parseBtn.addEventListener('click', () => {
            const url = m3uUrlInput.value.trim();
            if (url) {
                parseM3U(url);
            } else {
                app.showToast('الرجاء إدخال رابط M3U أو رفع ملف', 'warning');
            }
        });
    }
    
    // Download M3U button
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            const url = m3uUrlInput.value.trim();
            if (url) {
                downloadM3UFile(url);
            } else {
                app.showToast('الرجاء إدخال رابط M3U', 'warning');
            }
        });
    }
    
    if (m3uUrlInput) {
        m3uUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const url = m3uUrlInput.value.trim();
                if (url) {
                    parseM3U(url);
                }
            }
        });
    }
    
    // Setup file upload
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleFileUpload(file, fileNameDisplay);
            }
        });
    }
    
    // Setup search
    const searchInput = document.getElementById('channel-search');
    if (searchInput) {
        searchInput.addEventListener('input', app.debounce((e) => {
            filterChannels(e.target.value);
        }, 300));
    }
    
    // Setup filter buttons
    setupFilterButtons();
}

// ==================== Handle File Upload ====================
async function handleFileUpload(file, displayElement) {
    // Validate file type
    const validExtensions = ['.m3u', '.m3u8', '.txt'];
    const fileName = file.name.toLowerCase();
    const isValid = validExtensions.some(ext => fileName.endsWith(ext));
    
    if (!isValid) {
        app.showToast('نوع الملف غير مدعوم. استخدم ملف M3U أو M3U8', 'error');
        return;
    }
    
    // Display file name
    if (displayElement) {
        displayElement.textContent = `✅ ${file.name}`;
        displayElement.style.color = '#4CAF50';
    }
    
    const loading = document.getElementById('loading');
    loading.style.display = 'block';
    
    try {
        app.showToast('جاري قراءة الملف...', 'info');
        
        // Read file content
        const m3uContent = await readFileContent(file);
        
        // Validate content
        if (!isValidM3UContent(m3uContent)) {
            throw new Error('الملف ليس M3U صحيح أو فارغ');
        }
        
        // Parse M3U content
        channels = parseM3UContent(m3uContent);
        filteredChannels = [...channels];
        
        if (channels.length > 0) {
            app.showToast(`تم تحليل ${channels.length} قناة من الملف`, 'success');
            
            // Show controls
            document.getElementById('m3u-controls').style.display = 'block';
            
            // Display channels
            displayChannels(filteredChannels);
            
            // Update stats
            updateStats();
            
            // Auto-check channels
            setTimeout(() => {
                const checkMsg = channels.length > 50 ? 
                    `🔄 فحص ${channels.length} قناة تلقائيًا... (قد يستغرق بضع دقائق)` :
                    `🔄 فحص ${channels.length} قناة تلقائيًا...`;
                app.showToast(checkMsg, 'info', 3000);
                checkAllChannels(true);
            }, 1000);
        } else {
            app.showToast('لم يتم العثور على قنوات', 'warning');
        }
    } catch (error) {
        console.error('خطأ في قراءة الملف:', error);
        app.showToast('فشل في قراءة الملف', 'error');
        if (displayElement) {
            displayElement.textContent = `❌ خطأ في قراءة ${file.name}`;
            displayElement.style.color = '#f44336';
        }
    } finally {
        loading.style.display = 'none';
    }
}

// ==================== Read File Content ====================
function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            let content = e.target.result;
            // Fix encoding if needed
            content = fixEncoding(content);
            resolve(content);
        };
        
        reader.onerror = () => {
            reject(new Error('فشل في قراءة الملف'));
        };
        
        // Read as text with UTF-8 encoding
        reader.readAsText(file, 'UTF-8');
    });
}

// ==================== Download M3U File ====================
async function downloadM3UFile(url) {
    if (!app.isValidUrl(url)) {
        app.showToast('الرابط غير صحيح', 'error');
        return;
    }
    
    app.showToast('جاري تحميل الملف...', 'info');
    
    try {
        // Create a temporary anchor element to download
        const a = document.createElement('a');
        a.href = url;
        a.download = `playlist_${Date.now()}.m3u`;
        a.target = '_blank'; // Open in new tab if download fails
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        app.showToast('تم بدء التحميل! بعد التحميل، قم برفع الملف للمحلل', 'success', 4000);
    } catch (error) {
        console.error('خطأ في التحميل:', error);
        
        // Fallback: try to open in new tab
        app.showToast('فتح الرابط في علامة تبويب جديدة... احفظ الملف يدوياً', 'info', 4000);
        window.open(url, '_blank');
    }
}

// ==================== Parse M3U Function ====================
async function parseM3U(url) {
    if (!app.isValidUrl(url)) {
        app.showToast('الرابط غير صحيح', 'error');
        return;
    }
    
    const loading = document.getElementById('loading');
    loading.style.display = 'block';
    
    try {
        app.showToast('جاري تحليل قائمة M3U...', 'info');
        
        let m3uContent = '';
        let usedProxy = false;
        
        // Multiple proxy options - ordered by reliability
        const proxyOptions = [
            // Check if local PHP proxy exists
            url => `proxy.php?url=${encodeURIComponent(url)}`,
            // Public CORS proxies
            url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
            url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
            url => `https://cors-anywhere.herokuapp.com/${url}`,
            url => `https://thingproxy.freeboard.io/fetch/${url}`,
            url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
            url => `https://proxy.cors.sh/${url}`,
            url => `https://cors.proxy.lc/${url}`,
            // Try direct as last resort
            null
        ];
        
        let lastError = null;
        
        for (const proxyFn of proxyOptions) {
            try {
                const fetchUrl = proxyFn ? proxyFn(url) : url;
                
                if (proxyFn) {
                    const proxyName = fetchUrl.includes('proxy.php') ? 'المحلي' : 
                                     fetchUrl.includes('allorigins') ? 'AllOrigins' :
                                     fetchUrl.includes('corsproxy') ? 'CorsProxy' :
                                     fetchUrl.includes('cors-anywhere') ? 'CORS-Anywhere' :
                                     fetchUrl.includes('thingproxy') ? 'ThingProxy' :
                                     fetchUrl.includes('codetabs') ? 'CodeTabs' :
                                     fetchUrl.includes('cors.sh') ? 'CORS.sh' :
                                     fetchUrl.includes('cors.proxy.lc') ? 'ProxyLC' : 'proxy';
                    console.log(`🔄 محاولة عبر ${proxyName}...`);
                    usedProxy = true;
                }
                
                const response = await fetch(fetchUrl, {
                    method: 'GET',
                    headers: proxyFn ? {} : {
                        'Accept': '*/*',
                        'Cache-Control': 'no-cache',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    redirect: 'follow', // Follow redirects automatically
                    credentials: 'omit' // Don't send credentials
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                // Get content as text
                m3uContent = await response.text();
                
                // Check if content is valid
                if (!m3uContent || m3uContent.length < 10) {
                    throw new Error('محتوى فارغ');
                }
                
                // Try to detect and fix encoding issues
                m3uContent = fixEncoding(m3uContent);
                
                if (usedProxy) {
                    const proxyName = fetchUrl.includes('proxy.php') ? 'الخادم المحلي' : 
                                     fetchUrl.includes('allorigins') ? 'AllOrigins' :
                                     fetchUrl.includes('corsproxy') ? 'CorsProxy' :
                                     fetchUrl.includes('cors-anywhere') ? 'CORS-Anywhere' :
                                     fetchUrl.includes('thingproxy') ? 'ThingProxy' :
                                     fetchUrl.includes('codetabs') ? 'CodeTabs' :
                                     fetchUrl.includes('cors.sh') ? 'CORS.sh' :
                                     fetchUrl.includes('cors.proxy.lc') ? 'ProxyLC' : 'CORS proxy';
                    app.showToast(`✅ تم التحميل عبر ${proxyName}`, 'success', 2000);
                }
                
                // Success! Break the loop
                break;
                
            } catch (error) {
                lastError = error;
                const proxyName = proxyFn ? 'proxy' : 'direct';
                console.log(`❌ فشل (${proxyName}): ${error.message}`);
                // Continue to next proxy
                continue;
            }
        }
        
        // If all proxies failed
        if (!m3uContent) {
            const errorMsg = lastError?.message || 'غير معروف';
            console.error('❌ فشلت جميع محاولات الاتصال:', errorMsg);
            
            // Show helpful error message
            app.showToast(
                `❌ لم يتمكن من تحميل الرابط<br>جرّب تنزيل الملف ورفعه يدوياً`, 
                'error', 
                5000
            );
            
            throw new Error(`فشل في تحميل الملف: ${errorMsg}`);
        }
        
        // Validate content
        if (!isValidM3UContent(m3uContent)) {
            throw new Error('الملف ليس M3U صحيح أو فارغ');
        }
        
        // Detect format
        const format = detectM3UFormat(m3uContent);
        
        // Parse M3U content
        channels = parseM3UContent(m3uContent);
        filteredChannels = [...channels];
        
        if (channels.length > 0) {
            app.showToast(`تم تحليل ${channels.length} قناة`, 'success');
            
            // Show controls
            document.getElementById('m3u-controls').style.display = 'block';
            
            // Display channels
            displayChannels(filteredChannels);
            
            // Update stats
            updateStats();
            
            // Auto-check channels after a short delay
            setTimeout(() => {
                const checkMsg = channels.length > 50 ? 
                    `🔄 فحص ${channels.length} قناة تلقائيًا... (قد يستغرق بضع دقائق)` :
                    `🔄 فحص ${channels.length} قناة تلقائيًا...`;
                app.showToast(checkMsg, 'info', 3000);
                checkAllChannels(true); // true = auto mode
            }, 1000);
        } else {
            app.showToast('لم يتم العثور على قنوات', 'warning');
        }
    } catch (error) {
        console.error('خطأ في تحليل M3U:', error);
        app.showToast('فشل في تحليل قائمة M3U', 'error');
    } finally {
        loading.style.display = 'none';
    }
}

// ==================== Parse M3U Content ====================
function parseM3UContent(content) {
    const parsedChannels = [];
    
    // Normalize line endings (support all formats)
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Remove BOM if present
    if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
    }
    
    const lines = content.split('\n');
    let currentChannel = null;
    let skipNext = false;
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        
        // Skip empty lines
        if (!line) continue;
        
        // Skip comments that are not EXTINF
        if (line.startsWith('##') || line.startsWith('//')) continue;
        
        // Check for EXTINF line (case insensitive, flexible format)
        if (line.match(/^#EXTINF:/i)) {
            // Parse channel info
            currentChannel = parseExtInf(line);
            skipNext = false;
        } 
        // Check for #EXTM3U header
        else if (line.match(/^#EXTM3U/i)) {
            // Just skip, but log it
            console.log('✅ ملف M3U صحيح');
            continue;
        }
        // Check for EXTGRP (group info)
        else if (line.match(/^#EXTGRP:/i)) {
            if (currentChannel) {
                const groupMatch = line.match(/#EXTGRP:(.+)/i);
                if (groupMatch && !currentChannel.group) {
                    currentChannel.group = groupMatch[1].trim();
                }
            }
        }
        // Check for EXTVLCOPT (VLC options - may contain useful info)
        else if (line.match(/^#EXTVLCOPT:/i)) {
            if (currentChannel) {
                const refererMatch = line.match(/http-referrer=(.+)/i);
                const userAgentMatch = line.match(/http-user-agent=(.+)/i);
                // Store if needed later
            }
        }
        // Check for KODIPROP (Kodi properties)
        else if (line.match(/^#KODIPROP:/i)) {
            // Skip for now, but channel is still valid
            continue;
        }
        // Check for other common M3U tags
        else if (line.match(/^#(EXT-X-|PLAYLIST|STREAM|BANDWIDTH)/i)) {
            // These are HLS/streaming protocol tags, not channel info
            continue;
        }
        // Check if this is a URL line
        else if (!line.startsWith('#') && currentChannel && !skipNext) {
            // More flexible URL validation
            const isValidUrl = 
                line.startsWith('http://') || 
                line.startsWith('https://') || 
                line.startsWith('rtmp://') || 
                line.startsWith('rtmps://') ||
                line.startsWith('rtsp://') ||
                line.startsWith('rtp://') ||
                line.startsWith('mms://') ||
                line.startsWith('mmsh://') ||
                line.startsWith('udp://') ||
                line.match(/^[a-z][a-z0-9+.-]*:\/\//i); // Generic protocol pattern
            
            if (isValidUrl) {
                currentChannel.url = line.trim();
                
                // Only add if we have at least a URL
                if (currentChannel.url) {
                    // If no name, create a meaningful default
                    if (!currentChannel.name || currentChannel.name.length === 0) {
                        // Try to extract name from URL
                        const urlName = extractNameFromUrl(currentChannel.url);
                        currentChannel.name = urlName || `قناة ${parsedChannels.length + 1}`;
                    }
                    
                    // Clean up the channel object
                    currentChannel.name = currentChannel.name.trim();
                    if (currentChannel.group) currentChannel.group = currentChannel.group.trim();
                    
                    parsedChannels.push(currentChannel);
                }
                currentChannel = null;
            }
        }
        // If line doesn't match anything and we have a current channel, might be part of multi-line
        else if (currentChannel && !line.startsWith('#')) {
            // Some M3U files have multi-line descriptions, try to append
            if (currentChannel.name && line.length < 200) {
                // Might be additional info, skip it
                continue;
            }
        }
    }
    
    console.log(`✅ تم تحليل ${parsedChannels.length} قناة`);
    
    // Remove duplicates based on URL
    const uniqueChannels = [];
    const seenUrls = new Set();
    
    for (const channel of parsedChannels) {
        if (!seenUrls.has(channel.url)) {
            seenUrls.add(channel.url);
            uniqueChannels.push(channel);
        }
    }
    
    if (uniqueChannels.length < parsedChannels.length) {
        console.log(`🛠️ تم إزالة ${parsedChannels.length - uniqueChannels.length} قناة مكررة`);
    }
    
    return uniqueChannels;
}

// Helper function to extract name from URL
function extractNameFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        
        // Get the last part of the path
        const parts = pathname.split('/').filter(p => p);
        if (parts.length > 0) {
            let name = parts[parts.length - 1];
            // Remove extension
            name = name.replace(/\.(m3u8?|ts|mp4|mkv|avi|flv)$/i, '');
            // Replace - and _ with spaces
            name = name.replace(/[-_]/g, ' ');
            // Capitalize
            name = name.replace(/\b\w/g, l => l.toUpperCase());
            return name;
        }
    } catch (e) {
        // Invalid URL, return null
    }
    return null;
}

// ==================== Parse EXTINF Line ====================
function parseExtInf(line) {
    const channel = {
        name: '',
        logo: '',
        group: '',
        tvgId: '',
        tvgName: '',
        url: '',
        status: 'unknown',
        language: '',
        country: ''
    };
    
    // Extract ALL possible attributes with multiple patterns
    const attributes = [
        { key: 'tvgId', patterns: [/tvg-id="([^"]*)"/i, /tvg-id='([^']*)'/i, /tvg-id=([^\s,]+)/i] },
        { key: 'logo', patterns: [/tvg-logo="([^"]*)"/i, /tvg-logo='([^']*)'/i, /logo="([^"]*)"/i, /logo='([^']*)'/i] },
        { key: 'group', patterns: [/group-title="([^"]*)"/i, /group-title='([^']*)'/i, /group="([^"]*)"/i] },
        { key: 'tvgName', patterns: [/tvg-name="([^"]*)"/i, /tvg-name='([^']*)'/i] },
        { key: 'language', patterns: [/tvg-language="([^"]*)"/i, /language="([^"]*)"/i] },
        { key: 'country', patterns: [/tvg-country="([^"]*)"/i, /country="([^"]*)"/i] }
    ];
    
    // Try all patterns for each attribute
    attributes.forEach(attr => {
        for (const pattern of attr.patterns) {
            const match = line.match(pattern);
            if (match && match[1]) {
                channel[attr.key] = match[1].trim();
                break;
            }
        }
    });
    
    // Extract channel name - try multiple methods
    // Method 1: Use tvg-name if available
    if (channel.tvgName) {
        channel.name = channel.tvgName;
    }
    
    // Method 2: Extract from after last comma (most common)
    if (!channel.name) {
        const commaMatch = line.match(/,([^,]+)$/);
        if (commaMatch) {
            channel.name = commaMatch[1].trim();
        }
    }
    
    // Method 3: Extract from after #EXTINF:-1 or #EXTINF:0
    if (!channel.name) {
        const extinfMatch = line.match(/#EXTINF:[^,]*,(.+)$/i);
        if (extinfMatch) {
            channel.name = extinfMatch[1].trim();
        }
    }
    
    // Method 4: Try to find any text after quotes end
    if (!channel.name) {
        const afterQuotes = line.match(/["']\s*,?\s*([^,"']+)$/i);
        if (afterQuotes) {
            channel.name = afterQuotes[1].trim();
        }
    }
    
    // Clean up name from unwanted characters and HTML entities
    if (channel.name) {
        channel.name = channel.name
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/^[,\s|:]+|[,\s|:]+$/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
    
    // Clean up logo URL
    if (channel.logo) {
        channel.logo = channel.logo.trim();
    }
    
    return channel;
}

// ==================== Display Channels ====================
function displayChannels(channelsToDisplay) {
    const grid = document.getElementById('channels-grid');
    grid.innerHTML = '';
    
    channelsToDisplay.forEach((channel, index) => {
        const card = createChannelCard(channel, index);
        grid.appendChild(card);
    });
}

// ==================== Create Channel Card ====================
function createChannelCard(channel, index) {
    const card = document.createElement('div');
    card.className = 'channel-card';
    card.setAttribute('data-index', index);
    
    if (channel.status === 'offline') {
        card.classList.add('offline');
    }
    
    if (hideOffline && channel.status === 'offline') {
        card.classList.add('hidden');
    }
    
    const statusClass = channel.status === 'online' ? 'online' : 
                       channel.status === 'offline' ? 'offline' : 'checking';
    
    card.innerHTML = `
        <div class="channel-status ${statusClass}"></div>
        
        <div class="channel-header">
            ${channel.logo ? 
                `<img src="${channel.logo}" alt="${channel.name}" class="channel-logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                 <div class="channel-logo placeholder" style="display: none;">
                    <i class="fas fa-tv"></i>
                 </div>` : 
                `<div class="channel-logo placeholder">
                    <i class="fas fa-tv"></i>
                 </div>`
            }
            <div class="channel-details">
                <div class="channel-name">${channel.name || 'قناة غير معروفة'}</div>
                ${channel.group ? `<span class="channel-category">${channel.group}</span>` : ''}
            </div>
        </div>
        
        <div class="channel-url-text">${channel.url}</div>
        
        <div class="channel-actions">
            <button class="channel-btn play" onclick="playChannel(${index})">
                <i class="fas fa-play"></i> تشغيل
            </button>
            <button class="channel-btn add-to-playlist" onclick="addToPlaylist(${index})" title="إضافة لقائمة التشغيل">
                <i class="fas fa-plus"></i> إضافة
            </button>
            <button class="channel-btn vlc" onclick="openInVLC(${index})" title="فتح في VLC">
                <i class="fas fa-external-link-alt"></i> VLC
            </button>
            <button class="channel-btn copy" onclick="copyChannelUrl(${index})">
                <i class="fas fa-copy"></i> نسخ
            </button>
        </div>
    `;
    
    return card;
}

// ==================== Channel Actions ====================
function playChannel(index) {
    const channel = filteredChannels[index];
    
    // Show warning for IPTV links
    if (isIPTVLink(channel.url)) {
        const userChoice = confirm(
            `⚠️ هذا رابط IPTV قد لا يعمل في المتصفح.\n\n` +
            `👉 الحل الموصى به:\n` +
            `1. اضغط زر "VLC" لتحميل ملف القناة\n` +
            `2. افتح الملف بـ VLC Media Player\n\n` +
            `هل تريد المحاولة في المتصفح على أي حال؟`
        );
        
        if (!userChoice) {
            return;
        }
    }
    
    player.openVideoModal({
        name: channel.name,
        url: channel.url,
        category: channel.group
    });
}

// Check if URL is IPTV link
function isIPTVLink(url) {
    // Check for common IPTV patterns
    return url.includes(':8080/') || 
           url.includes('/live/') || 
           url.match(/\/[a-z0-9]+\/[a-z0-9]+\/\d+$/i);
}

function copyChannelUrl(index) {
    const channel = filteredChannels[index];
    app.copyToClipboard(channel.url);
}

function openInVLC(index) {
    const channel = filteredChannels[index];
    
    // Create M3U content for this single channel
    let m3uContent = '#EXTM3U\n\n';
    m3uContent += `#EXTINF:-1`;
    
    if (channel.tvgId) {
        m3uContent += ` tvg-id="${channel.tvgId}"`;
    }
    
    if (channel.logo) {
        m3uContent += ` tvg-logo="${channel.logo}"`;
    }
    
    if (channel.group) {
        m3uContent += ` group-title="${channel.group}"`;
    }
    
    m3uContent += `,${channel.name}\n`;
    m3uContent += `${channel.url}\n`;
    
    // Create and download M3U file
    const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${channel.name.replace(/[^a-z0-9]/gi, '_')}.m3u`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    // Show instructions
    app.showToast(`🎬 تم تحميل ${channel.name}.m3u - افتحه بـ VLC`, 'success', 4000);
    
    // Also copy URL for manual use
    app.copyToClipboard(channel.url);
}

// ==================== Filter Channels ====================
function filterChannels(searchTerm) {
    if (!searchTerm) {
        filteredChannels = [...channels];
    } else {
        const term = searchTerm.toLowerCase();
        filteredChannels = channels.filter(channel => 
            channel.name.toLowerCase().includes(term) ||
            channel.group.toLowerCase().includes(term) ||
            channel.url.toLowerCase().includes(term)
        );
    }
    
    displayChannels(filteredChannels);
    updateStats();
}

// ==================== Setup Filter Buttons ====================
function setupFilterButtons() {
    // Check channels button
    const checkBtn = document.getElementById('check-channels-btn');
    if (checkBtn) {
        checkBtn.addEventListener('click', checkAllChannels);
    }
    
    // Hide offline button
    const hideBtn = document.getElementById('hide-offline-btn');
    if (hideBtn) {
        hideBtn.addEventListener('click', () => {
            hideOffline = true;
            hideBtn.classList.add('active');
            document.getElementById('show-all-btn').classList.remove('active');
            updateChannelVisibility();
        });
    }
    
    // Show all button
    const showBtn = document.getElementById('show-all-btn');
    if (showBtn) {
        showBtn.addEventListener('click', () => {
            hideOffline = false;
            showBtn.classList.add('active');
            document.getElementById('hide-offline-btn').classList.remove('active');
            updateChannelVisibility();
        });
    }
    
    // Export button with options
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', showExportOptions);
    }
    
    // View playlist button
    const viewPlaylistBtn = document.getElementById('view-playlist-btn');
    if (viewPlaylistBtn) {
        viewPlaylistBtn.addEventListener('click', openPlaylistModal);
    }
    
    // Close playlist modal
    const closePlaylistModal = document.getElementById('close-playlist-modal');
    if (closePlaylistModal) {
        closePlaylistModal.addEventListener('click', () => {
            document.getElementById('playlist-modal').classList.remove('active');
        });
    }
}

// ==================== Check All Channels ====================
async function checkAllChannels(autoMode = false) {
    if (channels.length === 0) {
        app.showToast('لا توجد قنوات للفحص', 'warning');
        return;
    }
    
    if (!autoMode) {
        app.showToast('جاري فحص القنوات...', 'info');
    }
    
    const checkBtn = document.getElementById('check-channels-btn');
    const originalBtnHtml = checkBtn.innerHTML;
    checkBtn.disabled = true;
    checkBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الفحص...';
    
    // Set all to checking state
    channels.forEach(channel => {
        channel.status = 'checking';
    });
    displayChannels(filteredChannels);
    
    // Check channels in batches to avoid overwhelming the browser
    const batchSize = 15; // Increased for faster checking
    let checkedCount = 0;
    
    for (let i = 0; i < channels.length; i += batchSize) {
        const batch = channels.slice(i, i + batchSize);
        await Promise.all(batch.map(channel => checkChannelStatus(channel)));
        
        checkedCount += batch.length;
        
        // Update progress
        const progress = Math.round((checkedCount / channels.length) * 100);
        checkBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> فحص ${progress}%`;
        
        // Update display after each batch
        displayChannels(filteredChannels);
        updateStats();
    }
    
    // Sort channels: online first, then offline
    channels.sort((a, b) => {
        if (a.status === 'online' && b.status !== 'online') return -1;
        if (a.status !== 'online' && b.status === 'online') return 1;
        return 0;
    });
    
    filteredChannels = [...channels];
    
    // Auto-hide offline channels if in auto mode
    if (autoMode) {
        hideOffline = true;
        document.getElementById('hide-offline-btn').classList.add('active');
        document.getElementById('show-all-btn').classList.remove('active');
    }
    
    // Update display with sorted channels
    displayChannels(filteredChannels);
    updateStats();
    
    checkBtn.disabled = false;
    checkBtn.innerHTML = originalBtnHtml;
    
    const onlineCount = channels.filter(c => c.status === 'online').length;
    const offlineCount = channels.filter(c => c.status === 'offline').length;
    
    app.showToast(`✅ الفحص اكتمل: ${onlineCount} تعمل | ${offlineCount} معطلة`, 'success', 4000);
}

// ==================== Check Single Channel Status ====================
async function checkChannelStatus(channel) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout (faster)
        
        const response = await fetch(channel.url, {
            method: 'HEAD',
            signal: controller.signal,
            mode: 'no-cors' // This will work for most cases
        });
        
        clearTimeout(timeoutId);
        
        // With no-cors, we can't read the status, so if it doesn't fail, assume it's online
        channel.status = 'online';
    } catch (error) {
        // If fetch fails or times out, mark as offline
        channel.status = 'offline';
    }
}

// ==================== Update Channel Visibility ====================
function updateChannelVisibility() {
    const cards = document.querySelectorAll('.channel-card');
    cards.forEach(card => {
        const index = parseInt(card.getAttribute('data-index'));
        const channel = filteredChannels[index];
        
        if (hideOffline && channel.status === 'offline') {
            card.classList.add('hidden');
        } else {
            card.classList.remove('hidden');
        }
    });
    
    updateStats();
}

// ==================== Update Stats ====================
function updateStats() {
    const total = filteredChannels.length;
    const online = filteredChannels.filter(c => c.status === 'online').length;
    const offline = filteredChannels.filter(c => c.status === 'offline').length;
    
    document.getElementById('total-channels').textContent = total;
    document.getElementById('working-channels').textContent = online;
    document.getElementById('offline-channels').textContent = offline;
}

// ==================== Show Export Options ====================
function showExportOptions() {
    if (channels.length === 0) {
        app.showToast('لا توجد قنوات للتصدير', 'warning');
        return;
    }
    
    // Create custom confirmation dialog
    const onlineCount = channels.filter(c => c.status === 'online').length;
    const totalCount = channels.length;
    
    const message = `
        اختر نوع التصدير:
        
        1. تصدير القنوات العاملة فقط (${onlineCount} قناة)
        2. تصدير جميع القنوات (${totalCount} قناة)
        3. تصدير بتنسيق JSON
    `;
    
    // Use browser's prompt for selection
    const choice = prompt(message.trim(), '1');
    
    if (choice === '1') {
        exportM3U(true); // Export only online
    } else if (choice === '2') {
        exportM3U(false); // Export all
    } else if (choice === '3') {
        exportJSON(); // Export as JSON
    }
}

// ==================== Export M3U ====================
function exportM3U(onlineOnly = null) {
    if (channels.length === 0) {
        app.showToast('لا توجد قنوات للتصدير', 'warning');
        return;
    }
    
    let m3uContent = '#EXTM3U\n\n';
    
    // Determine which channels to export
    let channelsToExport;
    if (onlineOnly === null) {
        // Use hideOffline setting
        channelsToExport = hideOffline ? 
            channels.filter(c => c.status === 'online') : 
            channels;
    } else {
        // Use explicit parameter
        channelsToExport = onlineOnly ? 
            channels.filter(c => c.status === 'online') : 
            channels;
    }
    
    channelsToExport.forEach(channel => {
        m3uContent += `#EXTINF:-1`;
        
        if (channel.tvgId) {
            m3uContent += ` tvg-id="${channel.tvgId}"`;
        }
        
        if (channel.logo) {
            m3uContent += ` tvg-logo="${channel.logo}"`;
        }
        
        if (channel.group) {
            m3uContent += ` group-title="${channel.group}"`;
        }
        
        if (channel.tvgName) {
            m3uContent += ` tvg-name="${channel.tvgName}"`;
        }
        
        if (channel.language) {
            m3uContent += ` tvg-language="${channel.language}"`;
        }
        
        if (channel.country) {
            m3uContent += ` tvg-country="${channel.country}"`;
        }
        
        m3uContent += `,${channel.name}\n`;
        m3uContent += `${channel.url}\n\n`;
    });
    
    // Create and download file
    downloadFile(m3uContent, `channels_${Date.now()}.m3u`, 'text/plain');
    
    app.showToast(`✅ تم تصدير ${channelsToExport.length} قناة بتنسيق M3U`, 'success');
}

// ==================== Export JSON ====================
function exportJSON() {
    if (channels.length === 0) {
        app.showToast('لا توجد قنوات للتصدير', 'warning');
        return;
    }
    
    const jsonData = {
        exportDate: new Date().toISOString(),
        totalChannels: channels.length,
        onlineChannels: channels.filter(c => c.status === 'online').length,
        offlineChannels: channels.filter(c => c.status === 'offline').length,
        channels: channels.map(channel => ({
            name: channel.name,
            url: channel.url,
            logo: channel.logo,
            group: channel.group,
            tvgId: channel.tvgId,
            tvgName: channel.tvgName,
            language: channel.language,
            country: channel.country,
            status: channel.status
        }))
    };
    
    const jsonContent = JSON.stringify(jsonData, null, 2);
    downloadFile(jsonContent, `channels_${Date.now()}.json`, 'application/json');
    
    app.showToast(`✅ تم تصدير ${channels.length} قناة بتنسيق JSON`, 'success');
}

// ==================== Download File Helper ====================
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// ==================== Load Sample M3U for Testing ====================
function loadSampleM3U() {
    const sampleUrl = 'https://iptv-org.github.io/iptv/categories/movies.m3u';
    document.getElementById('m3u-url').value = sampleUrl;
    parseM3U(sampleUrl);
}

// Export functions to global scope
window.m3uParser = {
    parseM3U,
    channels: () => channels,
    filteredChannels: () => filteredChannels,
    loadSampleM3U
};

// Make functions globally accessible for onclick handlers
window.playChannel = playChannel;
window.copyChannelUrl = copyChannelUrl;
window.openInVLC = openInVLC;

// ==================== Encoding Fixer ====================
function fixEncoding(text) {
    // Try to fix common encoding issues
    try {
        // Check if text contains mojibake (encoding issues)
        if (text.includes('�') || text.match(/[\x80-\xFF]{3,}/)) {
            // Try to decode as UTF-8
            const bytes = new Uint8Array(text.split('').map(c => c.charCodeAt(0)));
            const decoder = new TextDecoder('utf-8');
            text = decoder.decode(bytes);
        }
    } catch (e) {
        // If decoding fails, return original
        console.log('⚠️ لا يمكن إصلاح الترميز');
    }
    
    // Fix common HTML entities that might appear
    text = text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
    
    return text;
}

// ==================== Validate M3U Content ====================
function isValidM3UContent(content) {
    // Check if content looks like a valid M3U file
    if (!content || content.length < 10) return false;
    
    // Should have at least one EXTINF or be an M3U header
    const hasExtinf = content.match(/#EXTINF:/i);
    const hasM3UHeader = content.match(/#EXTM3U/i);
    const hasUrls = content.match(/https?:\/\//i);
    
    return (hasExtinf || hasM3UHeader) && hasUrls;
}

// ==================== Detect M3U Format ====================
function detectM3UFormat(content) {
    const formats = {
        standard: content.match(/#EXTINF:-1[^,]*,/i),
        extended: content.match(/#EXTINF:-1\s+tvg-/i),
        simple: content.match(/^https?:\/\//m) && !content.includes('#EXTINF'),
        playlist: content.match(/#EXTM3U/i)
    };
    
    for (const [format, detected] of Object.entries(formats)) {
        if (detected) {
            console.log(`📡 تنسيق M3U: ${format}`);
            return format;
        }
    }
    
    return 'unknown';
}

// ==================== Playlist Management ====================

// Load playlist from localStorage
function loadPlaylistFromStorage() {
    try {
        const saved = localStorage.getItem('myPlaylist');
        if (saved) {
            myPlaylist = JSON.parse(saved);
            updatePlaylistCount();
            console.log(`✅ تم تحميل ${myPlaylist.length} قناة من قائمة التشغيل`);
        }
    } catch (e) {
        console.error('خطأ في تحميل قائمة التشغيل:', e);
        myPlaylist = [];
    }
}

// Save playlist to localStorage
function savePlaylistToStorage() {
    try {
        localStorage.setItem('myPlaylist', JSON.stringify(myPlaylist));
    } catch (e) {
        console.error('خطأ في حفظ قائمة التشغيل:', e);
    }
}

// Update playlist count display
function updatePlaylistCount() {
    const countEl = document.getElementById('playlist-count');
    if (countEl) {
        countEl.textContent = myPlaylist.length;
    }
}

// Add channel to playlist
function addToPlaylist(index) {
    const channel = filteredChannels[index];
    
    // Check if already in playlist
    const exists = myPlaylist.some(ch => ch.url === channel.url);
    
    if (exists) {
        app.showToast('❗ هذه القناة موجودة في قائمتك بالفعل', 'warning');
        return;
    }
    
    // Add to playlist
    myPlaylist.push({
        name: channel.name,
        url: channel.url,
        logo: channel.logo,
        group: channel.group,
        tvgId: channel.tvgId,
        tvgName: channel.tvgName,
        language: channel.language,
        country: channel.country,
        addedAt: new Date().toISOString()
    });
    
    savePlaylistToStorage();
    updatePlaylistCount();
    
    app.showToast(`✅ تمت إضافة "${channel.name}" لقائمتك`, 'success');
}

// Remove channel from playlist
function removeFromPlaylist(index) {
    const channel = myPlaylist[index];
    myPlaylist.splice(index, 1);
    
    savePlaylistToStorage();
    updatePlaylistCount();
    displayMyPlaylist();
    
    app.showToast(`❌ تم حذف "${channel.name}"`, 'info');
}

// Clear entire playlist
function clearPlaylist() {
    if (myPlaylist.length === 0) {
        app.showToast('قائمة التشغيل فارغة بالفعل', 'info');
        return;
    }
    
    const confirmed = confirm(`❓ هل أنت متأكد من حذف جميع القنوات (${myPlaylist.length} قناة)؟`);
    
    if (confirmed) {
        myPlaylist = [];
        savePlaylistToStorage();
        updatePlaylistCount();
        displayMyPlaylist();
        app.showToast('✅ تم مسح قائمة التشغيل', 'success');
    }
}

// Open playlist modal
function openPlaylistModal() {
    displayMyPlaylist();
    document.getElementById('playlist-modal').classList.add('active');
}

// Display my playlist
function displayMyPlaylist() {
    const grid = document.getElementById('my-playlist-grid');
    const totalEl = document.getElementById('my-playlist-total');
    
    if (totalEl) {
        totalEl.textContent = myPlaylist.length;
    }
    
    if (myPlaylist.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 40px; color: #999;">
                <i class="fas fa-folder-open" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p>لا توجد قنوات في قائمتك</p>
                <p style="font-size: 0.9rem;">اضغط على "إضافة" في أي قناة لإضافتها</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = '';
    
    myPlaylist.forEach((channel, index) => {
        const card = document.createElement('div');
        card.className = 'channel-card';
        
        card.innerHTML = `
            <div class="channel-status online"></div>
            
            <div class="channel-header">
                ${channel.logo ? 
                    `<img src="${channel.logo}" alt="${channel.name}" class="channel-logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                     <div class="channel-logo placeholder" style="display: none;">
                        <i class="fas fa-tv"></i>
                     </div>` : 
                    `<div class="channel-logo placeholder">
                        <i class="fas fa-tv"></i>
                     </div>`
                }
                <div class="channel-details">
                    <div class="channel-name">${channel.name}</div>
                    ${channel.group ? `<span class="channel-category">${channel.group}</span>` : ''}
                </div>
            </div>
            
            <div class="channel-url-text">${channel.url}</div>
            
            <div class="channel-actions">
                <button class="channel-btn play" onclick="playChannelFromPlaylist(${index})">
                    <i class="fas fa-play"></i> تشغيل
                </button>
                <button class="channel-btn vlc" onclick="openPlaylistChannelInVLC(${index})" title="فتح في VLC">
                    <i class="fas fa-external-link-alt"></i> VLC
                </button>
                <button class="channel-btn copy" onclick="app.copyToClipboard('${channel.url}')">
                    <i class="fas fa-copy"></i> نسخ
                </button>
                <button class="channel-btn" onclick="removeFromPlaylist(${index})" style="background: #f56565; color: white;">
                    <i class="fas fa-trash"></i> حذف
                </button>
            </div>
        `;
        
        grid.appendChild(card);
    });
}

// Play channel from playlist
function playChannelFromPlaylist(index) {
    const channel = myPlaylist[index];
    
    // Check if IPTV link
    if (isIPTVLink(channel.url)) {
        const userChoice = confirm(
            `⚠️ هذا رابط IPTV قد لا يعمل في المتصفح.\n\n` +
            `👉 الحل الموصى به:\n` +
            `1. اضغط زر "VLC" لتحميل ملف القناة\n` +
            `2. افتح الملف بـ VLC Media Player\n\n` +
            `هل تريد المحاولة في المتصفح على أي حال؟`
        );
        
        if (!userChoice) {
            return;
        }
    }
    
    player.openVideoModal({
        name: channel.name,
        url: channel.url,
        category: channel.group
    });
}

// Open playlist channel in VLC
function openPlaylistChannelInVLC(index) {
    const channel = myPlaylist[index];
    
    // Create M3U content
    let m3uContent = '#EXTM3U\n\n';
    m3uContent += `#EXTINF:-1`;
    
    if (channel.tvgId) m3uContent += ` tvg-id="${channel.tvgId}"`;
    if (channel.logo) m3uContent += ` tvg-logo="${channel.logo}"`;
    if (channel.group) m3uContent += ` group-title="${channel.group}"`;
    
    m3uContent += `,${channel.name}\n`;
    m3uContent += `${channel.url}\n`;
    
    // Download
    const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${channel.name.replace(/[^a-z0-9]/gi, '_')}.m3u`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    app.showToast(`🎬 تم تحميل ${channel.name}.m3u - افتحه بـ VLC`, 'success', 4000);
    app.copyToClipboard(channel.url);
}

// Export my playlist as M3U
function exportMyPlaylist() {
    if (myPlaylist.length === 0) {
        app.showToast('قائمة التشغيل فارغة', 'warning');
        return;
    }
    
    let m3uContent = '#EXTM3U\n\n';
    
    myPlaylist.forEach(channel => {
        m3uContent += `#EXTINF:-1`;
        
        if (channel.tvgId) m3uContent += ` tvg-id="${channel.tvgId}"`;
        if (channel.logo) m3uContent += ` tvg-logo="${channel.logo}"`;
        if (channel.group) m3uContent += ` group-title="${channel.group}"`;
        if (channel.tvgName) m3uContent += ` tvg-name="${channel.tvgName}"`;
        if (channel.language) m3uContent += ` tvg-language="${channel.language}"`;
        if (channel.country) m3uContent += ` tvg-country="${channel.country}"`;
        
        m3uContent += `,${channel.name}\n`;
        m3uContent += `${channel.url}\n\n`;
    });
    
    // Download
    const blob = new Blob([m3uContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my_playlist_${Date.now()}.m3u`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    app.showToast(`✅ تم تصدير ${myPlaylist.length} قناة بتنسيق M3U`, 'success');
}

// Make functions globally accessible
window.addToPlaylist = addToPlaylist;
window.removeFromPlaylist = removeFromPlaylist;
window.clearPlaylist = clearPlaylist;
window.openPlaylistModal = openPlaylistModal;
window.exportMyPlaylist = exportMyPlaylist;
window.playChannelFromPlaylist = playChannelFromPlaylist;
window.openPlaylistChannelInVLC = openPlaylistChannelInVLC;
