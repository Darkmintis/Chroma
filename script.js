// ===================================
// Chroma - JavaScript Logic
// Client-side design extraction tool
// Enhanced Version with Advanced Features
// ===================================

// DOM Elements
const urlInput = document.getElementById('urlInput');
const snatchBtn = document.getElementById('snatchBtn');
const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessage = document.getElementById('errorMessage');
const resultsSection = document.getElementById('resultsSection');
const colorPalette = document.getElementById('colorPalette');
const typography = document.getElementById('typography');
const copyCssBtn = document.getElementById('copyCssBtn');
const copyFeedback = document.getElementById('copyFeedback');

// State
let extractedColors = [];
let extractedFonts = [];
let extractedGradients = [];
let extractedSpacing = [];
let extractedBorderRadius = [];
let extractedShadows = [];
let colorStats = new Map(); // Track color usage with percentages
let fontStats = new Map(); // Track font usage with percentages
let currentUrl = '';
let analysisHistory = [];

// ===================================
// Initialization
// ===================================

// Load history from localStorage on page load
document.addEventListener('DOMContentLoaded', () => {
    loadHistoryFromStorage();
    applyThemePreference();
    
    // Setup additional event listeners
    const themeToggle = document.getElementById('themeToggle');
    const exportJsonBtn = document.getElementById('exportJsonBtn');
    
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    
    if (exportJsonBtn) {
        exportJsonBtn.addEventListener('click', () => {
            exportAsJSON();
            showCopyFeedback('Exported as JSON!');
        });
    }
});

// ===================================
// Event Listeners
// ===================================

snatchBtn.addEventListener('click', handleSnatch);
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSnatch();
});

copyCssBtn.addEventListener('click', handleCopyCss);

// ===================================
// Main Functions
// ===================================

async function handleSnatch() {
    const url = urlInput.value.trim();
    
    // Validation
    if (!url) {
        showError('Please enter a website URL');
        return;
    }
    
    if (!isValidUrl(url)) {
        showError('Please enter a valid URL (e.g., https://example.com)');
        return;
    }
    
    // Reset UI and disable button
    hideError();
    hideResults();
    showLoading();
    snatchBtn.disabled = true;
    currentUrl = url;
    
    try {
        // Fetch website content with timeout
        const html = await fetchSiteContent(url);
        
        if (!html || html.length < 100) {
            throw new Error('Received empty or invalid response from website');
        }
        
        // Extract styles
        const styles = await extractStyles(html, url);
        
        // Extract all style properties with statistics
        const colorData = extractColors(styles);
        extractedColors = colorData.colors;
        colorStats = colorData.stats;
        
        const fontData = extractFonts(styles);
        extractedFonts = fontData.fonts;
        fontStats = fontData.stats;
        
        extractedGradients = extractGradients(styles);
        extractedSpacing = extractSpacing(styles);
        extractedBorderRadius = extractBorderRadius(styles);
        extractedShadows = extractShadows(styles);
        
        // Validate results
        if (extractedColors.length === 0 && extractedFonts.length === 0) {
            showError('No styles found. The website might be blocking access or using JavaScript-generated styles.');
            return;
        }
        
        // Save to history
        saveToHistory(url, {
            colors: extractedColors,
            fonts: extractedFonts,
            gradients: extractedGradients,
            timestamp: new Date().toISOString()
        });
        
        // Display results
        displayResults();
        
    } catch (error) {
        console.error('Error:', error);
        let errorMsg = 'Failed to analyze website. ';
        
        if (error.message.includes('fetch')) {
            errorMsg += 'Network error or website is blocking requests.';
        } else if (error.message.includes('timeout')) {
            errorMsg += 'Request timed out. The website took too long to respond.';
        } else if (error.message.includes('CORS')) {
            errorMsg += 'CORS policy prevented access.';
        } else {
            errorMsg += 'Please check if the URL is correct and publicly accessible.';
        }
        
        showError(errorMsg);
    } finally {
        hideLoading();
        snatchBtn.disabled = false;
    }
}

async function fetchSiteContent(url) {
    // Try multiple CORS proxies for better reliability
    const proxies = [
        { url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, name: 'AllOrigins' },
        { url: `https://corsproxy.io/?${encodeURIComponent(url)}`, name: 'CorsProxy' },
        { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, name: 'CodeTabs' }
    ];
    
    let lastError = null;
    const timeout = 15000; // 15 second timeout per proxy
    
    for (const proxy of proxies) {
        try {
            updateLoadingStatus(`Trying ${proxy.name}...`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            const response = await fetch(proxy.url, {
                method: 'GET',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const html = await response.text();
                if (html && html.length > 100) {
                    updateLoadingStatus('Parsing styles...');
                    return html;
                }
            }
        } catch (error) {
            lastError = error;
            console.debug(`${proxy.name} failed:`, error.message);
            
            if (error.name === 'AbortError') {
                console.debug(`${proxy.name} timed out after ${timeout}ms`);
            }
        }
    }
    
    throw lastError || new Error('All proxies failed to fetch the website');
}

async function extractStyles(html, baseUrl) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    let allStyles = '';
    
    // Extract inline styles from <style> tags (most reliable)
    allStyles += extractInlineStyles(doc);
    
    // Extract inline styles from elements (second most reliable)
    allStyles += extractElementStyles(doc);
    
    // Extract CSS variables from :root
    allStyles += extractRootVariables(doc);
    
    // Try to fetch external stylesheets if we don't have enough inline styles
    if (allStyles.length < 500) {
        allStyles += await fetchExternalStylesheets(doc, baseUrl);
    }
    
    return allStyles;
}

function extractInlineStyles(doc) {
    let styles = '';
    const styleTags = doc.querySelectorAll('style');
    for (const tag of styleTags) {
        styles += tag.textContent + '\n';
    }
    return styles;
}

function extractElementStyles(doc) {
    let styles = '';
    const elementsWithStyle = doc.querySelectorAll('[style]');
    for (const el of elementsWithStyle) {
        styles += el.getAttribute('style') + ';';
    }
    return styles;
}

function extractRootVariables(doc) {
    let styles = '';
    const rootStyles = doc.querySelectorAll('style');
    for (const style of rootStyles) {
        const content = style.textContent;
        const rootMatch = content.match(/:root\s*{([^}]+)}/);
        if (rootMatch) {
            styles += ':root {' + rootMatch[1] + '}\n';
        }
    }
    return styles;
}

async function fetchExternalStylesheets(doc, baseUrl) {
    let styles = '';
    const linkTags = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).slice(0, 3);
    
    for (const link of linkTags) {
        const href = link.getAttribute('href');
        if (href) {
            try {
                const cssUrl = new URL(href, baseUrl).href;
                const response = await fetch(cssUrl, { mode: 'cors' }).catch(() => null);
                if (response?.ok) {
                    const css = await response.text();
                    styles += css + '\n';
                }
            } catch (error) {
                console.debug('Skipped external stylesheet:', href, error.message);
            }
        }
    }
    
    return styles;
}

function extractColors(cssText) {
    const colorMap = new Map();
    
    // Extract all color formats
    extractHexColors(cssText, colorMap);
    extractRgbColors(cssText, colorMap);
    extractHslColors(cssText, colorMap);
    
    // Filter and deduplicate colors with statistics
    return getUniqueColorPalette(colorMap, cssText);
}

function getUniqueColorPalette(colorMap, cssText) {
    const result = filterAndDeduplicateColors(colorMap);
    
    // Only return default if we found absolutely nothing
    if (result.colors.length === 0 && cssText.length < 100) {
        return { colors: [], stats: new Map() };
    }
    
    return result;
}

function extractHexColors(cssText, colorMap) {
    const hexPattern = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
    let match;
    while ((match = hexPattern.exec(cssText)) !== null) {
        const hex = normalizeHex(match[0]);
        colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
    }
}

function extractRgbColors(cssText, colorMap) {
    const rgbPattern = /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)/g;
    let match;
    while ((match = rgbPattern.exec(cssText)) !== null) {
        const r = Number.parseInt(match[1], 10);
        const g = Number.parseInt(match[2], 10);
        const b = Number.parseInt(match[3], 10);
        if (isValidRgbValue(r) && isValidRgbValue(g) && isValidRgbValue(b)) {
            const hex = rgbToHex(r, g, b);
            colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
        }
    }
}

function extractHslColors(cssText, colorMap) {
    const hslPattern = /hsla?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/g;
    let match;
    while ((match = hslPattern.exec(cssText)) !== null) {
        const h = Number.parseFloat(match[1]);
        const s = Number.parseFloat(match[2]);
        const l = Number.parseFloat(match[3]);
        if (isValidHslValue(h, s, l)) {
            const hex = hslToHex(h, s, l);
            colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
        }
    }
}

function filterAndDeduplicateColors(colorMap) {
    // Calculate total occurrences for percentage
    const totalOccurrences = Array.from(colorMap.values()).reduce((sum, count) => sum + count, 0);
    
    const filteredColors = Array.from(colorMap.entries())
        .filter(([color]) => !isCommonColor(color))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);
    
    const uniqueColors = [];
    const statsMap = new Map();
    
    for (const [color, count] of filteredColors) {
        if (!hasSimilarColor(uniqueColors, color)) {
            uniqueColors.push(color);
            const percentage = ((count / totalOccurrences) * 100).toFixed(1);
            statsMap.set(color, {
                count: count,
                percentage: percentage,
                total: totalOccurrences
            });
            if (uniqueColors.length >= 10) break;
        }
    }
    
    return { colors: uniqueColors, stats: statsMap };
}

function extractFonts(cssText) {
    const fontMap = new Map();
    
    // Regex to find font-family declarations
    const fontFamilyPattern = /font-family\s*:\s*([^;{}]+)/gi;
    
    let match;
    while ((match = fontFamilyPattern.exec(cssText)) !== null) {
        const fontStack = match[1].trim();
        const fonts = parseFontStack(fontStack);
        
        for (const font of fonts) {
            if (font && !isGenericFont(font)) {
                fontMap.set(font, (fontMap.get(font) || 0) + 1);
            }
        }
    }
    
    // Also extract fonts from @font-face rules
    const fontFacePattern = /@font-face\s*{[^}]*font-family\s*:\s*['"]?([^'";}]+)['"]?/gi;
    while ((match = fontFacePattern.exec(cssText)) !== null) {
        const font = match[1].trim();
        if (font && !isGenericFont(font)) {
            fontMap.set(font, (fontMap.get(font) || 0) + 3); // Give higher weight to @font-face fonts
        }
    }
    
    // Calculate total for percentage
    const totalOccurrences = Array.from(fontMap.values()).reduce((sum, count) => sum + count, 0);
    
    // Sort by frequency and get top fonts with stats
    const sortedFonts = Array.from(fontMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
    
    const fonts = [];
    const statsMap = new Map();
    
    for (const [font, count] of sortedFonts) {
        fonts.push(font);
        const percentage = ((count / totalOccurrences) * 100).toFixed(1);
        statsMap.set(font, {
            count: count,
            percentage: percentage,
            total: totalOccurrences
        });
    }
    
    if (fonts.length === 0) {
        return { fonts: ['Inter', 'Roboto', 'Arial'], stats: new Map() };
    }
    
    return { fonts, stats: statsMap };
}

function extractGradients(cssText) {
    const gradients = new Set();
    
    // Match linear, radial, and conic gradients - improved regex for nested parentheses
    const gradientPattern = /((?:linear|radial|conic|repeating-linear|repeating-radial)-gradient\s*\([^;{}]+?\))/gi;
    let match;
    
    while ((match = gradientPattern.exec(cssText)) !== null) {
        let gradient = match[1].trim();
        
        // Handle nested parentheses by counting
        let openCount = 1;
        let startPos = gradient.indexOf('(') + 1;
        let endPos = startPos;
        
        while (openCount > 0 && endPos < gradient.length) {
            if (gradient[endPos] === '(') openCount++;
            if (gradient[endPos] === ')') openCount--;
            endPos++;
        }
        
        // Clean up the gradient
        gradient = gradient.substring(0, endPos);
        
        if (gradient.length > 20 && gradient.length < 300 && !gradient.includes('undefined')) {
            gradients.add(gradient);
            if (gradients.size >= 8) break; // Limit to 8 gradients
        }
    }
    
    return Array.from(gradients);
}

function extractSpacing(cssText) {
    const spacingMap = new Map();
    
    // Extract padding and margin values
    const spacingPattern = /(padding|margin):\s*([^;{}]+)/gi;
    let match;
    
    while ((match = spacingPattern.exec(cssText)) !== null) {
        const value = match[2].trim();
        // Only track rem and px values
        if (/\d+(?:px|rem|em)/.test(value)) {
            spacingMap.set(value, (spacingMap.get(value) || 0) + 1);
        }
    }
    
    // Get top 5 most common spacing values
    return Array.from(spacingMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value]) => value);
}

function extractBorderRadius(cssText) {
    const radiusSet = new Set();
    
    // Extract border-radius values
    const radiusPattern = /border-radius:\s*([^;{}]+)/gi;
    let match;
    
    while ((match = radiusPattern.exec(cssText)) !== null) {
        const value = match[1].trim();
        if (/\d+(?:px|rem|em|%)/.test(value)) {
            radiusSet.add(value);
            if (radiusSet.size >= 5) break;
        }
    }
    
    return Array.from(radiusSet);
}

function extractShadows(cssText) {
    const shadowSet = new Set();
    
    // Extract box-shadow values
    const shadowPattern = /box-shadow:\s*([^;{}]+)/gi;
    let match;
    
    while ((match = shadowPattern.exec(cssText)) !== null) {
        const value = match[1].trim();
        if (value !== 'none' && value.length > 10 && value.length < 150) {
            shadowSet.add(value);
            if (shadowSet.size >= 5) break;
        }
    }
    
    return Array.from(shadowSet);
}

function displayResults() {
    // Clear previous results
    colorPalette.innerHTML = '';
    typography.innerHTML = '';
    
    // Get gradient container (if exists)
    const gradientContainer = document.getElementById('gradientPalette');
    if (gradientContainer) {
        gradientContainer.innerHTML = '';
    }
    
    // Display colors with percentages
    for (const color of extractedColors) {
        const swatch = createColorSwatch(color);
        colorPalette.appendChild(swatch);
    }
    
    // Display fonts with percentages
    for (let index = 0; index < extractedFonts.length; index++) {
        const font = extractedFonts[index];
        const fontItem = createFontItem(font, index);
        typography.appendChild(fontItem);
    }
    
    // Display gradients if found
    if (gradientContainer && extractedGradients.length > 0) {
        for (const gradient of extractedGradients) {
            const gradientItem = createGradientItem(gradient);
            gradientContainer.appendChild(gradientItem);
        }
        gradientContainer.parentElement.classList.remove('hidden');
    } else if (gradientContainer) {
        gradientContainer.parentElement.classList.add('hidden');
    }
    
    // Show results section
    showResults();
    
    // Smooth scroll to results
    setTimeout(() => {
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

function createGradientItem(gradient) {
    const item = document.createElement('div');
    item.className = 'gradient-item';
    
    const preview = document.createElement('div');
    preview.className = 'gradient-preview';
    preview.style.backgroundImage = gradient; // Use backgroundImage instead of background
    
    const code = document.createElement('div');
    code.className = 'gradient-code';
    code.textContent = gradient;
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'gradient-copy-btn';
    copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><rect x="7" y="7" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2"/><path d="M4 13H3C2.44772 13 2 12.5523 2 12V3C2 2.44772 2.44772 2 3 2H12C12.5523 2 13 2.44772 13 3V4" stroke="currentColor" stroke-width="2"/></svg>';
    copyBtn.setAttribute('aria-label', 'Copy gradient');
    
    // Click to copy gradient
    const copyGradient = (e) => {
        e.stopPropagation();
        copyToClipboard(gradient);
        showCopyFeedback(`Copied gradient!`);
        item.classList.add('copied');
        setTimeout(() => item.classList.remove('copied'), 300);
    };
    
    copyBtn.addEventListener('click', copyGradient);
    item.addEventListener('click', copyGradient);
    
    item.appendChild(preview);
    item.appendChild(code);
    item.appendChild(copyBtn);
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    
    return item;
}

function createColorSwatch(color) {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color;
    swatch.setAttribute('role', 'button');
    swatch.setAttribute('tabindex', '0');
    swatch.setAttribute('aria-label', `Copy color ${color}`);
    
    // Add light/dark class for better text visibility
    if (isLightColor(color)) {
        swatch.classList.add('light-color');
    }
    
    const code = document.createElement('div');
    code.className = 'color-code';
    code.textContent = color.toUpperCase();
    
    // Add percentage info
    const stats = colorStats.get(color);
    if (stats) {
        const percentInfo = document.createElement('div');
        percentInfo.className = 'color-percentage';
        percentInfo.textContent = `${stats.percentage}%`;
        code.appendChild(percentInfo);
    }
    
    // Add contrast indicator
    const contrastWhite = getColorContrast(color, '#ffffff');
    const contrastBlack = getColorContrast(color, '#000000');
    
    const contrastInfo = document.createElement('div');
    contrastInfo.className = 'contrast-info';
    
    if (contrastWhite && contrastBlack) {
        const bestContrast = Math.max(contrastWhite, contrastBlack);
        let wcagLevel = 'Poor';
        if (bestContrast >= 7) {
            wcagLevel = 'AAA';
        } else if (bestContrast >= 4.5) {
            wcagLevel = 'AA';
        }
        contrastInfo.textContent = `WCAG: ${wcagLevel}`;
    }
    
    swatch.appendChild(code);
    swatch.appendChild(contrastInfo);
    
    // Click to copy
    const copyColor = () => {
        copyToClipboard(color);
        showCopyFeedback(`Copied ${color}!`);
        
        // Visual feedback
        swatch.classList.add('copied');
        setTimeout(() => swatch.classList.remove('copied'), 300);
    };
    
    swatch.addEventListener('click', copyColor);
    swatch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            copyColor();
        }
    });
    
    return swatch;
}

function createFontItem(font, index) {
    const item = document.createElement('div');
    item.className = 'font-item';
    
    const header = document.createElement('div');
    header.className = 'font-header';
    
    const name = document.createElement('div');
    name.className = 'font-name';
    
    let prefix = '';
    if (index === 0) {
        prefix = 'Primary: ';
    } else if (index === 1) {
        prefix = 'Secondary: ';
    }
    name.textContent = `${prefix}${font}`;
    
    // Add percentage badge
    const stats = fontStats.get(font);
    if (stats) {
        const badge = document.createElement('span');
        badge.className = 'font-percentage-badge';
        badge.textContent = `${stats.percentage}%`;
        name.appendChild(badge);
    }
    
    header.appendChild(name);
    
    const sample = document.createElement('div');
    sample.className = 'font-sample';
    sample.style.fontFamily = `${font}, sans-serif`;
    sample.textContent = 'The quick brown fox jumps over the lazy dog. 0123456789';
    
    item.appendChild(header);
    item.appendChild(sample);
    
    return item;
}

async function handleCopyCss() {
    copyCssBtn.disabled = true;
    const cssVariables = generateCssVariables();
    await copyToClipboard(cssVariables);
    showCopyFeedback('CSS Variables copied to clipboard!');
    setTimeout(() => {
        copyCssBtn.disabled = false;
    }, 2000);
}

function generateCssVariables() {
    let css = ':root {\n';
    
    // Colors
    if (extractedColors.length > 0) {
        css += '  /* Color Palette */\n';
        for (let index = 0; index < extractedColors.length; index++) {
            const color = extractedColors[index];
            let varName;
            if (index === 0) {
                varName = 'primary';
            } else if (index === 1) {
                varName = 'secondary';
            } else if (index === 2) {
                varName = 'accent';
            } else {
                varName = `color-${index + 1}`;
            }
            css += `  --${varName}-color: ${color};\n`;
        }
    }
    
    // Fonts
    if (extractedFonts.length > 0) {
        css += '\n  /* Typography */\n';
        for (let index = 0; index < extractedFonts.length; index++) {
            const font = extractedFonts[index];
            let varName;
            if (index === 0) {
                varName = 'primary';
            } else if (index === 1) {
                varName = 'secondary';
            } else {
                varName = `font-${index + 1}`;
            }
            css += `  --font-${varName}: ${font}, sans-serif;\n`;
        }
    }
    
    // Spacing
    if (extractedSpacing.length > 0) {
        css += '\n  /* Spacing */\n';
        extractedSpacing.forEach((spacing, index) => {
            css += `  --spacing-${index + 1}: ${spacing};\n`;
        });
    }
    
    // Border Radius
    if (extractedBorderRadius.length > 0) {
        css += '\n  /* Border Radius */\n';
        extractedBorderRadius.forEach((radius, index) => {
            css += `  --radius-${index + 1}: ${radius};\n`;
        });
    }
    
    // Shadows
    if (extractedShadows.length > 0) {
        css += '\n  /* Shadows */\n';
        extractedShadows.forEach((shadow, index) => {
            css += `  --shadow-${index + 1}: ${shadow};\n`;
        });
    }
    
    css += '}\n';
    return css;
}

// ===================================
// Helper Functions
// ===================================

function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (error) {
        // Invalid URL format - log for debugging
        console.debug('Invalid URL format:', error.message);
        return false;
    }
}

function normalizeHex(hex) {
    // Convert 3-digit hex to 6-digit
    if (hex.length === 4) {
        return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    return hex.toLowerCase();
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    
    let r = 0;
    let g = 0;
    let b = 0;
    
    if (h >= 0 && h < 60) {
        r = c;
        g = x;
    } else if (h >= 60 && h < 120) {
        r = x;
        g = c;
    } else if (h >= 120 && h < 180) {
        g = c;
        b = x;
    } else if (h >= 180 && h < 240) {
        g = x;
        b = c;
    } else if (h >= 240 && h < 300) {
        r = x;
        b = c;
    } else if (h >= 300 && h < 360) {
        r = c;
        b = x;
    }
    
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);
    
    return rgbToHex(r, g, b);
}

function isCommonColor(hex) {
    const common = ['#ffffff', '#fff', '#000000', '#000', '#transparent', '#fefefe', '#010101', '#fcfcfc', '#fdfdfd'];
    return common.includes(hex.toLowerCase());
}

function isValidRgbValue(value) {
    return value >= 0 && value <= 255;
}

function isValidHslValue(h, s, l) {
    return h >= 0 && h <= 360 && s >= 0 && s <= 100 && l >= 0 && l <= 100;
}

function hasSimilarColor(colors, newColor) {
    // Check if a similar color already exists
    const newRgb = hexToRgb(newColor);
    if (!newRgb) return false;
    
    for (const existingColor of colors) {
        const existingRgb = hexToRgb(existingColor);
        if (!existingRgb) continue;
        
        // Calculate color difference
        const diff = Math.abs(newRgb.r - existingRgb.r) +
                     Math.abs(newRgb.g - existingRgb.g) +
                     Math.abs(newRgb.b - existingRgb.b);
        
        // If colors are very similar (difference < 30), consider them duplicate
        if (diff < 30) return true;
    }
    
    return false;
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: Number.parseInt(result[1], 16),
        g: Number.parseInt(result[2], 16),
        b: Number.parseInt(result[3], 16)
    } : null;
}

function parseFontStack(fontStack) {
    return fontStack
        .split(',')
        .map(font => font.trim().replaceAll(/['"]/g, ''))
        .filter(font => font.length > 0);
}

function isGenericFont(font) {
    const generic = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'];
    return generic.includes(font.toLowerCase());
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (err) {
        console.error('Failed to copy:', err);
    }
}

function showCopyFeedback(message) {
    copyFeedback.textContent = message;
    copyFeedback.classList.remove('hidden');
    setTimeout(() => {
        copyFeedback.classList.add('hidden');
    }, 2000);
}

// ===================================
// History Management
// ===================================

function saveToHistory(url, data) {
    try {
        // Load existing history
        const history = JSON.parse(localStorage.getItem('chromaHistory') || '[]');
        
        // Add new entry at the beginning
        history.unshift({
            url,
            ...data,
            timestamp: new Date().toISOString()
        });
        
        // Keep only last 10 entries
        const trimmedHistory = history.slice(0, 10);
        
        // Save back to localStorage
        localStorage.setItem('chromaHistory', JSON.stringify(trimmedHistory));
        analysisHistory = trimmedHistory;
    } catch (error) {
        console.error('Failed to save to history:', error);
    }
}

function loadHistoryFromStorage() {
    try {
        const history = JSON.parse(localStorage.getItem('chromaHistory') || '[]');
        analysisHistory = history;
    } catch (error) {
        console.error('Failed to load history:', error);
        analysisHistory = [];
    }
}

// ===================================
// Theme Management
// ===================================

function applyThemePreference() {
    const savedTheme = localStorage.getItem('chromaTheme') || 'light';
    document.documentElement.dataset.theme = savedTheme;
}

function toggleTheme() {
    const currentTheme = document.documentElement.dataset.theme || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = newTheme;
    localStorage.setItem('chromaTheme', newTheme);
}

// ===================================
// Loading Status Updates
// ===================================

function updateLoadingStatus(message) {
    const loadingText = loadingIndicator.querySelector('p');
    if (loadingText) {
        loadingText.textContent = message;
    }
}

// ===================================
// Color Utilities
// ===================================

function getColorContrast(color1, color2) {
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);
    
    if (!rgb1 || !rgb2) return null;
    
    const l1 = getRelativeLuminance(rgb1);
    const l2 = getRelativeLuminance(rgb2);
    
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    
    return (lighter + 0.05) / (darker + 0.05);
}

function getRelativeLuminance(rgb) {
    const rsRGB = rgb.r / 255;
    const gsRGB = rgb.g / 255;
    const bsRGB = rgb.b / 255;
    
    const r = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
    const g = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
    const b = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);
    
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isLightColor(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return true;
    const luminance = getRelativeLuminance(rgb);
    return luminance > 0.5;
}

// ===================================
// Export Functionality
// ===================================

function exportAsJSON() {
    const data = {
        url: currentUrl,
        timestamp: new Date().toISOString(),
        colors: extractedColors,
        fonts: extractedFonts,
        gradients: extractedGradients,
        spacing: extractedSpacing,
        borderRadius: extractedBorderRadius,
        shadows: extractedShadows
    };
    
    const json = JSON.stringify(data, null, 2);
    downloadFile('chroma-export.json', json, 'application/json');
}

function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

// UI State Management
function showLoading() {
    loadingIndicator.classList.remove('hidden');
}

function hideLoading() {
    loadingIndicator.classList.add('hidden');
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
}

function hideError() {
    errorMessage.classList.add('hidden');
}

function showResults() {
    resultsSection.classList.remove('hidden');
}

function hideResults() {
    resultsSection.classList.add('hidden');
}
