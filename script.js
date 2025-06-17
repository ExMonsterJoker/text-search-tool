class ImageTextSearchTool {
    constructor() {
        // Core data
        this.images = [];
        this.annotations = [];
        this.currentImageIndex = 0;
        this.searchResults = [];
        this.currentResultIndex = -1;

        // DOM elements
        this.canvas = document.getElementById('imageCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.imageContainer = document.getElementById('imageContainer');

        // Zoom and Pan
        this.zoomLevel = 1;
        this.minZoom = 0.1;
        this.maxZoom = 10;
        this.zoomStep = 0.1;
        this.panX = 0;
        this.panY = 0;
        this.isPanning = false;
        this.lastPanPoint = { x: 0, y: 0 };

        // Image state
        this.currentImage = null;
        this.imageWidth = 0;
        this.imageHeight = 0;

        // Annotation editing state
        this.selectedAnnotation = null;
        this.isDrawingMode = false;
        this.isDrawing = false;
        this.newBbox = null;
        this.interaction = {
            isResizing: false,
            isDragging: false,
            handle: null,
            startX: 0,
            startY: 0,
        };
        this.resizeHandleSize = 8;


        this.initializeEventListeners();
        this.initializeFullscreenEventListeners();
    }

    initializeEventListeners() {
        // File loading
        document.getElementById('loadFiles').addEventListener('click', () => this.loadFiles());

        // Search functionality
        document.getElementById('searchBtn').addEventListener('click', () => this.performSearch());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearSearch());
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });

        // Navigation
        document.getElementById('prevBtn').addEventListener('click', () => this.previousImage());
        document.getElementById('nextBtn').addEventListener('click', () => this.nextImage());

        // Zoom controls
        document.getElementById('zoomInBtn').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoomOutBtn').addEventListener('click', () => this.zoomOut());
        document.getElementById('zoomResetBtn').addEventListener('click', () => this.resetZoom());

        // Canvas interactions
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this.handleMouseUp(e));

        // Prevent context menu on right click
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Save change button
        document.getElementById('saveChangesBtn').addEventListener('click', () => this.saveAnnotations());
    }

    // Zoom functionality
    handleWheel(event) {
        if (event.ctrlKey) {
            event.preventDefault();

            const rect = this.canvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;

            const delta = event.deltaY > 0 ? -this.zoomStep : this.zoomStep;
            this.zoomAt(mouseX, mouseY, delta);
        }
    }

    zoomAt(mouseX, mouseY, delta) {
        const oldZoom = this.zoomLevel;
        this.zoomLevel = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomLevel + delta));

        if (this.zoomLevel !== oldZoom) {
            // Adjust pan to zoom towards mouse position
            const zoomRatio = this.zoomLevel / oldZoom;
            this.panX = mouseX - (mouseX - this.panX) * zoomRatio;
            this.panY = mouseY - (mouseY - this.panY) * zoomRatio;

            this.redrawCanvas();
            this.updateZoomDisplay();
        }
    }

    zoomIn() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        this.zoomAt(centerX, centerY, this.zoomStep);
    }

    zoomOut() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        this.zoomAt(centerX, centerY, -this.zoomStep);
    }

    resetZoom() {
        this.zoomLevel = 1;
        this.panX = 0;
        this.panY = 0;
        this.redrawCanvas();
        this.updateZoomDisplay();
    }

    updateZoomDisplay() {
        document.getElementById('zoomLevel').textContent = `${Math.round(this.zoomLevel * 100)}%`;

        // Update button states
        document.getElementById('zoomInBtn').disabled = this.zoomLevel >= this.maxZoom;
        document.getElementById('zoomOutBtn').disabled = this.zoomLevel <= this.minZoom;
    }

    // Pan functionality
    handleMouseDown(event) {
        if (event.button === 0) { // Left mouse button
            this.isPanning = true;
            this.lastPanPoint = { x: event.clientX, y: event.clientY };
            this.canvas.style.cursor = 'grabbing';
        }
    }

    handleMouseMove(event) {
        if (this.isPanning) {
            const deltaX = event.clientX - this.lastPanPoint.x;
            const deltaY = event.clientY - this.lastPanPoint.y;

            this.panX += deltaX;
            this.panY += deltaY;

            this.lastPanPoint = { x: event.clientX, y: event.clientY };
            this.redrawCanvas();
        }
    }

    handleMouseUp(event) {
        this.isPanning = false;
        this.canvas.style.cursor = 'crosshair';
    }

    // File loading (same as before)
    async loadFiles() {
        const imageFiles = document.getElementById('imageInput').files;
        const jsonFiles = document.getElementById('jsonInput').files;

        if (imageFiles.length === 0 || jsonFiles.length === 0) {
            alert('Please select both image files and JSON annotation files.');
            return;
        }

        // Load images
        this.images = [];
        for (let file of imageFiles) {
            const imageData = await this.loadImageFile(file);
            this.images.push(imageData);
        }

        // Load annotations
        this.annotations = [];
        for (let file of jsonFiles) {
            const annotationData = await this.loadJsonFile(file);
            this.annotations.push(annotationData);
        }

        console.log('Loaded:', this.images.length, 'images and', this.annotations.length, 'annotation files');

        if (this.images.length > 0) {
            this.currentImageIndex = 0;
            this.resetZoom();
            this.displayCurrentImage();
            this.updateNavigation();
        }
    }

    loadImageFile(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    resolve({
                        name: file.name,
                        image: img,
                        file: file
                    });
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    loadJsonFile(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    resolve({
                        name: file.name,
                        data: data
                    });
                } catch (error) {
                    console.error('Error parsing JSON:', error);
                    resolve({ name: file.name, data: [] });
                }
            };
            reader.readAsText(file);
        });
    }

    displayCurrentImage() {
        if (this.images.length === 0) return;

        const currentImageData = this.images[this.currentImageIndex];
        this.currentImage = currentImageData.image;
        this.imageWidth = this.currentImage.width;
        this.imageHeight = this.currentImage.height;

        // Set canvas size to fit container
        const maxWidth = 800;
        const maxHeight = 600;

        let displayWidth = this.imageWidth;
        let displayHeight = this.imageHeight;

        // Scale down if image is too large
        if (displayWidth > maxWidth || displayHeight > maxHeight) {
            const scaleX = maxWidth / displayWidth;
            const scaleY = maxHeight / displayHeight;
            const scale = Math.min(scaleX, scaleY);

            displayWidth *= scale;
            displayHeight *= scale;
        }

        this.canvas.width = displayWidth;
        this.canvas.height = displayHeight;

        this.redrawCanvas();

        // Update image info
        document.getElementById('imageInfo').textContent =
            `${currentImageData.name} (${this.imageWidth}×${this.imageHeight})`;

        this.updateZoomDisplay();
    }

    redrawCanvas() {
        if (!this.currentImage) return;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Save context state
        this.ctx.save();

        // Apply zoom and pan transformations
        this.ctx.translate(this.panX, this.panY);
        this.ctx.scale(this.zoomLevel, this.zoomLevel);

        // Draw image
        this.ctx.drawImage(this.currentImage, 0, 0, this.canvas.width, this.canvas.height);

        // Draw annotations
        this.drawAnnotations();

        // Restore context state
        this.ctx.restore();
    }

    drawAnnotations() {
        const currentImageData = this.images[this.currentImageIndex];
        const matchingAnnotation = this.findMatchingAnnotation(currentImageData.name);

        if (!matchingAnnotation) return;

        matchingAnnotation.data.forEach((annotation, index) => {
            this.drawBoundingBox(annotation, index);
        });
    }

    drawBoundingBox(annotation, index) {
        const bbox = annotation.bbox;
        if (!bbox || bbox.length !== 4) return;

        // Convert image coordinates to canvas coordinates
        const scaleX = this.canvas.width / this.imageWidth;
        const scaleY = this.canvas.height / this.imageHeight;

        const scaledPoints = bbox.map(point => [
            point[0] * scaleX,
            point[1] * scaleY
        ]);

        // Check if this annotation is in search results
        const isSearchResult = this.searchResults.some(result =>
            result.annotation === annotation && result.imageIndex === this.currentImageIndex
        );

        // Set style based on whether it's a search result
        this.ctx.strokeStyle = isSearchResult ? '#f39c12' : '#e74c3c';
        this.ctx.lineWidth = (isSearchResult ? 4 : 2) / this.zoomLevel; // Adjust line width for zoom
        this.ctx.fillStyle = isSearchResult ? 'rgba(243, 156, 18, 0.2)' : 'rgba(231, 76, 60, 0.1)';

        // Draw bounding box
        this.ctx.beginPath();
        this.ctx.moveTo(scaledPoints[0][0], scaledPoints[0][1]);
        for (let i = 1; i < scaledPoints.length; i++) {
            this.ctx.lineTo(scaledPoints[i][0], scaledPoints[i][1]);
        }
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();

        // Draw text label (only if zoom level is reasonable)
        if (annotation.text && this.zoomLevel > 0.3) {
            this.ctx.fillStyle = isSearchResult ? '#f39c12' : '#e74c3c';
            this.ctx.font = `bold ${12 / this.zoomLevel}px Arial`; // Adjust font size for zoom

            const textToShow = annotation.text.length > 20 ?
                annotation.text.substring(0, 20) + '...' : annotation.text;

            this.ctx.fillText(
                textToShow,
                scaledPoints[0][0],
                scaledPoints[0][1] - 5 / this.zoomLevel
            );
        }
    }

    findMatchingAnnotation(imageName) {
        // Try to find annotation file that matches the image
        const imageBaseName = imageName.replace(/\.(jpg|jpeg|png|bmp)$/i, '');

        return this.annotations.find(annotation => {
            const annotationBaseName = annotation.name.replace(/(_final)?\.json$/i, '');
            return annotationBaseName === imageBaseName ||
                annotation.name.includes(imageBaseName) ||
                imageBaseName.includes(annotationBaseName);
        });
    }

    performSearch() {
        const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
        if (!searchTerm) {
            alert('Please enter a search term.');
            return;
        }

        this.searchResults = [];

        // Search through all annotations
        this.annotations.forEach((annotationFile, fileIndex) => {
            annotationFile.data.forEach((annotation, annotationIndex) => {
                if (annotation.text && annotation.text.toLowerCase().includes(searchTerm)) {
                    // Find corresponding image
                    const imageIndex = this.findImageIndex(annotationFile.name);
                    if (imageIndex !== -1) {
                        this.searchResults.push({
                            text: annotation.text,
                            annotation: annotation,
                            imageIndex: imageIndex,
                            imageName: this.images[imageIndex].name,
                            annotationIndex: annotationIndex,
                            confidence: annotation.confidence || 0
                        });
                    }
                }
            });
        });

        this.displaySearchResults();
        this.updateSearchInfo();

        if (this.searchResults.length > 0) {
            this.jumpToResult(0);
        }
    }

    findImageIndex(annotationFileName) {
        const annotationBaseName = annotationFileName.replace(/(_final)?\.json$/i, '');

        return this.images.findIndex(image => {
            const imageBaseName = image.name.replace(/\.(jpg|jpeg|png|bmp)$/i, '');
            return imageBaseName === annotationBaseName ||
                annotationFileName.includes(imageBaseName) ||
                imageBaseName.includes(annotationBaseName);
        });
    }

    displaySearchResults() {
        const resultsList = document.getElementById('resultsList');
        resultsList.innerHTML = '';

        if (this.searchResults.length === 0) {
            resultsList.innerHTML = '<div class="no-results">No results found</div>';
            return;
        }

        this.searchResults.forEach((result, index) => {
            const resultItem = document.createElement('div');
            resultItem.className = 'result-item';
            resultItem.innerHTML = `
                <div class="result-text">${result.text}</div>
                <div class="result-image">📷 ${result.imageName}</div>
                <div class="result-confidence">🎯 ${(result.confidence * 100).toFixed(1)}%</div>
            `;

            resultItem.addEventListener('click', () => this.jumpToResult(index));
            resultsList.appendChild(resultItem);
        });
    }

    jumpToResult(resultIndex) {
        if (resultIndex < 0 || resultIndex >= this.searchResults.length) return;

        this.currentResultIndex = resultIndex;
        const result = this.searchResults[resultIndex];

        // Switch to the image containing this result
        this.currentImageIndex = result.imageIndex;
        this.displayCurrentImage();
        this.updateNavigation();

        // Highlight the selected result in the list
        document.querySelectorAll('.result-item').forEach((item, index) => {
            item.classList.toggle('active', index === resultIndex);
        });

        // Show details
        this.showTextDetails(result);

        // Auto-zoom and pan to the bounding box
        this.zoomToBoundingBox(result.annotation);
    }

    zoomToBoundingBox(annotation) {
        const bbox = annotation.bbox;
        if (!bbox || bbox.length !== 4) return;

        // Calculate bounding box dimensions in image coordinates
        const minX = Math.min(...bbox.map(p => p[0]));
        const maxX = Math.max(...bbox.map(p => p[0]));
        const minY = Math.min(...bbox.map(p => p[1]));
        const maxY = Math.max(...bbox.map(p => p[1]));

        const bboxWidth = maxX - minX;
        const bboxHeight = maxY - minY;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        // Convert to canvas coordinates
        const scaleX = this.canvas.width / this.imageWidth;
        const scaleY = this.canvas.height / this.imageHeight;

        const canvasCenterX = centerX * scaleX;
        const canvasCenterY = centerY * scaleY;
        const canvasBboxWidth = bboxWidth * scaleX;
        const canvasBboxHeight = bboxHeight * scaleY;

        // Calculate zoom level to fit bounding box nicely
        const padding = 100; // pixels of padding around the bbox
        const targetZoom = Math.min(
            (this.canvas.width - padding) / canvasBboxWidth,
            (this.canvas.height - padding) / canvasBboxHeight,
            this.maxZoom
        );

        // Set zoom level
        this.zoomLevel = Math.max(this.minZoom, Math.min(this.maxZoom, targetZoom));

        // Calculate pan to center the bounding box
        this.panX = this.canvas.width / 2 - canvasCenterX * this.zoomLevel;
        this.panY = this.canvas.height / 2 - canvasCenterY * this.zoomLevel;

        // Redraw with new zoom and pan
        this.redrawCanvas();
        this.updateZoomDisplay();

        // Create highlight effect
        this.createHighlightEffect(canvasCenterX, canvasCenterY);

        console.log(`🎯 Zoomed to text: "${annotation.text}" at ${Math.round(this.zoomLevel * 100)}%`);
    }

    createHighlightEffect(x, y) {
        // Create a pulsing circle effect at the location
        const highlight = document.createElement('div');
        highlight.style.position = 'absolute';
        highlight.style.left = (this.panX + x * this.zoomLevel - 20) + 'px';
        highlight.style.top = (this.panY + y * this.zoomLevel - 20) + 'px';
        highlight.style.width = '40px';
        highlight.style.height = '40px';
        highlight.style.borderRadius = '50%';
        highlight.style.border = '3px solid #f39c12';
        highlight.style.backgroundColor = 'rgba(243, 156, 18, 0.3)';
        highlight.style.pointerEvents = 'none';
        highlight.style.zIndex = '1000';
        highlight.style.animation = 'pulse 2s ease-in-out';

        // Add CSS animation if not exists
        if (!document.getElementById('pulseAnimation')) {
            const style = document.createElement('style');
            style.id = 'pulseAnimation';
            style.textContent = `
                @keyframes pulse {
                    0% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.5); opacity: 0.7; }
                    100% { transform: scale(1); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        this.imageContainer.style.position = 'relative';
        this.imageContainer.appendChild(highlight);

        // Remove highlight after animation
        setTimeout(() => {
            if (highlight.parentElement) {
                highlight.parentElement.removeChild(highlight);
            }
        }, 2000);
    }

    showTextDetails(result) {
        const detailsPanel = document.getElementById('textDetails');
        detailsPanel.innerHTML = `
            <h4>📝 Text Content</h4>
            <p><strong>"${result.text}"</strong></p>
            
            <h4>📊 Details</h4>
            <ul>
                <li><strong>Image:</strong> ${result.imageName}</li>
                <li><strong>Confidence:</strong> ${(result.confidence * 100).toFixed(2)}%</li>
                <li><strong>Coordinates:</strong> ${this.formatCoordinates(result.annotation.bbox)}</li>
                <li><strong>Orientation:</strong> ${result.annotation.orientation || 0}°</li>
            </ul>
            
            <h4>🎯 Actions</h4>
            <button onclick="tool.copyCoordinates('${this.formatCoordinates(result.annotation.bbox)}')">
                📋 Copy Coordinates
            </button>
            <button onclick="tool.copyText('${result.text.replace(/'/g, "\\'")}')">
                📝 Copy Text
            </button>
            <button onclick="tool.zoomToBoundingBox(tool.searchResults[${this.currentResultIndex}].annotation)">
                🔍 Zoom to Text
            </button>
        `;
    }

    formatCoordinates(bbox) {
        if (!bbox || bbox.length !== 4) return 'Invalid coordinates';
        return bbox.map(point => `(${point[0]}, ${point[1]})`).join(' → ');
    }

    copyCoordinates(coords) {
        navigator.clipboard.writeText(coords).then(() => {
            alert('📋 Coordinates copied to clipboard!');
        });
    }

    copyText(text) {
        navigator.clipboard.writeText(text).then(() => {
            alert('📝 Text copied to clipboard!');
        });
    }

    clearSearch() {
        document.getElementById('searchInput').value = '';
        this.searchResults = [];
        this.currentResultIndex = -1;

        document.getElementById('resultsList').innerHTML = '';
        document.getElementById('textDetails').textContent = 'Select a text region to see details';
        document.getElementById('searchResults').textContent = 'Ready to search';

        // Redraw current image without search highlights
        this.redrawCanvas();
    }

    updateSearchInfo() {
        const searchInfo = document.getElementById('searchResults');
        if (this.searchResults.length === 0) {
            searchInfo.textContent = 'No results found';
            searchInfo.style.color = '#e74c3c';
        } else {
            searchInfo.textContent = `Found ${this.searchResults.length} result(s)`;
            searchInfo.style.color = '#27ae60';
        }
    }

    handleCanvasClick(event) {
        if (this.isPanning) return; // Don't handle clicks while panning

        const rect = this.canvas.getBoundingClientRect();
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;

        // Convert canvas coordinates to image coordinates
        const imageX = ((canvasX - this.panX) / this.zoomLevel) * (this.imageWidth / this.canvas.width);
        const imageY = ((canvasY - this.panY) / this.zoomLevel) * (this.imageHeight / this.canvas.height);

        // Find clicked annotation
        const currentImageData = this.images[this.currentImageIndex];
        const matchingAnnotation = this.findMatchingAnnotation(currentImageData.name);

        if (!matchingAnnotation) return;

        const clickedAnnotation = matchingAnnotation.data.find(annotation => {
            return this.isPointInBoundingBox(imageX, imageY, annotation.bbox);
        });

        if (clickedAnnotation) {
            this.showTextDetails({
                text: clickedAnnotation.text,
                annotation: clickedAnnotation,
                imageName: currentImageData.name,
                confidence: clickedAnnotation.confidence || 0
            });
        }
    }

    isPointInBoundingBox(x, y, bbox) {
        if (!bbox || bbox.length !== 4) return false;

        const minX = Math.min(...bbox.map(p => p[0]));
        const maxX = Math.max(...bbox.map(p => p[0]));
        const minY = Math.min(...bbox.map(p => p[1]));
        const maxY = Math.max(...bbox.map(p => p[1]));

        return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }

    previousImage() {
        if (this.currentImageIndex > 0) {
            this.currentImageIndex--;
            this.resetZoom();
            this.displayCurrentImage();
            this.updateNavigation();
        }
    }

    nextImage() {
        if (this.currentImageIndex < this.images.length - 1) {
            this.currentImageIndex++;
            this.resetZoom();
            this.displayCurrentImage();
            this.updateNavigation();
        }
    }

    updateNavigation() {
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        const counter = document.getElementById('imageCounter');

        prevBtn.disabled = this.currentImageIndex === 0;
        nextBtn.disabled = this.currentImageIndex === this.images.length - 1;

        if (this.images.length > 0) {
            counter.textContent = `${this.currentImageIndex + 1} / ${this.images.length}`;
        } else {
            counter.textContent = 'No images loaded';
        }
    }
    // Add these methods to your existing ImageTextSearchTool class

    initializeFullscreenEventListeners() {
        // Fullscreen toggle
        document.getElementById('fullscreenToggle').addEventListener('click', () => this.enterFullscreen());
        document.getElementById('closeFullscreen').addEventListener('click', () => this.exitFullscreen());

        // Fullscreen search
        document.getElementById('fullscreenSearchBtn').addEventListener('click', () => this.performFullscreenSearch());
        document.getElementById('fullscreenClearBtn').addEventListener('click', () => this.clearFullscreenSearch());
        document.getElementById('fullscreenSearchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performFullscreenSearch();
        });

        // Fullscreen navigation
        document.getElementById('fullscreenPrevBtn').addEventListener('click', () => this.fullscreenPreviousImage());
        document.getElementById('fullscreenNextBtn').addEventListener('click', () => this.fullscreenNextImage());

        // Fullscreen zoom controls
        document.getElementById('fullscreenZoomInBtn').addEventListener('click', () => this.fullscreenZoomIn());
        document.getElementById('fullscreenZoomOutBtn').addEventListener('click', () => this.fullscreenZoomOut());
        document.getElementById('fullscreenZoomResetBtn').addEventListener('click', () => this.fullscreenResetZoom());

        // Fullscreen canvas interactions
        this.fullscreenCanvas = document.getElementById('fullscreenCanvas');
        this.fullscreenCtx = this.fullscreenCanvas.getContext('2d');
        this.fullscreenImageContainer = document.getElementById('fullscreenImageContainer');

        this.fullscreenCanvas.addEventListener('click', (e) => this.handleFullscreenCanvasClick(e));
        this.fullscreenCanvas.addEventListener('wheel', (e) => this.handleFullscreenWheel(e));
        this.fullscreenCanvas.addEventListener('mousedown', (e) => this.handleFullscreenMouseDown(e));
        this.fullscreenCanvas.addEventListener('mousemove', (e) => this.handleFullscreenMouseMove(e));
        this.fullscreenCanvas.addEventListener('mouseup', (e) => this.handleFullscreenMouseUp(e));
        this.fullscreenCanvas.addEventListener('mouseleave', (e) => this.handleFullscreenMouseUp(e));
        this.fullscreenCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    }

    handleKeyboardShortcuts(event) {
        if (this.isFullscreenMode) {
            switch(event.key) {
                case 'Escape':
                    this.exitFullscreen();
                    break;
                case 'ArrowLeft':
                    if (!event.target.matches('input')) {
                        event.preventDefault();
                        this.fullscreenPreviousImage();
                    }
                    break;
                case 'ArrowRight':
                    if (!event.target.matches('input')) {
                        event.preventDefault();
                        this.fullscreenNextImage();
                    }
                    break;
                case 'f':
                case 'F':
                    if (event.ctrlKey) {
                        event.preventDefault();
                        document.getElementById('fullscreenSearchInput').focus();
                    }
                    break;
            }
        } else {
            if (event.key === 'F11' || (event.key === 'f' && event.ctrlKey && event.shiftKey)) {
                event.preventDefault();
                this.enterFullscreen();
            }
        }
    }

    enterFullscreen() {
        this.isFullscreenMode = true;
        document.getElementById('regularMode').style.display = 'none';
        document.getElementById('fullscreenMode').classList.add('active');
        document.getElementById('fullscreenToggle').style.display = 'none';

        // Initialize fullscreen canvas properties
        this.fullscreenZoomLevel = 1;
        this.fullscreenPanX = 0;
        this.fullscreenPanY = 0;
        this.fullscreenIsPanning = false;

        // Copy current state to fullscreen
        if (this.images.length > 0) {
            this.displayFullscreenImage();
            this.updateFullscreenNavigation();
        }

        // Copy search results if any
        if (this.searchResults.length > 0) {
            this.displayFullscreenSearchResults();
            this.updateFullscreenSearchInfo();
        }

        console.log('🖥️ Entered fullscreen mode');
    }

    exitFullscreen() {
        this.isFullscreenMode = false;
        document.getElementById('regularMode').style.display = 'block';
        document.getElementById('fullscreenMode').classList.remove('active');
        document.getElementById('fullscreenToggle').style.display = 'block';

        // Sync back to regular mode
        this.displayCurrentImage();
        this.updateNavigation();

        console.log('🖥️ Exited fullscreen mode');
    }

    displayFullscreenImage() {
        if (this.images.length === 0) return;

        const currentImageData = this.images[this.currentImageIndex];
        this.currentImage = currentImageData.image;

        // Calculate canvas size for fullscreen
        const container = this.fullscreenImageContainer;
        const containerWidth = container.clientWidth - 40; // padding
        const containerHeight = container.clientHeight - 40;

        let displayWidth = this.currentImage.width;
        let displayHeight = this.currentImage.height;

        // Scale to fit container
        const scaleX = containerWidth / displayWidth;
        const scaleY = containerHeight / displayHeight;
        const scale = Math.min(scaleX, scaleY, 1); // Don't upscale

        displayWidth *= scale;
        displayHeight *= scale;

        this.fullscreenCanvas.width = displayWidth;
        this.fullscreenCanvas.height = displayHeight;

        this.redrawFullscreenCanvas();

        // Update title
        document.getElementById('fullscreenImageTitle').textContent =
            `${currentImageData.name} (${this.currentImage.width}×${this.currentImage.height})`;

        this.updateFullscreenZoomDisplay();
    }

    redrawFullscreenCanvas() {
        if (!this.currentImage) return;

        // Clear canvas
        this.fullscreenCtx.clearRect(0, 0, this.fullscreenCanvas.width, this.fullscreenCanvas.height);

        // Save context state
        this.fullscreenCtx.save();

        // Apply zoom and pan transformations
        this.fullscreenCtx.translate(this.fullscreenPanX, this.fullscreenPanY);
        this.fullscreenCtx.scale(this.fullscreenZoomLevel, this.fullscreenZoomLevel);

        // Draw image
        this.fullscreenCtx.drawImage(this.currentImage, 0, 0, this.fullscreenCanvas.width, this.fullscreenCanvas.height);

        // Draw annotations
        this.drawFullscreenAnnotations();

        // Restore context state
        this.fullscreenCtx.restore();
    }

    drawFullscreenAnnotations() {
        const currentImageData = this.images[this.currentImageIndex];
        const matchingAnnotation = this.findMatchingAnnotation(currentImageData.name);

        if (!matchingAnnotation) return;

        matchingAnnotation.data.forEach((annotation, index) => {
            this.drawFullscreenBoundingBox(annotation, index);
        });
    }

    drawFullscreenBoundingBox(annotation, index) {
        const bbox = annotation.bbox;
        if (!bbox || bbox.length !== 4) return;

        // Convert image coordinates to canvas coordinates
        const scaleX = this.fullscreenCanvas.width / this.imageWidth;
        const scaleY = this.fullscreenCanvas.height / this.imageHeight;

        const scaledPoints = bbox.map(point => [
            point[0] * scaleX,
            point[1] * scaleY
        ]);

        // Check if this annotation is in search results
        const isSearchResult = this.searchResults.some(result =>
            result.annotation === annotation && result.imageIndex === this.currentImageIndex
        );
        const isSelected = this.selectedAnnotation === annotation;

        // Set style
        if (isSelected) {
            this.fullscreenCtx.strokeStyle = '#3498db';
            this.fullscreenCtx.fillStyle = 'rgba(52, 152, 219, 0.3)';
        } else if (isSearchResult) {
            this.fullscreenCtx.strokeStyle = '#f39c12';
            this.fullscreenCtx.fillStyle = 'rgba(243, 156, 18, 0.2)';
        } else {
            this.fullscreenCtx.strokeStyle = '#e74c3c';
            this.fullscreenCtx.fillStyle = 'rgba(231, 76, 60, 0.1)';
        }

        this.fullscreenCtx.lineWidth = (isSearchResult || isSelected ? 4 : 2) / this.fullscreenZoomLevel;


        // Draw bounding box
        this.fullscreenCtx.beginPath();
        this.fullscreenCtx.moveTo(scaledPoints[0][0], scaledPoints[0][1]);
        for (let i = 1; i < scaledPoints.length; i++) {
            this.fullscreenCtx.lineTo(scaledPoints[i][0], scaledPoints[i][1]);
        }
        this.fullscreenCtx.closePath();
        this.fullscreenCtx.fill();
        this.fullscreenCtx.stroke();

        // Draw editable text
        this.drawEditableText(annotation, scaledPoints);

        // Draw text label
        if (annotation.text && this.fullscreenZoomLevel > 0.3) {
            this.fullscreenCtx.fillStyle = isSearchResult ? '#f39c12' : '#e74c3c';
            this.fullscreenCtx.font = `bold ${14 / this.fullscreenZoomLevel}px Arial`;

            const textToShow = annotation.text.length > 25 ?
                annotation.text.substring(0, 25) + '...' : annotation.text;

            this.fullscreenCtx.fillText(
                textToShow,
                scaledPoints[0][0],
                scaledPoints[0][1] - 8 / this.fullscreenZoomLevel
            );
        }
        if (isSelected) {
            this.drawResizeHandles(scaledPoints);
        }
    }

    drawEditableText(annotation, scaledPoints) {
        if (annotation.text && this.fullscreenZoomLevel > 0.3 && this.selectedAnnotation === annotation) {
            const textX = scaledPoints[0][0];
            const textY = scaledPoints[0][1] - 8 / this.fullscreenZoomLevel;
            this.fullscreenCtx.fillStyle = '#3498db';
            this.fullscreenCtx.font = `bold ${14 / this.fullscreenZoomLevel}px Arial`;

            const textWidth = this.fullscreenCtx.measureText(annotation.text).width;
            const textHeight = 14 / this.fullscreenZoomLevel; // Approximate height

            // Draw editable text background
            this.fullscreenCtx.fillStyle = 'rgba(243, 156, 18, 0.2)';
            this.fullscreenCtx.fillRect(textX, textY - textHeight, textWidth, textHeight);

            // Draw text
            this.fullscreenCtx.fillStyle = '#3498db';
            this.fullscreenCtx.fillText(annotation.text, textX, textY);

            // Add editable text element
            this.addEditableTextElement(annotation, textX, textY, textWidth, textHeight);
        }
    }

    addEditableTextElement(annotation, textX, textY, textWidth, textHeight) {
        const editableText = document.createElement('div');
        editableText.className = 'editable-text';
        editableText.style.left = `${textX}px`;
        editableText.style.top = `${textY - textHeight}px`;
        editableText.style.position = 'absolute';
        editableText.textContent = annotation.text;
        editableText.contentEditable = true;
        editableText.addEventListener('blur', () => {
            annotation.text = editableText.textContent; // Update annotation text
            this.redrawFullscreenCanvas(); // Redraw canvas
            this.removeEditableTextElement();
        });
        this.fullscreenImageContainer.appendChild(editableText);
        editableText.focus();
    }

    removeEditableTextElement() {
        const editableText = document.querySelector('.editable-text');
        if (editableText) {
            editableText.parentElement.removeChild(editableText);
        }
    }

    drawResizeHandles(scaledPoints) {
        this.fullscreenCtx.fillStyle = '#3498db';
        scaledPoints.forEach(p => {
            this.fullscreenCtx.fillRect(
                p[0] - this.resizeHandleSize / (2 * this.fullscreenZoomLevel),
                p[1] - this.resizeHandleSize / (2 * this.fullscreenZoomLevel),
                this.resizeHandleSize / this.fullscreenZoomLevel,
                this.resizeHandleSize / this.fullscreenZoomLevel
            );
        });
    }


    saveAnnotations() {
        const modifiedAnnotations = this.annotations.map(annotationFile => {
            return {
                name: annotationFile.name,
                data: annotationFile.data.map(annotation => {
                    return {
                        text: annotation.text,
                        confidence: annotation.confidence,
                        bbox: annotation.bbox,
                        orientation: annotation.orientation
                    };
                })
            };
        });
        const blob = new Blob([JSON.stringify(modifiedAnnotations, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'modified_annotations.json';
        a.click();
        URL.revokeObjectURL(url);
        console.log('💾 Annotations saved to modified_annotations.json');
    }

    // Fullscreen zoom methods
    handleFullscreenWheel(event) {
        if (event.ctrlKey) {
            event.preventDefault();

            const rect = this.fullscreenCanvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;

            const delta = event.deltaY > 0 ? -this.zoomStep : this.zoomStep;
            this.fullscreenZoomAt(mouseX, mouseY, delta);
        }
    }

    fullscreenZoomAt(mouseX, mouseY, delta) {
        const oldZoom = this.fullscreenZoomLevel;
        this.fullscreenZoomLevel = Math.max(this.minZoom, Math.min(this.maxZoom, this.fullscreenZoomLevel + delta));

        if (this.fullscreenZoomLevel !== oldZoom) {
            const zoomRatio = this.fullscreenZoomLevel / oldZoom;
            this.fullscreenPanX = mouseX - (mouseX - this.fullscreenPanX) * zoomRatio;
            this.fullscreenPanY = mouseY - (mouseY - this.fullscreenPanY) * zoomRatio;

            this.redrawFullscreenCanvas();
            this.updateFullscreenZoomDisplay();
        }
    }

    fullscreenZoomIn() {
        const centerX = this.fullscreenCanvas.width / 2;
        const centerY = this.fullscreenCanvas.height / 2;
        this.fullscreenZoomAt(centerX, centerY, this.zoomStep);
    }

    fullscreenZoomOut() {
        const centerX = this.fullscreenCanvas.width / 2;
        const centerY = this.fullscreenCanvas.height / 2;
        this.fullscreenZoomAt(centerX, centerY, -this.zoomStep);
    }

    fullscreenResetZoom() {
        this.fullscreenZoomLevel = 1;
        this.fullscreenPanX = 0;
        this.fullscreenPanY = 0;
        this.redrawFullscreenCanvas();
        this.updateFullscreenZoomDisplay();
    }

    updateFullscreenZoomDisplay() {
        document.getElementById('fullscreenZoomLevel').textContent = `${Math.round(this.fullscreenZoomLevel * 100)}%`;

        document.getElementById('fullscreenZoomInBtn').disabled = this.fullscreenZoomLevel >= this.maxZoom;
        document.getElementById('fullscreenZoomOutBtn').disabled = this.fullscreenZoomLevel <= this.minZoom;
    }

    // Fullscreen pan methods
    handleFullscreenMouseDown(event) {
        if (event.button !== 0) return;

        const rect = this.fullscreenCanvas.getBoundingClientRect();
        const mouseX = (event.clientX - rect.left - this.fullscreenPanX) / this.fullscreenZoomLevel;
        const mouseY = (event.clientY - rect.top - this.fullscreenPanY) / this.fullscreenZoomLevel;

        const scaleX = this.fullscreenCanvas.width / this.imageWidth;
        const scaleY = this.fullscreenCanvas.height / this.imageHeight;

        if (this.selectedAnnotation) {
            const scaledPoints = this.selectedAnnotation.bbox.map(p => [p[0] * scaleX, p[1] * scaleY]);

            // Check for resize handle interaction
            for (let i = 0; i < scaledPoints.length; i++) {
                const handleX = scaledPoints[i][0];
                const handleY = scaledPoints[i][1];
                const handleSize = this.resizeHandleSize / this.fullscreenZoomLevel;

                if (
                    mouseX >= handleX - handleSize / 2 &&
                    mouseX <= handleX + handleSize / 2 &&
                    mouseY >= handleY - handleSize / 2 &&
                    mouseY <= handleY + handleSize / 2
                ) {
                    this.activeResizeHandle = i;
                    this.isResizing = true;
                    return;
                }
            }
        }

        // Check for dragging interaction
        if (this.selectedAnnotation && this.isPointInBbox(mouseX, mouseY, this.selectedAnnotation.bbox.map(p => [p[0] * scaleX, p[1] * scaleY]))) {
            this.isDragging = true;
            this.lastPanPoint = { x: mouseX, y: mouseY };
            return;
        }

        // Default to panning the canvas
        this.fullscreenIsPanning = true;
        this.fullscreenLastPanPoint = { x: event.clientX, y: event.clientY };
        this.fullscreenCanvas.style.cursor = 'grabbing';
    }

    handleFullscreenMouseMove(event) {
        if (this.isResizing) {
            const rect = this.fullscreenCanvas.getBoundingClientRect();
            const mouseX = (event.clientX - rect.left - this.fullscreenPanX) / this.fullscreenZoomLevel;
            const mouseY = (event.clientY - rect.top - this.fullscreenPanY) / this.fullscreenZoomLevel;

            const scaleX = this.fullscreenCanvas.width / this.imageWidth;
            const scaleY = this.fullscreenCanvas.height / this.imageHeight;

            this.selectedAnnotation.bbox[this.activeResizeHandle] = [mouseX / scaleX, mouseY / scaleY];
            this.redrawFullscreenCanvas();
            return;
        }

        if (this.isDragging) {
            const rect = this.fullscreenCanvas.getBoundingClientRect();
            const mouseX = (event.clientX - rect.left - this.fullscreenPanX) / this.fullscreenZoomLevel;
            const mouseY = (event.clientY - rect.top - this.fullscreenPanY) / this.fullscreenZoomLevel;

            const deltaX = mouseX - this.lastPanPoint.x;
            const deltaY = mouseY - this.lastPanPoint.y;

            const scaleX = this.fullscreenCanvas.width / this.imageWidth;
            const scaleY = this.fullscreenCanvas.height / this.imageHeight;

            this.selectedAnnotation.bbox = this.selectedAnnotation.bbox.map(p => [
                p[0] + deltaX / scaleX,
                p[1] + deltaY / scaleY
            ]);

            this.lastPanPoint = { x: mouseX, y: mouseY };
            this.redrawFullscreenCanvas();
            return;
        }

        if (this.fullscreenIsPanning) {
            const deltaX = event.clientX - this.fullscreenLastPanPoint.x;
            const deltaY = event.clientY - this.fullscreenLastPanPoint.y;

            this.fullscreenPanX += deltaX;
            this.fullscreenPanY += deltaY;

            this.fullscreenLastPanPoint = { x: event.clientX, y: event.clientY };
            this.redrawFullscreenCanvas();
        }
    }

    handleFullscreenMouseUp(event) {
        this.isResizing = false;
        this.isDragging = false;
        this.activeResizeHandle = null;
        this.fullscreenIsPanning = false;
        this.fullscreenCanvas.style.cursor = 'crosshair';
    }

    isPointInBbox(x, y, scaledBbox) {
        const minX = Math.min(...scaledBbox.map(p => p[0]));
        const maxX = Math.max(...scaledBbox.map(p => p[0]));
        const minY = Math.min(...scaledBbox.map(p => p[1]));
        const maxY = Math.max(...scaledBbox.map(p => p[1]));

        return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }

    // --- Helper Functions for Bbox Conversion ---
    /**
     * Converts a 4-point polygon bbox to a rectangular [minX, minY, maxX, maxY] representation.
     * @param {Array<Array<number>>} bbox - The polygon bounding box.
     * @returns {Array<number>} A rectangle array [minX, minY, maxX, maxY].
     */
    polygonToRect(bbox) {
        if (!bbox || bbox.length !== 4) return [0, 0, 0, 0];
        const xCoords = bbox.map(p => p[0]);
        const yCoords = bbox.map(p => p[1]);
        return [
            Math.min(...xCoords),
            Math.min(...yCoords),
            Math.max(...xCoords),
            Math.max(...yCoords)
        ];
    }

    /**
     * Converts a rectangular [minX, minY, maxX, maxY] bbox back to a 4-point polygon.
     * @param {Array<number>} rect - The rectangle array.
     * @returns {Array<Array<number>>} The 4-point polygon bbox.
     */
    rectToPolygon(rect) {
        const [minX, minY, maxX, maxY] = rect;
        return [
            [minX, minY], // Top-left
            [maxX, minY], // Top-right
            [maxX, maxY], // Bottom-right
            [minX, maxY]  // Bottom-left
        ];
    }

    // Fullscreen search methods
    performFullscreenSearch() {
        const searchTerm = document.getElementById('fullscreenSearchInput').value.trim().toLowerCase();
        if (!searchTerm) {
            alert('Please enter a search term.');
            return;
        }

        // Use the same search logic as regular mode
        this.searchResults = [];

        this.annotations.forEach((annotationFile, fileIndex) => {
            annotationFile.data.forEach((annotation, annotationIndex) => {
                if (annotation.text && annotation.text.toLowerCase().includes(searchTerm)) {
                    const imageIndex = this.findImageIndex(annotationFile.name);
                    if (imageIndex !== -1) {
                        this.searchResults.push({
                            text: annotation.text,
                            annotation: annotation,
                            imageIndex: imageIndex,
                            imageName: this.images[imageIndex].name,
                            annotationIndex: annotationIndex,
                            confidence: annotation.confidence || 0
                        });
                    }
                }
            });
        });

        this.displayFullscreenSearchResults();
        this.updateFullscreenSearchInfo();

        if (this.searchResults.length > 0) {
            this.jumpToFullscreenResult(0);
        }
    }

    displayFullscreenSearchResults() {
        const resultsList = document.getElementById('fullscreenResultsList');
        resultsList.innerHTML = '';

        if (this.searchResults.length === 0) {
            resultsList.innerHTML = '<div style="color: #7f8c8d; text-align: center; padding: 20px;">No results found</div>';
            return;
        }

        this.searchResults.forEach((result, index) => {
            const resultItem = document.createElement('div');
            resultItem.className = 'fullscreen-result-item';
            resultItem.innerHTML = `
                <div class="fullscreen-result-text">${result.text}</div>
                <div class.fullscreen-result-meta">
                    <span>📷 ${result.imageName.substring(0, 15)}${result.imageName.length > 15 ? '...' : ''}</span>
                    <span>🎯 ${(result.confidence * 100).toFixed(0)}%</span>
                </div>
            `;

            resultItem.addEventListener('click', () => this.jumpToFullscreenResult(index));
            resultsList.appendChild(resultItem);
        });
    }

    jumpToFullscreenResult(resultIndex) {
        if (resultIndex < 0 || resultIndex >= this.searchResults.length) return;

        this.currentResultIndex = resultIndex;
        const result = this.searchResults[resultIndex];

        // Switch to the image containing this result
        this.currentImageIndex = result.imageIndex;
        this.displayFullscreenImage();
        this.updateFullscreenNavigation();

        // Highlight the selected result in the list
        document.querySelectorAll('.fullscreen-result-item').forEach((item, index) => {
            item.classList.toggle('active', index === resultIndex);
        });

        // Show details
        this.showFullscreenTextDetails(result);

        // Auto-zoom and pan to the bounding box
        this.fullscreenZoomToBoundingBox(result.annotation);
    }

    fullscreenZoomToBoundingBox(annotation) {
        const bbox = annotation.bbox;
        if (!bbox || bbox.length !== 4) return;

        // Calculate bounding box dimensions in image coordinates
        const minX = Math.min(...bbox.map(p => p[0]));
        const maxX = Math.max(...bbox.map(p => p[0]));
        const minY = Math.min(...bbox.map(p => p[1]));
        const maxY = Math.max(...bbox.map(p => p[1]));

        const bboxWidth = maxX - minX;
        const bboxHeight = maxY - minY;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        // Convert to canvas coordinates
        const scaleX = this.fullscreenCanvas.width / this.imageWidth;
        const scaleY = this.fullscreenCanvas.height / this.imageHeight;

        const canvasCenterX = centerX * scaleX;
        const canvasCenterY = centerY * scaleY;
        const canvasBboxWidth = bboxWidth * scaleX;
        const canvasBboxHeight = bboxHeight * scaleY;

        // Calculate zoom level to fit bounding box nicely
        const padding = 150; // More padding for fullscreen
        const targetZoom = Math.min(
            (this.fullscreenCanvas.width - padding) / canvasBboxWidth,
            (this.fullscreenCanvas.height - padding) / canvasBboxHeight,
            this.maxZoom
        );

        // Set zoom level
        this.fullscreenZoomLevel = Math.max(this.minZoom, Math.min(this.maxZoom, targetZoom));

        // Calculate pan to center the bounding box
        this.fullscreenPanX = this.fullscreenCanvas.width / 2 - canvasCenterX * this.fullscreenZoomLevel;
        this.fullscreenPanY = this.fullscreenCanvas.height / 2 - canvasCenterY * this.fullscreenZoomLevel;

        // Redraw with new zoom and pan
        this.redrawFullscreenCanvas();
        this.updateFullscreenZoomDisplay();

        // Create highlight effect
        this.createFullscreenHighlightEffect(canvasCenterX, canvasCenterY);

        console.log(`🎯 Fullscreen zoomed to: "${annotation.text}" at ${Math.round(this.fullscreenZoomLevel * 100)}%`);
    }

    createFullscreenHighlightEffect(x, y) {
        // Create a pulsing circle effect at the location
        const highlight = document.createElement('div');
        highlight.style.position = 'absolute';
        highlight.style.left = (this.fullscreenPanX + x * this.fullscreenZoomLevel - 25) + 'px';
        highlight.style.top = (this.fullscreenPanY + y * this.fullscreenZoomLevel - 25) + 'px';
        highlight.style.width = '50px';
        highlight.style.height = '50px';
        highlight.style.borderRadius = '50%';
        highlight.style.border = '4px solid #f39c12';
        highlight.style.backgroundColor = 'rgba(243, 156, 18, 0.3)';
        highlight.style.pointerEvents = 'none';
        highlight.style.zIndex = '1000';
        highlight.style.animation = 'pulse 2.5s ease-in-out';
        highlight.style.boxShadow = '0 0 20px rgba(243, 156, 18, 0.6)';

        this.fullscreenImageContainer.style.position = 'relative';
        this.fullscreenImageContainer.appendChild(highlight);

        // Remove highlight after animation
        setTimeout(() => {
            if (highlight.parentElement) {
                highlight.parentElement.removeChild(highlight);
            }
        }, 2500);
    }

    showFullscreenTextDetails(result) {
        const detailsPanel = document.getElementById('fullscreenTextDetails');
        detailsPanel.innerHTML = `
            <h4>📝 Text Content</h4>
            <p><strong>"${result.text}"</strong></p>
            
            <h4>📊 Details</h4>
            <ul>
                <li><strong>Image:</strong> ${result.imageName}</li>
                <li><strong>Confidence:</strong> ${(result.confidence * 100).toFixed(2)}%</li>
                <li><strong>Coordinates:</strong> ${this.formatCoordinates(result.annotation.bbox)}</li>
                <li><strong>Orientation:</strong> ${result.annotation.orientation || 0}°</li>
            </ul>
            
            <h4>🎯 Actions</h4>
            <button onclick="tool.copyCoordinates('${this.formatCoordinates(result.annotation.bbox)}')">
                📋 Copy Coords
            </button>
            <button onclick="tool.copyText('${result.text.replace(/'/g, "\\'")}')">
                📝 Copy Text
            </button>
            <button onclick="tool.fullscreenZoomToBoundingBox(tool.searchResults[${this.currentResultIndex}].annotation)">
                🔍 Re-zoom
            </button>
        `;
    }

    clearFullscreenSearch() {
        document.getElementById('fullscreenSearchInput').value = '';
        this.searchResults = [];
        this.currentResultIndex = -1;

        document.getElementById('fullscreenResultsList').innerHTML = '<div style="color: #7f8c8d; text-align: center; padding: 20px;">No search results</div>';
        document.getElementById('fullscreenTextDetails').textContent = 'Select a text region to see details';
        document.getElementById('fullscreenSearchInfo').textContent = 'Ready to search';

        // Redraw current image without search highlights
        this.redrawFullscreenCanvas();
    }

    updateFullscreenSearchInfo() {
        const searchInfo = document.getElementById('fullscreenSearchInfo');
        if (this.searchResults.length === 0) {
            searchInfo.textContent = 'No results found';
            searchInfo.style.color = '#e74c3c';
        } else {
            searchInfo.textContent = `Found ${this.searchResults.length} result(s)`;
            searchInfo.style.color = '#27ae60';
        }
    }

    // Fullscreen navigation
    fullscreenPreviousImage() {
        if (this.currentImageIndex > 0) {
            this.currentImageIndex--;
            this.fullscreenResetZoom();
            this.displayFullscreenImage();
            this.updateFullscreenNavigation();
        }
    }

    fullscreenNextImage() {
        if (this.currentImageIndex < this.images.length - 1) {
            this.currentImageIndex++;
            this.fullscreenResetZoom();
            this.displayFullscreenImage();
            this.updateFullscreenNavigation();
        }
    }

    updateFullscreenNavigation() {
        const prevBtn = document.getElementById('fullscreenPrevBtn');
        const nextBtn = document.getElementById('fullscreenNextBtn');
        const counter = document.getElementById('fullscreenImageCounter');

        prevBtn.disabled = this.currentImageIndex === 0;
        nextBtn.disabled = this.currentImageIndex === this.images.length - 1;

        if (this.images.length > 0) {
            counter.textContent = `${this.currentImageIndex + 1} / ${this.images.length}`;
        } else {
            counter.textContent = 'No images loaded';
        }
    }

    // Fullscreen canvas click handling
    handleFullscreenCanvasClick(event) {
        if (this.fullscreenIsPanning || this.isResizing || this.isDragging) return;

        const rect = this.fullscreenCanvas.getBoundingClientRect();
        const canvasX = (event.clientX - rect.left - this.fullscreenPanX) / this.fullscreenZoomLevel;
        const canvasY = (event.clientY - rect.top - this.fullscreenPanY) / this.fullscreenZoomLevel;

        const scaleX = this.fullscreenCanvas.width / this.imageWidth;
        const scaleY = this.fullscreenCanvas.height / this.imageHeight;

        const currentImageData = this.images[this.currentImageIndex];
        const matchingAnnotation = this.findMatchingAnnotation(currentImageData.name);

        if (!matchingAnnotation) return;

        const clickedAnnotation = matchingAnnotation.data.find(annotation => {
            const scaledBbox = annotation.bbox.map(p => [p[0] * scaleX, p[1] * scaleY]);
            return this.isPointInBbox(canvasX, canvasY, scaledBbox);
        });

        if (clickedAnnotation) {
            this.selectedAnnotation = clickedAnnotation;
            this.showFullscreenTextDetails({
                text: clickedAnnotation.text,
                annotation: clickedAnnotation,
                imageName: currentImageData.name,
                confidence: clickedAnnotation.confidence || 0
            });
        } else {
            this.selectedAnnotation = null;
        }

        this.redrawFullscreenCanvas();
    }
}

// Initialize the tool when page loads
let tool;
document.addEventListener('DOMContentLoaded', () => {
    tool = new ImageTextSearchTool();
});