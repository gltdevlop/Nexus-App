/**
 * Shared Utility Functions
 * Used across multiple apps in the renderer
 */

(function () {
    'use strict';

    // Create namespace if it doesn't exist
    window.NexusModules = window.NexusModules || {};

    /**
     * Format file size in bytes to human-readable format
     * @param {number} bytes - File size in bytes
     * @returns {string} Formatted size string
     */
    function formatSize(bytes) {
        if (bytes === 0) return '';
        const k = 1024;
        const sizes = ['octets', 'Ko', 'Mo', 'Go'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    /**
     * Format date and time in French format
     * @param {Date} date - Date object to format
     * @returns {string} Formatted date/time string
     */
    function formatDateTime(date) {
        const day = date.getDate().toString().padStart(2, '0');
        const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
            'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
        const month = monthNames[date.getMonth()];
        const year = date.getFullYear();
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');

        return `Nous sommes le ${day} ${month} ${year}, il est ${hours}:${minutes}.`;
    }

    /**
     * Get SVG icon for a file based on its type
     * @param {Object} item - File item with type and basename properties
     * @returns {string} SVG icon as HTML string
     */
    function getFileIcon(item) {
        // Folder
        if (item.type === 'directory') {
            return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M19.5 21H4.5C3.67157 21 3 20.3284 3 19.5V7.5C3 6.67157 3.67157 6 4.5 6H9L11 8H19.5C20.3284 8 21 8.67157 21 9.5V19.5C21 20.3284 20.3284 21 19.5 21Z" fill="#007AFF" stroke="#007AFF" stroke-width="2" stroke-linejoin="round"/>
<path d="M3 7.5L5 9.5" stroke="#282828" stroke-width="0.5" stroke-opacity="0.1"/>
</svg>`;
        }

        const ext = item.basename.split('.').pop().toLowerCase();

        // Video
        if (['mkv', 'mp4', 'avi', 'mov', 'webm'].includes(ext)) {
            return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="2" y="4" width="20" height="16" rx="2" stroke="#FF5733" stroke-width="2"/>
<path d="M10 9L15 12L10 15V9Z" fill="#FF5733"/>
<path d="M2 8H22" stroke="#FF5733" stroke-width="2"/>
<path d="M2 16H22" stroke="#FF5733" stroke-width="2"/>
<path d="M6 4V8" stroke="#FF5733" stroke-width="2"/>
<path d="M18 4V8" stroke="#FF5733" stroke-width="2"/>
<path d="M6 16V20" stroke="#FF5733" stroke-width="2"/>
<path d="M18 16V20" stroke="#FF5733" stroke-width="2"/>
</svg>`;
        }

        // Audio
        if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext)) {
            return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M9 18V5L21 3V6" stroke="#4CD964" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="6" cy="18" r="3" stroke="#4CD964" stroke-width="2"/>
<circle cx="18" cy="16" r="3" stroke="#4CD964" stroke-width="2"/>
</svg>`;
        }

        // Image
        if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) {
            return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="3" y="3" width="18" height="18" rx="2" stroke="#5856D6" stroke-width="2"/>
<circle cx="8.5" cy="8.5" r="1.5" fill="#5856D6"/>
<path d="M21 15L16 10L5 21" stroke="#5856D6" stroke-width="2" stroke-linejoin="round"/>
</svg>`;
        }

        // PDF
        if (ext === 'pdf') {
            return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="#FF3B30" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M14 2V8H20" stroke="#FF3B30" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M5 12H19" stroke="#FF3B30" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M5 16H19" stroke="#FF3B30" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
        }

        // Default / Text / Code
        return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="#8E8E93" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M14 2V8H20" stroke="#8E8E93" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
    }

    /**
     * Get icon emoji for a service based on its URL and name
     * @param {string} serviceUrl - Service URL
     * @param {string} serviceName - Service name
     * @returns {string} Icon emoji
     */
    function getServiceIcon(serviceUrl, serviceName) {
        // Internal services
        if (serviceUrl === 'internal://dashboard') return '📊';
        if (serviceUrl === 'internal://todo') return '✓';
        if (serviceUrl === 'internal://calendar') return '📅';
        if (serviceUrl === 'internal://files') return '📁';
        if (serviceUrl === 'internal://gdrive') return '☁️';
        if (serviceUrl === 'internal://ai') return '🤖';

        // External services - try to detect by URL or name
        const lowerUrl = serviceUrl.toLowerCase();
        const lowerName = serviceName.toLowerCase();

        if (lowerUrl.includes('nextcloud') || lowerName.includes('nextcloud')) return '☁️';
        if (lowerUrl.includes('drive') || lowerName.includes('drive')) return '💾';
        if (lowerUrl.includes('mail') || lowerName.includes('mail')) return '✉️';
        if (lowerUrl.includes('chat') || lowerName.includes('chat')) return '💬';
        if (lowerUrl.includes('github') || lowerName.includes('github')) return '🐙';
        if (lowerUrl.includes('gitlab') || lowerName.includes('gitlab')) return '🦊';
        if (lowerUrl.includes('notion') || lowerName.includes('notion')) return '📝';
        if (lowerUrl.includes('trello') || lowerName.includes('trello')) return '📋';
        if (lowerUrl.includes('slack') || lowerName.includes('slack')) return '💬';
        if (lowerUrl.includes('discord') || lowerName.includes('discord')) return '🎮';

        // Default icon for external services
        return '🌐';
    }

    // Export to namespace
    window.NexusModules.utils = {
        formatSize,
        formatDateTime,
        getFileIcon,
        getServiceIcon
    };

    // Also export to window for backward compatibility with existing code
    window.formatSize = formatSize;
    window.formatDateTime = formatDateTime;
    window.getFileIcon = getFileIcon;
    window.getServiceIcon = getServiceIcon;

})();
