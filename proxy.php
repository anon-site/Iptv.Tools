<?php
/**
 * Simple CORS Proxy for M3U Parser
 * 
 * Usage: proxy.php?url=http://example.com/playlist.m3u
 * 
 * This allows you to bypass CORS restrictions when hosting locally
 */

// Enable CORS for all origins (adjust in production)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Get the URL parameter
$url = isset($_GET['url']) ? $_GET['url'] : '';

if (empty($url)) {
    http_response_code(400);
    echo json_encode([
        'error' => 'Missing URL parameter',
        'usage' => 'proxy.php?url=http://example.com/file.m3u'
    ]);
    exit();
}

// Validate URL
if (!filter_var($url, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    echo json_encode([
        'error' => 'Invalid URL',
        'url' => $url
    ]);
    exit();
}

// Security: Only allow specific protocols
$allowed_protocols = ['http', 'https'];
$protocol = parse_url($url, PHP_URL_SCHEME);

if (!in_array($protocol, $allowed_protocols)) {
    http_response_code(400);
    echo json_encode([
        'error' => 'Protocol not allowed',
        'allowed' => $allowed_protocols
    ]);
    exit();
}

try {
    // Initialize cURL
    $ch = curl_init();
    
    // Set cURL options
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => false, // For self-signed certificates
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        CURLOPT_ENCODING => '', // Accept all encodings
        CURLOPT_HTTPHEADER => [
            'Accept: */*',
            'Cache-Control: no-cache'
        ]
    ]);
    
    // Execute request
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    $error = curl_error($ch);
    
    curl_close($ch);
    
    // Check for errors
    if ($response === false) {
        http_response_code(500);
        echo json_encode([
            'error' => 'cURL error',
            'message' => $error
        ]);
        exit();
    }
    
    // Check HTTP status
    if ($httpCode >= 400) {
        http_response_code($httpCode);
        echo json_encode([
            'error' => 'HTTP error',
            'code' => $httpCode,
            'url' => $url
        ]);
        exit();
    }
    
    // Set appropriate content type
    if ($contentType) {
        header("Content-Type: $contentType");
    } else {
        // Default to plain text for M3U files
        header('Content-Type: text/plain; charset=utf-8');
    }
    
    // Output the response
    echo $response;
    
} catch (Exception $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'Server error',
        'message' => $e->getMessage()
    ]);
}
?>
