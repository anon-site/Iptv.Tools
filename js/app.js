// ==================== App Initialization ====================
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    setupNavigation();
    setupToastSystem();
    console.log('🚀 تم تحميل التطبيق بنجاح');
}

// ==================== Navigation System ====================
function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            
            // Remove active class from all buttons and tabs
            navButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(tab => tab.classList.remove('active'));
            
            // Add active class to clicked button and corresponding tab
            button.classList.add('active');
            document.getElementById(`${tabName}-tab`).classList.add('active');
            
            // Analytics or tracking can be added here
            console.log(`📍 التبديل إلى تبويب: ${tabName}`);
        });
    });
}

// ==================== Toast Notification System ====================
let toastContainer;

function setupToastSystem() {
    toastContainer = document.getElementById('toast-container');
}

function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon;
    switch (type) {
        case 'success':
            icon = 'fa-check-circle';
            break;
        case 'error':
            icon = 'fa-exclamation-circle';
            break;
        case 'warning':
            icon = 'fa-exclamation-triangle';
            break;
        default:
            icon = 'fa-info-circle';
    }
    
    toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    // Auto remove toast after duration
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-30px)';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, duration);
    
    // Remove on click
    toast.addEventListener('click', () => {
        toast.remove();
    });
}

// ==================== Utility Functions ====================

// Copy text to clipboard
function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text).then(() => {
            showToast('تم نسخ الرابط بنجاح', 'success');
            return true;
        }).catch(err => {
            console.error('فشل النسخ:', err);
            showToast('فشل في نسخ الرابط', 'error');
            return false;
        });
    } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            textArea.remove();
            showToast('تم نسخ الرابط بنجاح', 'success');
            return true;
        } catch (err) {
            console.error('فشل النسخ:', err);
            textArea.remove();
            showToast('فشل في نسخ الرابط', 'error');
            return false;
        }
    }
}

// Validate URL
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Get file extension from URL
function getFileExtension(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const extension = pathname.split('.').pop().toLowerCase();
        return extension;
    } catch (e) {
        return '';
    }
}

// Detect stream type
function detectStreamType(url) {
    const extension = getFileExtension(url);
    
    if (url.includes('.m3u8') || extension === 'm3u8') {
        return 'hls';
    } else if (url.includes('.mpd') || extension === 'mpd') {
        return 'dash';
    } else if (url.includes('rtmp://')) {
        return 'rtmp';
    } else if (extension === 'mp4' || extension === 'webm' || extension === 'ogg') {
        return 'video';
    } else {
        return 'unknown';
    }
}

// Format time
function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    } else {
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Fetch with CORS proxy (for development)
async function fetchWithProxy(url, useCorsProxy = false) {
    try {
        if (useCorsProxy) {
            // Using CORS proxy for development
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl);
            return response;
        } else {
            const response = await fetch(url);
            return response;
        }
    } catch (error) {
        console.error('خطأ في جلب البيانات:', error);
        throw error;
    }
}

// Export functions to global scope
window.app = {
    showToast,
    copyToClipboard,
    isValidUrl,
    getFileExtension,
    detectStreamType,
    formatTime,
    debounce,
    fetchWithProxy
};
