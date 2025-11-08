// ==================== Link Extractor System ====================
let extractedLinks = [];

document.addEventListener('DOMContentLoaded', () => {
    setupExtractor();
});

function setupExtractor() {
    const extractBtn = document.getElementById('extract-btn');
    const pageUrlInput = document.getElementById('page-url');
    
    if (extractBtn) {
        extractBtn.addEventListener('click', () => {
            const url = pageUrlInput.value.trim();
            if (url) {
                extractLinks(url);
            } else {
                app.showToast('الرجاء إدخال رابط الصفحة', 'warning');
            }
        });
    }
    
    if (pageUrlInput) {
        pageUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const url = pageUrlInput.value.trim();
                if (url) {
                    extractLinks(url);
                }
            }
        });
    }
}

// ==================== Extract Links Function ====================
async function extractLinks(pageUrl) {
    if (!app.isValidUrl(pageUrl)) {
        app.showToast('الرابط غير صحيح', 'error');
        return;
    }
    
    app.showToast('جاري استخراج الروابط...', 'info');
    
    try {
        // Detect site type
        const siteType = detectSiteType(pageUrl);
        console.log(`🔍 نوع الموقع: ${siteType}`);
        
        let links = [];
        
        switch (siteType) {
            case 'aflam4you':
                links = await extractAflam4youLinks(pageUrl);
                break;
            case 'elahmad':
                links = await extractElahmadLinks(pageUrl);
                break;
            case 'web24iptv':
                links = await extractWeb24IPTVLinks(pageUrl);
                break;
            default:
                links = await extractGenericLinks(pageUrl);
        }
        
        if (links.length > 0) {
            extractedLinks = links;
            displayExtractedLinks(links);
            app.showToast(`تم استخراج ${links.length} رابط`, 'success');
        } else {
            app.showToast('لم يتم العثور على روابط', 'warning');
        }
    } catch (error) {
        console.error('خطأ في استخراج الروابط:', error);
        app.showToast('فشل في استخراج الروابط', 'error');
    }
}

// ==================== Detect Site Type ====================
function detectSiteType(url) {
    if (url.includes('aflam4you.net') || url.includes('direct.aflam4you')) {
        return 'aflam4you';
    } else if (url.includes('elahmad.com')) {
        return 'elahmad';
    } else if (url.includes('web24iptv')) {
        return 'web24iptv';
    }
    return 'generic';
}

// ==================== Extract from Aflam4you ====================
async function extractAflam4youLinks(pageUrl) {
    const links = [];
    
    try {
        // Extract video ID from URL
        const videoId = extractVideoId(pageUrl);
        
        if (videoId) {
            // Try to get embed URL
            const embedUrl = `https://direct.aflam4you.net/embed.php?vid=${videoId}`;
            
            links.push({
                title: 'مشغل Aflam4you المضمن',
                url: embedUrl,
                type: 'iframe',
                source: 'aflam4you'
            });
            
            // Try to extract direct stream URL
            // Note: This might require CORS proxy in production
            try {
                const response = await fetch(embedUrl);
                const html = await response.text();
                
                // Extract M3U8 links
                const m3u8Regex = /(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/gi;
                const m3u8Matches = html.match(m3u8Regex);
                
                if (m3u8Matches) {
                    m3u8Matches.forEach((url, index) => {
                        links.push({
                            title: `بث مباشر HLS ${index + 1}`,
                            url: cleanUrl(url),
                            type: 'hls',
                            source: 'aflam4you'
                        });
                    });
                }
                
                // Extract MP4 links
                const mp4Regex = /(https?:\/\/[^\s"']+\.mp4[^\s"']*)/gi;
                const mp4Matches = html.match(mp4Regex);
                
                if (mp4Matches) {
                    mp4Matches.forEach((url, index) => {
                        links.push({
                            title: `فيديو MP4 ${index + 1}`,
                            url: cleanUrl(url),
                            type: 'video',
                            source: 'aflam4you'
                        });
                    });
                }
            } catch (err) {
                console.log('لا يمكن جلب محتوى الصفحة بسبب CORS');
            }
        }
    } catch (error) {
        console.error('خطأ في استخراج روابط Aflam4you:', error);
    }
    
    return links;
}

// ==================== Extract from Web24IPTV ====================
async function extractWeb24IPTVLinks(pageUrl) {
    const links = [];
    
    try {
        // Get page content with CORS proxy
        const response = await app.fetchWithProxy(pageUrl, true);
        const html = await response.text();
        
        // Extract channel name from URL
        const urlParts = pageUrl.split('/');
        const channelName = urlParts[urlParts.length - 1] || 'قناة';
        
        // Look for iframe sources
        const iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
        let iframeMatch;
        let iframeIndex = 0;
        
        while ((iframeMatch = iframeRegex.exec(html)) !== null) {
            iframeIndex++;
            const iframeUrl = iframeMatch[1];
            
            links.push({
                title: `${channelName} - iFrame ${iframeIndex}`,
                url: iframeUrl.startsWith('http') ? iframeUrl : `https://www.web24iptv.online${iframeUrl}`,
                type: 'iframe',
                source: 'web24iptv'
            });
        }
        
        // Look for player sources (JWPlayer, Video.js, etc.)
        const sourcePatterns = [
            /file:\s*["']([^"']+)["']/gi,
            /source:\s*["']([^"']+)["']/gi,
            /src:\s*["']([^"']+\.m3u8[^"']*)["']/gi,
            /"file":\s*"([^"]+)"/gi,
            /'file':\s*'([^']+)'/gi
        ];
        
        sourcePatterns.forEach((pattern, index) => {
            let match;
            while ((match = pattern.exec(html)) !== null) {
                const url = match[1];
                if (url && url.length > 10 && !url.startsWith('data:')) {
                    links.push({
                        title: `${channelName} - Stream ${links.length + 1}`,
                        url: url.startsWith('http') ? url : `https:${url}`,
                        type: app.detectStreamType(url),
                        source: 'web24iptv'
                    });
                }
            }
        });
        
        // Look for any M3U8 links
        const m3u8Regex = /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/gi;
        const m3u8Matches = html.match(m3u8Regex);
        
        if (m3u8Matches) {
            const uniqueUrls = [...new Set(m3u8Matches)];
            uniqueUrls.forEach((url, index) => {
                if (!links.some(link => link.url === url)) {
                    links.push({
                        title: `${channelName} - HLS ${index + 1}`,
                        url: cleanUrl(url),
                        type: 'hls',
                        source: 'web24iptv'
                    });
                }
            });
        }
        
        // If no direct links found, add the page as iframe option
        if (links.length === 0) {
            links.push({
                title: `${channelName} - صفحة المشغل`,
                url: pageUrl,
                type: 'iframe',
                source: 'web24iptv'
            });
        }
        
    } catch (error) {
        console.error('خطأ في استخراج روابط Web24IPTV:', error);
        // Add fallback option
        links.push({
            title: 'فتح الصفحة مباشرة',
            url: pageUrl,
            type: 'iframe',
            source: 'web24iptv'
        });
    }
    
    return links;
}

// ==================== Extract from Elahmad ====================
async function extractElahmadLinks(pageUrl) {
    const links = [];
    
    try {
        // Extract channel info from URL
        const urlParams = new URL(pageUrl).searchParams;
        const channelId = urlParams.get('id');
        
        if (channelId) {
            links.push({
                title: `قناة ${channelId}`,
                url: pageUrl,
                type: 'iframe',
                source: 'elahmad'
            });
            
            // Try to extract direct stream URL
            try {
                const response = await fetch(pageUrl);
                const html = await response.text();
                
                // Extract various stream URLs
                const streamRegex = /(https?:\/\/[^\s"']+\.(m3u8|mpd|mp4)[^\s"']*)/gi;
                const streamMatches = html.match(streamRegex);
                
                if (streamMatches) {
                    streamMatches.forEach((url, index) => {
                        const cleanedUrl = cleanUrl(url);
                        const type = app.detectStreamType(cleanedUrl);
                        
                        links.push({
                            title: `بث مباشر ${index + 1}`,
                            url: cleanedUrl,
                            type: type,
                            source: 'elahmad'
                        });
                    });
                }
            } catch (err) {
                console.log('لا يمكن جلب محتوى الصفحة بسبب CORS');
            }
        }
    } catch (error) {
        console.error('خطأ في استخراج روابط Elahmad:', error);
    }
    
    return links;
}

// ==================== Extract Generic Links ====================
async function extractGenericLinks(pageUrl) {
    const links = [];
    
    try {
        const response = await app.fetchWithProxy(pageUrl, true);
        const html = await response.text();
        
        // Extract M3U8 links
        const m3u8Regex = /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/gi;
        const m3u8Matches = html.match(m3u8Regex);
        
        if (m3u8Matches) {
            const uniqueUrls = [...new Set(m3u8Matches)];
            uniqueUrls.forEach((url, index) => {
                links.push({
                    title: `HLS Stream ${index + 1}`,
                    url: cleanUrl(url),
                    type: 'hls',
                    source: 'generic'
                });
            });
        }
        
        // Extract MPD links (DASH)
        const mpdRegex = /(https?:\/\/[^\s"'<>]+\.mpd[^\s"'<>]*)/gi;
        const mpdMatches = html.match(mpdRegex);
        
        if (mpdMatches) {
            const uniqueUrls = [...new Set(mpdMatches)];
            uniqueUrls.forEach((url, index) => {
                links.push({
                    title: `DASH Stream ${index + 1}`,
                    url: cleanUrl(url),
                    type: 'dash',
                    source: 'generic'
                });
            });
        }
        
        // Extract MP4 links
        const mp4Regex = /(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/gi;
        const mp4Matches = html.match(mp4Regex);
        
        if (mp4Matches) {
            const uniqueUrls = [...new Set(mp4Matches)];
            uniqueUrls.forEach((url, index) => {
                links.push({
                    title: `MP4 Video ${index + 1}`,
                    url: cleanUrl(url),
                    type: 'video',
                    source: 'generic'
                });
            });
        }
        
        // Extract iframe sources
        const iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
        let iframeMatch;
        let iframeIndex = 0;
        
        while ((iframeMatch = iframeRegex.exec(html)) !== null) {
            iframeIndex++;
            links.push({
                title: `iFrame ${iframeIndex}`,
                url: iframeMatch[1],
                type: 'iframe',
                source: 'generic'
            });
        }
    } catch (error) {
        console.error('خطأ في استخراج الروابط العامة:', error);
        app.showToast('قد تحتاج إلى تفعيل CORS Proxy', 'warning');
    }
    
    return links;
}

// ==================== Helper Functions ====================
function extractVideoId(url) {
    // Extract ID from aflam4you URLs
    const match = url.match(/[_\/](\d+)\.html/);
    return match ? match[1] : null;
}

function cleanUrl(url) {
    // Remove HTML entities and extra characters
    return url
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/[<>]/g, '')
        .trim();
}

function decodeProtectedUrl(encodedUrl) {
    // Basic decoding - can be extended
    try {
        // Try base64 decode
        const decoded = atob(encodedUrl);
        if (app.isValidUrl(decoded)) {
            return decoded;
        }
    } catch (e) {
        // Not base64
    }
    
    // Try URL decode
    try {
        const decoded = decodeURIComponent(encodedUrl);
        if (app.isValidUrl(decoded)) {
            return decoded;
        }
    } catch (e) {
        // Not URL encoded
    }
    
    return encodedUrl;
}

// ==================== Display Extracted Links ====================
function displayExtractedLinks(links) {
    const resultsContainer = document.getElementById('extraction-results');
    const linksListContainer = document.getElementById('extracted-links');
    
    // Hide empty state
    resultsContainer.style.display = 'none';
    
    // Clear previous links
    linksListContainer.innerHTML = '';
    
    links.forEach((link, index) => {
        const linkItem = document.createElement('div');
        linkItem.className = 'link-item';
        linkItem.innerHTML = `
            <div class="link-info">
                <div class="link-title">
                    <i class="fas ${getIconForType(link.type)}"></i>
                    ${link.title}
                </div>
                <div class="link-url">${link.url}</div>
            </div>
            <div class="link-actions">
                <button class="action-btn" onclick="playExtractedLink(${index})">
                    <i class="fas fa-play"></i> تشغيل
                </button>
                <button class="action-btn" onclick="app.copyToClipboard('${escapeHtml(link.url)}')">
                    <i class="fas fa-copy"></i> نسخ
                </button>
                <button class="action-btn" onclick="openExtractedInModal(${index})">
                    <i class="fas fa-external-link-alt"></i> فتح
                </button>
            </div>
        `;
        linksListContainer.appendChild(linkItem);
    });
}

function getIconForType(type) {
    const icons = {
        'hls': 'fa-stream',
        'dash': 'fa-signal',
        'video': 'fa-film',
        'iframe': 'fa-window-maximize',
        'rtmp': 'fa-broadcast-tower'
    };
    return icons[type] || 'fa-link';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function playExtractedLink(index) {
    const link = extractedLinks[index];
    player.playStream(link.url, player.mainPlayer(), link.type);
}

function openExtractedInModal(index) {
    const link = extractedLinks[index];
    player.openVideoModal({
        name: link.title,
        url: link.url,
        category: link.source,
        type: link.type
    });
}

// Export functions
window.extractor = {
    extractLinks,
    extractedLinks: () => extractedLinks
};

// Make functions globally accessible
window.playExtractedLink = playExtractedLink;
window.openExtractedInModal = openExtractedInModal;
