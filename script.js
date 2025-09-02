
// script.js
window.addEventListener('load', function() {
    const canvas = document.getElementById('cutting-canvas');
    const ctx = canvas.getContext('2d');
    const steps = document.querySelectorAll('.step');
    const stepContents = document.querySelectorAll('.step-content');
    const nextButtons = document.querySelectorAll('.next-step');
    const prevButtons = document.querySelectorAll('.prev-step');
    const runOptimizationBtn = document.querySelector('.run-optimization');
    const addPartBtn = document.getElementById('add-part-btn');
    const partsListContainer = document.getElementById('parts-list-container');
    const optimizationSummary = document.getElementById('optimization-summary');
    const resultsSummary = document.getElementById('results-summary');
    const cuttingPlanContainer = document.getElementById('cutting-plan-container');
    const tabs = document.querySelectorAll('.tab');
    const exportPdfBtn = document.getElementById('export-pdf');
    const rerunOptimizationBtn = document.getElementById('rerun-optimization');
    const notification = document.getElementById('notification');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmMessage = document.getElementById('confirm-message');
    const confirmYes = document.getElementById('confirm-yes');
    const confirmNo = document.getElementById('confirm-no');
    const sheetIndicator = document.getElementById('sheet-indicator');
    const helpBtn = document.getElementById('help-btn');
    const helpModal = document.getElementById('help-modal');
    const closeHelp = document.getElementById('close-help');
    
    let currentStep = 1;
    let partsList = [];
    let history = []; // For undo/redo
    let currentMaterial = null;
    let optimizationResults = null;
    let currentTab = 'layout';
    let confirmCallback = null;
    let currentSheet = 0;
    let hoveredLine = null;
    let hoveredPart = null;
    
    // Load from localStorage if available
    loadFromLocalStorage();

    // Notification functions
    function showNotification(message, type = 'error') {
        notification.textContent = message;
        notification.className = type;
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
        }, 5000);
    }

    // Confirm modal functions
    function showConfirm(message, callback) {
        confirmMessage.textContent = message;
        confirmModal.style.display = 'flex';
        confirmCallback = callback;

        const handleYes = () => {
            confirmModal.style.display = 'none';
            callback(true);
        };

        const handleNo = () => {
            confirmModal.style.display = 'none';
            callback(false);
        };

        confirmYes.addEventListener('click', handleYes, { once: true });
        confirmNo.addEventListener('click', handleNo, { once: true });
        
        // Trap focus
        confirmModal.focus();
        const focusable = confirmModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        confirmModal.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === first) {
                        last.focus();
                        e.preventDefault();
                    }
                } else {
                    if (document.activeElement === last) {
                        first.focus();
                        e.preventDefault();
                    }
                }
            } else if (e.key === 'Escape') {
                handleNo();
            }
        });
    }
    
    // Set canvas size to match container
    function resizeCanvas() {
        const container = canvas.parentElement;
        const navHeight = document.querySelector('.sheet-navigation').clientHeight;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight - navHeight;
        if (optimizationResults) {
            drawCuttingLayout();
        }
    }
    
    // Initial resize
    resizeCanvas();
    
    // Resize when window changes
    window.addEventListener('resize', resizeCanvas);
    
    // Tab handling
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            currentTab = this.dataset.tab;
            updateTabContent();
        });
        tab.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                tab.click();
            }
        });
    });
    
    function updateTabContent() {
        const canvasContainer = document.querySelector('.canvas-container');
        canvasContainer.style.display = currentTab === 'layout' ? 'block' : 'none';
        cuttingPlanContainer.style.display = currentTab !== 'layout' ? 'block' : 'none';
        
        // Add transition
        canvasContainer.style.opacity = 0;
        canvasContainer.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
            canvasContainer.style.opacity = 1;
        }, 10);
        
        switch(currentTab) {
            case 'layout':
                drawCuttingLayout();
                break;
            case 'plan':
                showCuttingPlan();
                break;
            case 'remnants':
                showRemnants();
                break;
            case 'edging':
                showEdgeBanding();
                break;
        }
    }
    
    function drawCuttingLayout() {
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        if (!optimizationResults) return;
        
        updateSheetNavigation();
        
        // Handle case where no layouts are available
        if (!optimizationResults.layouts || optimizationResults.layouts.length === 0) {
            drawEmptySheet();
            return;
        }
        
        // Get the current sheet layout (or null for unused)
        const layout = currentSheet < optimizationResults.layouts.length ? optimizationResults.layouts[currentSheet] : null;
        
        if (!layout) {
            drawEmptySheet(true);
            return;
        }
        
        if (layout.parts.length === 0) {
            drawEmptySheet();
            return;
        }
        
        // Use layout-specific dimensions if available (for remnants)
        const sheetWidth = layout.sheetWidth || currentMaterial.width;
        const sheetHeight = layout.sheetHeight || currentMaterial.length;
        
        // Calculate scale to maintain aspect ratio
        const scale = Math.min(width / sheetWidth, height / sheetHeight);
        const drawingWidth = sheetWidth * scale;
        const drawingHeight = sheetHeight * scale;
        const xOffset = (width - drawingWidth) / 2;
        const yOffset = (height - drawingHeight) / 2;
        
        // Draw sheet background
        ctx.fillStyle = '#e9ecef';
        ctx.fillRect(xOffset, yOffset, drawingWidth, drawingHeight);
        
        // Draw sheet border
        ctx.strokeStyle = '#adb5bd';
        ctx.lineWidth = 2;
        ctx.strokeRect(xOffset, yOffset, drawingWidth, drawingHeight);
        
        // Draw sheet label
        ctx.fillStyle = '#6c757d';
        ctx.font = '14px Arial';
        const labelText = layout.isRemnant ? `Remnant from ${layout.sheet} - ${sheetWidth} × ${sheetHeight} cm` : `Sheet ${currentSheet + 1} - ${sheetWidth} × ${sheetHeight} cm`;
        ctx.fillText(labelText, 10, 20);
        
        // Draw parts with 3D-like shadows
        layout.parts.forEach(part => {
            const x = xOffset + (part.x * scale);
            const y = yOffset + (part.y * scale);
            const partWidth = part.width * scale;
            const partHeight = part.height * scale;
            
            // Add shadow for 3D effect
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 5;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            
            // Draw part
            ctx.fillStyle = part.color || '#3498db';
            ctx.fillRect(x, y, partWidth, partHeight);
            
            // Reset shadow for borders
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            // Draw part border
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, partWidth, partHeight);
            
            // Draw part ID
            ctx.fillStyle = 'white';
            ctx.font = '12px Arial';
            ctx.fillText(part.id, x + 5, y + 15);
            
            // Draw part dimensions if there's space
            ctx.font = (part.width > 60 && part.height > 30) ? '12px Arial' : '10px Arial';
            ctx.fillText(`${part.width}×${part.height}`, x + 5, y + partHeight - 5);
            
            // Draw rotation indicator if part is rotated
            if (part.rotated) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.font = '10px Arial';
                ctx.fillText('Rotated', x + partWidth - 40, y + 15);
            }

            // Draw edge banding visualization
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#f1c40f'; // Yellow for banding
            if (part.edgeBanding.top) {
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + partWidth, y);
                ctx.stroke();
            }
            if (part.edgeBanding.bottom) {
                ctx.beginPath();
                ctx.moveTo(x, y + partHeight);
                ctx.lineTo(x + partWidth, y + partHeight);
                ctx.stroke();
            }
            if (part.edgeBanding.left) {
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x, y + partHeight);
                ctx.stroke();
            }
            if (part.edgeBanding.right) {
                ctx.beginPath();
                ctx.moveTo(x + partWidth, y);
                ctx.lineTo(x + partWidth, y + partHeight);
                ctx.stroke();
            }
        });
        
        // Draw cut lines (segmented for less clutter)
        ctx.strokeStyle = '#8b4513';  // Brown for cuts
        ctx.lineWidth = 1;  // Thinner for clarity
        ctx.setLineDash([]);  // Solid lines (remove this line if you prefer dashed: ctx.setLineDash([5, 5]); )

        // Vertical cuts (segmented)
        layout.verticalCuts.forEach(cut => {
            cut.segments.forEach(([start, end]) => {
                ctx.beginPath();
                ctx.moveTo(xOffset + cut.position * scale, yOffset + start * scale);
                ctx.lineTo(xOffset + cut.position * scale, yOffset + end * scale);
                ctx.stroke();
            });
        });

        // Horizontal cuts (segmented, but often full anyway)
        layout.horizontalCuts.forEach(cut => {
            cut.segments.forEach(([start, end]) => {
                ctx.beginPath();
                ctx.moveTo(xOffset + start * scale, yOffset + cut.position * scale);
                ctx.lineTo(xOffset + end * scale, yOffset + cut.position * scale);
                ctx.stroke();
            });
        });
        
        // Reset line dash
        ctx.setLineDash([]);
        
        // Add labels for major/boundary cuts (less clutter)
        ctx.fillStyle = '#000000';
        ctx.font = '10px Arial';
        // Vertical boundary labels (full height)
        const verticalBoundaries = layout.verticalCuts.filter(cut => cut.position === currentMaterial.edgeOffset || cut.position === sheetWidth - currentMaterial.edgeOffset);
        verticalBoundaries.forEach(cut => {
            ctx.save();
            ctx.translate(xOffset + cut.position * scale + 5, (yOffset + (sheetHeight * scale) / 2));
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(`${sheetHeight} cm`, 0, 0);
            ctx.restore();
        });
        // Horizontal boundary labels (full width)
        const horizontalBoundaries = layout.horizontalCuts.filter(cut => cut.position === currentMaterial.edgeOffset || cut.position === sheetHeight - currentMaterial.edgeOffset);
        horizontalBoundaries.forEach(cut => {
            ctx.fillText(`${sheetWidth} cm`, xOffset + (drawingWidth / 2) - 20, yOffset + cut.position * scale - 5);
        });
        
        // Draw hovered part details if any
        if (hoveredPart !== null) {
            const part = layout.parts[hoveredPart];
            const x = xOffset + (part.x * scale);
            const y = yOffset + (part.y * scale);
            const w = part.width * scale;
            const h = part.height * scale;
            
            // Highlight border
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, w, h);
            
            // Draw detailed dimension lines
            const dimOffset = 10;
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 1;
            
            // Width (bottom)
            ctx.beginPath();
            ctx.moveTo(x, y + h + dimOffset);
            ctx.lineTo(x, y + h + dimOffset + 5);
            ctx.moveTo(x + w, y + h + dimOffset);
            ctx.lineTo(x + w, y + h + dimOffset + 5);
            ctx.moveTo(x, y + h + dimOffset);
            ctx.lineTo(x + w, y + h + dimOffset);
            ctx.stroke();
            ctx.fillStyle = 'black';
            ctx.font = '12px Arial';
            ctx.fillText(`${part.width} cm`, x + (w / 2) - 20, y + h + dimOffset + 15);
            
            // Height (left)
            ctx.beginPath();
            ctx.moveTo(x - dimOffset, y);
            ctx.lineTo(x - dimOffset - 5, y);
            ctx.moveTo(x - dimOffset, y + h);
            ctx.lineTo(x - dimOffset - 5, y + h);
            ctx.moveTo(x - dimOffset, y);
            ctx.lineTo(x - dimOffset, y + h);
            ctx.stroke();
            ctx.save();
            ctx.translate(x - dimOffset - 15, y + (h / 2));
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(`${part.height} cm`, 0, 0);
            ctx.restore();
        }
    }
    
    // Helper to adjust color lightness
    function adjustColor(color, factor) {
        if (color.startsWith('rgb')) {
            const [r, g, b] = color.match(/\d+/g).map(Number);
            return `rgb(${Math.min(255, r * factor)}, ${Math.min(255, g * factor)}, ${Math.min(255, b * factor)})`;
        }
        // Assume hex
        const r = parseInt(color.slice(1,3),16) * factor;
        const g = parseInt(color.slice(3,5),16) * factor;
        const b = parseInt(color.slice(5,7),16) * factor;
        return `rgb(${Math.min(255, Math.floor(r))}, ${Math.min(255, Math.floor(g))}, ${Math.min(255, Math.floor(b))})`;
    }
    
    // Interactive hover for cut lines and parts
    canvas.addEventListener('mousemove', (e) => {
        if (currentTab !== 'layout' || !optimizationResults || !optimizationResults.layouts[currentSheet]) return;
        
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        hoveredLine = null;
        hoveredPart = null;
        
        const layout = optimizationResults.layouts[currentSheet];
        const sheetWidth = layout.sheetWidth || currentMaterial.width;
        const sheetHeight = layout.sheetHeight || currentMaterial.length;
        const scale = Math.min(canvas.width / sheetWidth, canvas.height / sheetHeight);
        const xOffset = (canvas.width - sheetWidth * scale) / 2;
        const yOffset = (canvas.height - sheetHeight * scale) / 2;
        
        // Combined cuts for hover (using positions only)
        layout.verticalCuts.forEach((cut, index) => {
            const pos = xOffset + (cut.position * scale);
            if (Math.abs(mouseX - pos) < 5 && mouseY > yOffset && mouseY < yOffset + sheetHeight * scale) {
                hoveredLine = `v${index}`;
            }
        });
        
        layout.horizontalCuts.forEach((cut, index) => {
            const pos = yOffset + (cut.position * scale);
            if (Math.abs(mouseY - pos) < 5 && mouseX > xOffset && mouseX < xOffset + sheetWidth * scale) {
                hoveredLine = `h${index}`;
            }
        });
        
        // Check parts
        layout.parts.forEach((part, pIndex) => {
            const x = xOffset + (part.x * scale);
            const y = yOffset + (part.y * scale);
            const w = part.width * scale;
            const h = part.height * scale;
            if (mouseX > x && mouseX < x + w && mouseY > y && mouseY < y + h) {
                hoveredPart = pIndex;
            }
        });
        
        if (hoveredLine !== null || hoveredPart !== null) {
            canvas.style.cursor = 'pointer';
            drawCuttingLayout();
            if (hoveredLine !== null) {
                const isVertical = hoveredLine.startsWith('v');
                const index = parseInt(hoveredLine.slice(1));
                const cut = isVertical ? layout.verticalCuts[index] : layout.horizontalCuts[index];
                showNotification(`Cut line: ${cut.position} cm`, 'info');
            } else if (hoveredPart !== null) {
                const part = layout.parts[hoveredPart];
                showNotification(`${part.name || 'Part'} (${part.id}): ${part.width} × ${part.height} cm ${part.rotated ? '(Rotated)' : ''} - Edge Banding: ${Object.keys(part.edgeBanding).filter(k => part.edgeBanding[k]).join(', ') || 'None'}`, 'info');
            }
        } else {
            canvas.style.cursor = 'default';
            drawCuttingLayout();
        }
    });
    
    function drawEmptySheet(unused = false) {
        const width = canvas.width;
        const height = canvas.height;
        ctx.fillStyle = '#e9ecef';
        ctx.fillRect(0, 0, width, height);
        
        ctx.strokeStyle = '#adb5bd';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, width, height);
        
        ctx.fillStyle = '#6c757d';
        ctx.font = '14px Arial';
        const text = unused ? `Sheet ${currentSheet + 1} of ${currentMaterial.quantity} (Unused)` : 'No parts placed on this sheet';
        ctx.fillText(text, width/2 - 80, height/2);
    }
    
    function showCuttingPlan() {
        const fragment = document.createDocumentFragment();
        const h3 = document.createElement('h3');
        h3.textContent = 'Cutting Plan';
        fragment.appendChild(h3);
        
        if (!optimizationResults || !optimizationResults.cuttingPlan) {
            const p = document.createElement('p');
            p.textContent = 'No data available.';
            fragment.appendChild(p);
        } else {
            optimizationResults.cuttingPlan.forEach((step, index) => {
                const stepEl = document.createElement('div');
                stepEl.className = 'cut-step';
                stepEl.innerHTML = `
                    <strong>Step ${index + 1}:</strong> Cut at ${step.position} cm 
                    along the ${step.direction} 
                    (${step.type} cut)
                `;
                fragment.appendChild(stepEl);
            });
        }
        cuttingPlanContainer.innerHTML = '';
        cuttingPlanContainer.appendChild(fragment);
    }
    
    function showRemnants() {
        const fragment = document.createDocumentFragment();
        const h3 = document.createElement('h3');
        h3.textContent = 'Remnant Pieces';
        fragment.appendChild(h3);
        
        if (!optimizationResults || !optimizationResults.remnants) {
            const p = document.createElement('p');
            p.textContent = 'No data available.';
            fragment.appendChild(p);
        } else {
            optimizationResults.remnants.forEach((remnant, index) => {
                const remnantEl = document.createElement('div');
                remnantEl.className = 'cut-step';
                remnantEl.innerHTML = `
                    <strong>Remnant ${index + 1}:</strong> ${remnant.width} × ${remnant.length} cm 
                    (${remnant.area} cm²) - ${remnant.location}
                `;
                fragment.appendChild(remnantEl);
            });
        }
        cuttingPlanContainer.innerHTML = '';
        cuttingPlanContainer.appendChild(fragment);
    }
    
    function showEdgeBanding() {
        const fragment = document.createDocumentFragment();
        const h3 = document.createElement('h3');
        h3.textContent = 'Edge Banding Summary';
        fragment.appendChild(h3);
        
        if (!optimizationResults || !optimizationResults.edgeBandingByPart) {
            const p = document.createElement('p');
            p.textContent = 'No data available.';
            fragment.appendChild(p);
        } else {
            const edgingEl = document.createElement('div');
            edgingEl.innerHTML = `
                <p><strong>Total Edge Banding Required:</strong> ${optimizationResults.edgeBandingTotal} cm</p>
                <p><strong>By Part:</strong></p>
            `;
            
            const list = document.createElement('ul');
            optimizationResults.edgeBandingByPart.forEach(part => {
                const item = document.createElement('li');
                item.textContent = `${part.part}: ${part.edging} cm (${part.sides.join(', ')})`;
                list.appendChild(item);
            });
            
            edgingEl.appendChild(list);
            fragment.appendChild(edgingEl);
        }
        cuttingPlanContainer.innerHTML = '';
        cuttingPlanContainer.appendChild(fragment);
    }
    
    // Step navigation
    function updateSteps() {
        currentStep = Math.max(1, Math.min(5, currentStep));
        steps.forEach(step => {
            const stepNum = parseInt(step.dataset.step);
            step.classList.remove('active', 'completed');
            
            if (stepNum === currentStep) {
                step.classList.add('active');
            } else if (stepNum < currentStep) {
                step.classList.add('completed');
            }
        });
        
        stepContents.forEach(content => {
            content.classList.remove('active');
            if (parseInt(content.dataset.step) === currentStep) {
                content.classList.add('active');
                
                // Update optimization summary when reaching step 4
                if (currentStep === 4) {
                    updateOptimizationSummary();
                }
            }
        });
    }
    
    function updateOptimizationSummary() {
        const material = initMaterialStock();
        const partCount = partsList.length;
        const uniqueSizes = new Set(partsList.map(p => `${p.width}x${p.length}`)).size;
        
        optimizationSummary.innerHTML = `
            <p><strong>Material:</strong> ${material.type} (${material.thickness}cm thick)</p>
            <p><strong>Sheet Size:</strong> ${material.width} × ${material.length} cm</p>
            <p><strong>Sheets Available:</strong> ${material.quantity}</p>
            <p><strong>Total Parts:</strong> ${partCount} (${uniqueSizes} unique sizes)</p>
            <p><strong>Cutting Method:</strong> ${getSelectText('cutting-method')}</p>
            <p><strong>Remnant Usage:</strong> ${getSelectText('remnant-usage')}</p>
        `;
    }
    
    function getSelectText(id) {
        const select = document.getElementById(id);
        return select.options[select.selectedIndex].text;
    }
    
    function initMaterialStock() {
        return {
            type: document.getElementById('sheet-type').value,
            thickness: parseFloat(document.getElementById('thickness').value),
            width: parseFloat(document.getElementById('sheet-width').value),
            length: parseFloat(document.getElementById('sheet-length').value),
            quantity: parseInt(document.getElementById('sheet-quantity').value),
            kerf: parseFloat(document.getElementById('kerf').value),
            edgeOffset: parseFloat(document.getElementById('edge-offset').value),
            hasGrain: document.getElementById('has-grain').checked
        };
    }
    
    // Event listeners for navigation
    nextButtons.forEach(button => {
        button.addEventListener('click', function() {
            if (validateStep(currentStep)) {
                currentStep++;
                updateSteps();
            }
        });
    });
    
    prevButtons.forEach(button => {
        button.addEventListener('click', function() {
            currentStep--;
            updateSteps();
        });
    });
    
    function validateStep(step) {
        let isValid = true;
        clearErrors();
        try {
            switch(step) {
                case 1:
                    // Validate material inputs
                    const width = parseFloat(document.getElementById('sheet-width').value);
                    const length = parseFloat(document.getElementById('sheet-length').value);
                    const quantity = parseInt(document.getElementById('sheet-quantity').value);
                    const thickness = parseFloat(document.getElementById('thickness').value);
                    const kerf = parseFloat(document.getElementById('kerf').value);
                    const edgeOffset = parseFloat(document.getElementById('edge-offset').value);
                    
                    if (isNaN(thickness) || thickness <= 0) {
                        showError('thickness-error', 'Thickness must be greater than 0');
                        isValid = false;
                    }
                    if (isNaN(width) || width <= 0) {
                        showError('sheet-width-error', 'Width must be greater than 0');
                        isValid = false;
                    }
                    if (isNaN(length) || length <= 0) {
                        showError('sheet-length-error', 'Length must be greater than 0');
                        isValid = false;
                    }
                    if (isNaN(quantity) || quantity <= 0) {
                        showError('sheet-quantity-error', 'Quantity must be at least 1');
                        isValid = false;
                    }
                    if (isNaN(kerf) || kerf < 0) {
                        showError('kerf-error', 'Kerf must be non-negative');
                        isValid = false;
                    }
                    if (isNaN(edgeOffset) || edgeOffset < 0) {
                        showError('edge-offset-error', 'Edge offset must be non-negative');
                        isValid = false;
                    }
                    if (isValid) {
                        currentMaterial = initMaterialStock();
                        saveToLocalStorage();
                    }
                    return isValid;
                    
                case 2:
                    // Validate parts list
                    if (partsList.length === 0) {
                        showNotification('Please add at least one part to continue.', 'error');
                        isValid = false;
                    }
                    return isValid;
                    
                default:
                    return true;
            }
        } catch (error) {
            showNotification('An unexpected error occurred during validation.', 'error');
            console.error(error);
            return false;
        }
    }
    
    function showError(id, message) {
        const err = document.getElementById(id);
        err.textContent = message;
        err.classList.add('show');
    }
    
    function clearErrors() {
        const errors = document.querySelectorAll('.error-message');
        errors.forEach(err => {
            err.textContent = '';
            err.classList.remove('show');
        });
    }
    
    // Add part functionality
    addPartBtn.addEventListener('click', function() {
        clearErrors();
        let isValid = true;
        const name = document.getElementById('part-name').value || `Part ${partsList.length + 1}`;
        const quantity = parseInt(document.getElementById('part-quantity').value);
        const width = parseFloat(document.getElementById('part-width').value);
        const length = parseFloat(document.getElementById('part-length').value);
        const rotationAllowed = document.getElementById('rotation-allowed').checked;
        const grainDirection = document.getElementById('grain-direction').checked;
        
        // Get edge banding selections
        const edgeTop = document.getElementById('edge-top').checked;
        const edgeBottom = document.getElementById('edge-bottom').checked;
        const edgeLeft = document.getElementById('edge-left').checked;
        const edgeRight = document.getElementById('edge-right').checked;
        
        if (isNaN(quantity) || quantity <= 0) {
            showError('part-quantity-error', 'Quantity must be at least 1');
            isValid = false;
        }
        if (isNaN(width) || width <= 0) {
            showError('part-width-error', 'Width must be greater than 0');
            isValid = false;
        }
        if (isNaN(length) || length <= 0) {
            showError('part-length-error', 'Length must be greater than 0');
            isValid = false;
        }
        
        if (!isValid) return;
        
        // Check if part fits in the sheet (considering possible rotation)
        const maxSheetDim = Math.max(currentMaterial.width, currentMaterial.length);
        const minSheetDim = Math.min(currentMaterial.width, currentMaterial.length);
        let maxPartDim = Math.max(width, length);
        let minPartDim = Math.min(width, length);
        let canFit = maxPartDim <= maxSheetDim && minPartDim <= minSheetDim;
        if (rotationAllowed && !canFit) {
            maxPartDim = Math.max(length, width);
            minPartDim = Math.min(length, width);
            canFit = maxPartDim <= maxSheetDim && minPartDim <= minSheetDim;
        }
        if (!canFit) {
            showConfirm('This part is larger than your sheet dimensions even with rotation. Are you sure you want to add it?', (confirmed) => {
                if (!confirmed) return;
                addThePart();
            });
        } else {
            addThePart();
        }
        
        function addThePart() {
            try {
                const part = {
                    id: partsList.length + 1,
                    name,
                    width,
                    length,
                    quantity,
                    rotationAllowed,
                    grainDirection,
                    edgeBanding: {
                        top: edgeTop,
                        bottom: edgeBottom,
                        left: edgeLeft,
                        right: edgeRight
                    },
                    color: `hsl(${Math.random() * 360}, 70%, 65%)`
                };
                
                // Add to history for undo
                history.push({ action: 'add', part });
                
                // Add the part multiple times based on quantity
                for (let i = 0; i < quantity; i++) {
                    partsList.push({...part, id: `${part.id}-${i+1}`});
                }
                
                updatePartsList();
                saveToLocalStorage();
                
                // Reset the form
                resetPartForm();
            } catch (error) {
                showNotification('Error adding part.', 'error');
                console.error(error);
            }
        }
    });
    
    function resetPartForm() {
        document.getElementById('part-name').value = '';
        document.getElementById('part-quantity').value = '1';
        document.getElementById('part-length').value = '';
        document.getElementById('part-width').value = '';
        document.getElementById('rotation-allowed').checked = true;
        document.getElementById('grain-direction').checked = false;
        document.getElementById('edge-top').checked = false;
        document.getElementById('edge-bottom').checked = false;
        document.getElementById('edge-left').checked = false;
        document.getElementById('edge-right').checked = false;
    }
    
    function updatePartsList() {
        partsListContainer.innerHTML = '';
        
        // Group parts for display
        const partGroups = {};
        partsList.forEach(part => {
            const key = `${part.name}x${part.width}x${part.length}x${part.rotationAllowed}x${part.grainDirection}x${JSON.stringify(part.edgeBanding)}`;
            if (!partGroups[key]) {
                partGroups[key] = {
                    name: part.name,
                    width: part.width,
                    length: part.length,
                    count: 0,
                    rotationAllowed: part.rotationAllowed,
                    grainDirection: part.grainDirection,
                    edgeBanding: part.edgeBanding
                };
            }
            partGroups[key].count++;
        });
        
        Object.values(partGroups).forEach(group => {
            const partItem = document.createElement('div');
            partItem.className = 'part-item';
            
            const edgeBandingSides = [];
            if (group.edgeBanding.top) edgeBandingSides.push('Top');
            if (group.edgeBanding.bottom) edgeBandingSides.push('Bottom');
            if (group.edgeBanding.left) edgeBandingSides.push('Left');
            if (group.edgeBanding.right) edgeBandingSides.push('Right');
            
            partItem.innerHTML = `
                <div>
                    <strong>${group.name || 'Part'}</strong>
                    <div>${group.width} × ${group.length} cm (Qty: ${group.count})</div>
                    <div style="font-size: 0.8rem; color: #666;">
                        ${group.rotationAllowed ? 'Rotation allowed' : 'No rotation'} | 
                        ${group.grainDirection ? 'Fixed grain' : 'No grain constraint'} | 
                        ${edgeBandingSides.length > 0 ? 'Edging: ' + edgeBandingSides.join(', ') : 'No edging'}
                    </div>
                </div>
                <div class="part-actions">
                    <button class="action-btn edit-btn"><i class="fas fa-edit"></i></button>
                    <button class="action-btn delete-btn"><i class="fas fa-trash"></i></button>
                </div>
            `;
            
            // Add delete functionality
            const deleteBtn = partItem.querySelector('.delete-btn');
            deleteBtn.addEventListener('click', function() {
                showConfirm('Are you sure you want to delete this part group?', (confirmed) => {
                    if (!confirmed) return;
                    history.push({ action: 'delete', group });
                    partsList = partsList.filter(p => 
                        !(p.width === group.width && p.length === group.length &&
                          p.rotationAllowed === group.rotationAllowed &&
                          p.grainDirection === group.grainDirection &&
                          JSON.stringify(p.edgeBanding) === JSON.stringify(group.edgeBanding))
                    );
                    updatePartsList();
                    saveToLocalStorage();
                });
            });
            
            // Edit functionality
            const editBtn = partItem.querySelector('.edit-btn');
            editBtn.addEventListener('click', function() {
                // Fill form with group data
                document.getElementById('part-name').value = group.name;
                document.getElementById('part-quantity').value = group.count;
                document.getElementById('part-length').value = group.length;
                document.getElementById('part-width').value = group.width;
                document.getElementById('rotation-allowed').checked = group.rotationAllowed;
                document.getElementById('grain-direction').checked = group.grainDirection;
                document.getElementById('edge-top').checked = group.edgeBanding.top;
                document.getElementById('edge-bottom').checked = group.edgeBanding.bottom;
                document.getElementById('edge-left').checked = group.edgeBanding.left;
                document.getElementById('edge-right').checked = group.edgeBanding.right;
                
                // Remove old group
                partsList = partsList.filter(p => 
                    !(p.width === group.width && p.length === group.length &&
                      p.rotationAllowed === group.rotationAllowed &&
                      p.grainDirection === group.grainDirection &&
                      JSON.stringify(p.edgeBanding) === JSON.stringify(group.edgeBanding))
                );
                updatePartsList();
                showNotification('Edit the part and add again.', 'info');
            });
            
            partsListContainer.appendChild(partItem);
        });
    }
    
    // Helper function for segmented cuts
    function addSegment(map, pos, start, end) {
        if (!map.has(pos)) {
            map.set(pos, []);
        }
        let segments = map.get(pos);
        segments.push([start, end]);
        // Sort and merge overlapping segments to avoid redundant drawing
        segments.sort((a, b) => a[0] - b[0]);
        let merged = [];
        for (let seg of segments) {
            if (merged.length === 0 || merged[merged.length - 1][1] < seg[0]) {
                merged.push(seg);
            } else {
                merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], seg[1]);
            }
        }
        map.set(pos, merged);
    }
    
    // Reusable function for placing parts on a sheet or remnant
    function placeParts(sheetId, remainingParts, sheetWidth, sheetHeight, offset, kerf, respectGrain) {
        const usableWidth = sheetWidth - 2 * offset;
        const usableLength = sheetHeight - 2 * offset;
        const layout = { sheet: sheetId, parts: [], verticalCuts: [], horizontalCuts: [], sheetWidth, sheetHeight, maxX: 0, maxY: 0, isRemnant: (offset === 0) };
        
        const verticalCuts = new Map();
        const horizontalCuts = new Map();
        
        // Add sheet boundaries as full segments (optional: comment out if you don't want boundary lines as "cuts")
        addSegment(verticalCuts, offset, offset, sheetHeight - offset);
        addSegment(verticalCuts, sheetWidth - offset, offset, sheetHeight - offset);
        addSegment(horizontalCuts, offset, offset, sheetWidth - offset);
        addSegment(horizontalCuts, sheetHeight - offset, offset, sheetWidth - offset);
        
        const shelves = [];
        let candidates = [...remainingParts];
        // Improved sorting: by area descending for better packing efficiency
        candidates.sort((a, b) => (b.width * b.length) - (a.width * a.length));
        
        let i = 0;
        while (i < candidates.length) {
            let part = candidates[i];
            let rotated = false;
            let partWidth = part.width;
            let partHeight = part.length;
            
            if (part.rotationAllowed && (!respectGrain || !part.grainDirection)) {
                const regularFits = findShelfForPart(shelves, part.width, part.length, usableWidth, kerf);
                const rotatedFits = findShelfForPart(shelves, part.length, part.width, usableWidth, kerf);
                if (rotatedFits && !regularFits) {
                    rotated = true;
                    [partWidth, partHeight] = [part.length, part.width];
                } else if (regularFits && rotatedFits && (part.length > part.width)) {
                    rotated = true;
                    [partWidth, partHeight] = [part.length, part.width];
                }
            }
            
            let placed = false;
            for (let shelf of shelves) {
                if (partHeight <= shelf.height && shelf.currentX + partWidth + kerf <= usableWidth) {
                    layout.parts.push({
                        ...part,
                        x: shelf.currentX + offset,
                        y: shelf.y,
                        width: partWidth,
                        height: partHeight,
                        rotated
                    });
                    shelf.currentX += partWidth + kerf;
                    layout.maxX = Math.max(layout.maxX, shelf.currentX);
                    layout.maxY = Math.max(layout.maxY, shelf.y + shelf.height);
                    placed = true;
                    break;
                }
            }
            
            if (!placed) {
                const newY = shelves.length > 0 ? shelves[shelves.length - 1].y + shelves[shelves.length - 1].height + kerf : offset;
                if (newY + partHeight > usableLength + offset) {
                    i++;
                    continue;
                }
                const newShelf = { y: newY, height: partHeight, currentX: 0 };
                shelves.push(newShelf);
                layout.parts.push({
                    ...part,
                    x: newShelf.currentX + offset,
                    y: newShelf.y,
                    width: partWidth,
                    height: partHeight,
                    rotated
                });
                newShelf.currentX += partWidth + kerf;
                layout.maxX = Math.max(layout.maxX, newShelf.currentX);
                layout.maxY = Math.max(layout.maxY, newShelf.y + newShelf.height);
                placed = true;
            }
            
            if (placed) {
                // Add segments for this part's edges
                addSegment(verticalCuts, layout.parts[layout.parts.length - 1].x, layout.parts[layout.parts.length - 1].y, layout.parts[layout.parts.length - 1].y + partHeight);
                addSegment(verticalCuts, layout.parts[layout.parts.length - 1].x + partWidth, layout.parts[layout.parts.length - 1].y, layout.parts[layout.parts.length - 1].y + partHeight);
                addSegment(horizontalCuts, layout.parts[layout.parts.length - 1].y, layout.parts[layout.parts.length - 1].x, layout.parts[layout.parts.length - 1].x + partWidth);
                addSegment(horizontalCuts, layout.parts[layout.parts.length - 1].y + partHeight, layout.parts[layout.parts.length - 1].x, layout.parts[layout.parts.length - 1].x + partWidth);
                
                const origIndex = remainingParts.findIndex(p => p.id === part.id);
                remainingParts.splice(origIndex, 1);
                candidates.splice(i, 1);
            } else {
                i++;
            }
        }
        
        // Store the cuts as arrays of {position, segments}
        layout.verticalCuts = Array.from(verticalCuts.entries()).map(([position, segments]) => ({position, segments}));
        layout.horizontalCuts = Array.from(horizontalCuts.entries()).map(([position, segments]) => ({position, segments}));
        
        return layout;
    }
    
    // Run optimization
    runOptimizationBtn.addEventListener('click', function() {
        runOptimizationBtn.disabled = true;
        runOptimizationBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Optimizing...';
        
        setTimeout(() => {
            try {
                optimizationResults = generateMockResults();
                updateSheetNavigation();
                updateResultsDisplay();
                updateCuttingSummary();
                currentStep = 5;
                updateSteps();
                updateTabContent();
                showNotification('Optimization completed.', 'success');
            } catch (error) {
                showNotification('Error during optimization.', 'error');
                console.error(error);
            } finally {
                runOptimizationBtn.innerHTML = '<i class="fas fa-bolt"></i> Run Optimization';
                runOptimizationBtn.disabled = false;
            }
        }, 1500);
    });
    
    function generateMockResults() {
        if (partsList.length === 0) {
            return {
                minEstimatedSheets: 0,
                availableSheets: 0,
                sheetsUsed: 0,
                materialUsage: 0,
                totalCuts: 0,
                edgeBandingTotal: 0,
                edgeBandingByPart: [],
                layouts: [],
                cuttingPlan: [],
                remnants: [],
                waste: 0
            };
        }

        const remnantUsage = document.getElementById('remnant-usage').value;
        const minimizeWaste = document.getElementById('minimize-waste').checked;
        const respectGrain = document.getElementById('grain-direction-pref').checked;
        const kerf = currentMaterial.kerf;
        const offset = currentMaterial.edgeOffset;
        const availableSheets = currentMaterial.quantity;
        
        const usedArea = partsList.reduce((sum, part) => sum + (part.width * part.length), 0);
        const sheetArea = (currentMaterial.width - 2 * offset) * (currentMaterial.length - 2 * offset);
        const minEstimatedSheets = Math.ceil(usedArea / sheetArea);
        
        const layouts = [];
        let remainingParts = [...partsList];
        let sheetIndex = 1;
        
        while (remainingParts.length > 0 && sheetIndex <= availableSheets) {
            const layout = placeParts(`Sheet ${sheetIndex}`, remainingParts, currentMaterial.width, currentMaterial.length, offset, kerf, respectGrain);
            if (layout.parts.length > 0) {
                layouts.push(layout);
            }
            sheetIndex++;
        }
        
        const sheetsUsed = layouts.length;
        
        if (remainingParts.length > 0) {
            showNotification(`Some parts (${remainingParts.length}) could not be placed on available sheets.`, 'warning');
        }
        
        // Calculate remnants
        let remnants = [];
        layouts.forEach((layout, index) => {
            const remnantHeight = layout.sheetHeight - layout.maxY - kerf;
            if (remnantHeight > 0) {
                remnants.push({
                    width: layout.sheetWidth - 2 * offset,
                    length: remnantHeight,
                    area: (layout.sheetWidth - 2 * offset) * remnantHeight,
                    location: layout.sheet + ' bottom'
                });
            }
            const remnantWidth = layout.sheetWidth - layout.maxX - kerf;
            if (remnantWidth > 0) {
                remnants.push({
                    width: remnantWidth,
                    length: layout.maxY - offset,
                    area: remnantWidth * (layout.maxY - offset),
                    location: layout.sheet + ' right'
                });
            }
        });
        
        // Use remnants for remaining parts if enabled
        if (remnantUsage !== 'none' && remainingParts.length > 0) {
            remnants.sort((a, b) => b.area - a.area);
            for (let rem of remnants) {
                if (rem.area < 100) continue; // Skip tiny remnants for efficiency
                let candidates = [...remainingParts];
                if (remnantUsage === 'similar') {
                    candidates = candidates.filter(p => {
                        const pArea = p.width * p.length;
                        const pMax = Math.max(p.width, p.length);
                        const rMax = Math.max(rem.width, rem.length);
                        return pArea <= rem.area * 0.8 && pMax <= rMax;
                    });
                }
                if (candidates.length > 0) {
                    const remOffset = 0; // No edge offset for remnants to maximize space
                    const remLayout = placeParts(rem.location, candidates, rem.width, rem.length, remOffset, kerf, respectGrain);
                    if (remLayout.parts.length > 0) {
                        layouts.push(remLayout);
                    }
                }
            }
        }
        
        const totalAvailableArea = sheetArea * sheetsUsed;
        const usagePercentage = totalAvailableArea > 0 ? Math.round((usedArea / totalAvailableArea) * 100) : 0;
        const waste = 100 - usagePercentage;
        
        const cuttingPlan = layouts.flatMap(layout => {
            const vertical = layout.verticalCuts.map(cut => ({
                direction: 'vertical',
                position: cut.position,
                type: 'guillotine'
            }));
            const horizontal = layout.horizontalCuts.map(cut => ({
                direction: 'horizontal',
                position: cut.position,
                type: 'guillotine'
            }));
            return [...vertical, ...horizontal];
        });
        
        let edgeBandingTotal = 0;
        const edgeBandingByPart = [];
        
        partsList.forEach(part => {
            let edging = 0;
            const sides = [];
            let topBottomLength = part.width;
            let leftRightLength = part.length;
            
            const placedPart = layouts.flatMap(l => l.parts).find(p => p.id === part.id);
            let adjustedBanding = { ...part.edgeBanding };
            if (placedPart && placedPart.rotated) {
                [topBottomLength, leftRightLength] = [leftRightLength, topBottomLength];
                adjustedBanding = {
                    top: part.edgeBanding.left,
                    right: part.edgeBanding.top,
                    bottom: part.edgeBanding.right,
                    left: part.edgeBanding.bottom
                };
            }
            
            if (adjustedBanding.top) {
                edging += topBottomLength;
                sides.push('Top');
            }
            if (adjustedBanding.bottom) {
                edging += topBottomLength;
                sides.push('Bottom');
            }
            if (adjustedBanding.left) {
                edging += leftRightLength;
                sides.push('Left');
            }
            if (adjustedBanding.right) {
                edging += leftRightLength;
                sides.push('Right');
            }
            
            edgeBandingTotal += edging;
            edgeBandingByPart.push({
                part: part.name || `Part ${part.id}`,
                edging,
                sides
            });
        });
        
        const totalCuts = cuttingPlan.length;
        const maxCuts = partsList.length * 4; // Arbitrary max for scale
        const maxEdging = edgeBandingTotal * 1.5; // Arbitrary for scale
        
        return {
            minEstimatedSheets,
            availableSheets,
            sheetsUsed,
            materialUsage: usagePercentage,
            totalCuts,
            edgeBandingTotal,
            edgeBandingByPart,
            layouts,
            cuttingPlan,
            remnants,
            waste,
            maxCuts,
            maxEdging,
            usedArea,
            sheetArea,
            totalAvailableArea
        };
    }
    
    function findShelfForPart(shelves, width, height, usableWidth, kerf) {
        for (let shelf of shelves) {
            if (height <= shelf.height && shelf.currentX + width + kerf <= usableWidth) {
                return true;
            }
        }
        return false;
    }
    
    // Update results display
    function updateResultsDisplay() {
        if (!optimizationResults) return;
        document.getElementById('stat-sheets').textContent = `${optimizationResults.sheetsUsed}/${optimizationResults.availableSheets}`;
        document.getElementById('stat-usage').textContent = `${optimizationResults.materialUsage}%`;
        document.getElementById('stat-cuts').textContent = optimizationResults.totalCuts;
        document.getElementById('stat-edging').textContent = `${optimizationResults.edgeBandingTotal} cm`;
        
        document.getElementById('waste-sheets').style.width = `${(optimizationResults.sheetsUsed / optimizationResults.availableSheets) * 100}%`;
        document.getElementById('waste-usage').style.width = `${optimizationResults.materialUsage}%`;
        document.getElementById('waste-cuts').style.width = `${(optimizationResults.totalCuts / optimizationResults.maxCuts) * 100}%`;
        document.getElementById('waste-edging').style.width = `${(optimizationResults.edgeBandingTotal / optimizationResults.maxEdging) * 100}%`;
    }
    
    function updateCuttingSummary() {
        if (!optimizationResults) return;
        const summary = document.createDocumentFragment();
        const h3 = document.createElement('h3');
        h3.textContent = 'Cutting Summary';
        summary.appendChild(h3);
        const p1 = document.createElement('p');
        p1.textContent = `Total sheets used: ${optimizationResults.sheetsUsed} out of ${optimizationResults.availableSheets} available (estimated minimum based on area: ${optimizationResults.minEstimatedSheets})`;
        summary.appendChild(p1);
        const p2 = document.createElement('p');
        p2.textContent = `Material usage: ${optimizationResults.materialUsage}% (Waste: ${optimizationResults.waste}%)`;
        summary.appendChild(p2);
        const p3 = document.createElement('p');
        p3.textContent = `Total cuts: ${optimizationResults.totalCuts}`;
        summary.appendChild(p3);
        const p4 = document.createElement('p');
        p4.textContent = `Total edge banding: ${optimizationResults.edgeBandingTotal} cm`;
        summary.appendChild(p4);
        const p5 = document.createElement('p');
        p5.textContent = `Remnants: ${optimizationResults.remnants.length}`;
        summary.appendChild(p5);

        resultsSummary.innerHTML = '';
        resultsSummary.appendChild(summary);
    }
    
    // // Export PDF functionality using jsPDF with improved styling, page breaks, and footers
    exportPdfBtn.addEventListener('click', async function() {
        if (!optimizationResults) {
            showNotification('No optimization results to export.', 'error');
            return;
        }

      const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'mm' }); // Use mm for easier margin handling (A4: 210x297mm)
        const pageWidth = 210;
        const pageHeight = 297;
        const marginLeft = 15;
        const marginTop = 15;
        const marginBottom = 15;
        const marginRight = 15;
        const contentWidth = pageWidth - marginLeft - marginRight;
        let yPos = marginTop;

        // Helper function to check and add new page if needed
        function checkPageBreak(neededHeight) {
            if (yPos + neededHeight > pageHeight - marginBottom) {
                doc.addPage();
                yPos = marginTop;
            }
        }
// Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('Cutting Optimization Report', pageWidth / 2, yPos, { align: 'center' });
        yPos += 12;
        doc.setDrawColor(200, 200, 200);
        doc.line(marginLeft, yPos, pageWidth - marginRight, yPos); // Underline for style
        yPos += 8;

        // Summary Stats
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        checkPageBreak(50); // Approximate height for summary block
        doc.text(`Sheets Used: ${optimizationResults.sheetsUsed}/${optimizationResults.availableSheets}`, marginLeft, yPos);
        yPos += 7;
        doc.text(`Material Usage: ${optimizationResults.materialUsage}% (Waste: ${optimizationResults.waste}%)`, marginLeft, yPos);
        yPos += 7;
        doc.text(`Total Cuts: ${optimizationResults.totalCuts}`, marginLeft, yPos);
        yPos += 7;
        doc.text(`Total Edge Banding: ${optimizationResults.edgeBandingTotal} cm`, marginLeft, yPos);
        yPos += 7;
        doc.text(`Sheet Dimensions: ${currentMaterial.width} x ${currentMaterial.length} cm`, marginLeft, yPos);
        yPos += 12;

        // Per-sheet layouts with images from canvas
        const originalSheet = currentSheet;
        const imgHeight = 100; // mm, scaled for readability
        const imgWidth = 180; // mm, to fit within content width
        for (let i = 0; i < optimizationResults.layouts.length; i++) {
            checkPageBreak(10 + imgHeight + 10); // Text + image + spacing
            currentSheet = i;
            drawCuttingLayout(); // Redraw for this sheet
            const imgData = canvas.toDataURL('image/png');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.text(optimizationResults.layouts[i].isRemnant ? `Remnant ${i + 1}` : `Sheet ${i + 1}`, marginLeft, yPos);
            yPos += 8;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(12);
            doc.addImage(imgData, 'PNG', marginLeft, yPos, imgWidth, imgHeight);
            yPos += imgHeight + 10;
        }
        currentSheet = originalSheet;
        drawCuttingLayout(); // Restore original view

        // New page for Cutting Plan
        doc.addPage();
        yPos = marginTop;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('Cutting Plan', marginLeft, yPos);
        yPos += 10;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);

        optimizationResults.cuttingPlan.forEach((step, index) => {
            checkPageBreak(7);
            doc.text(`Step ${index + 1}: Cut at ${step.position} cm along ${step.direction}`, marginLeft, yPos);
            yPos += 7;
        });
        yPos += 10;

        // Remnants
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        checkPageBreak(20 + (optimizationResults.remnants.length * 7));
        doc.text('Remnants', marginLeft, yPos);
        yPos += 10;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);

        optimizationResults.remnants.forEach((remnant, index) => {
            checkPageBreak(7);
            doc.text(`Remnant ${index + 1}: ${remnant.width} x ${remnant.length} cm (${remnant.area} cm²) - ${remnant.location}`, marginLeft, yPos);
            yPos += 7;
        });
        yPos += 10;

        // Edge Banding
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        checkPageBreak(20 + (optimizationResults.edgeBandingByPart.length * 7));
        doc.text('Edge Banding', marginLeft, yPos);
        yPos += 10;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);

        optimizationResults.edgeBandingByPart.forEach((part, index) => {
            checkPageBreak(7);
            doc.text(`${part.part}: ${part.edging} cm (${part.sides.join(', ')})`, marginLeft, yPos);
            yPos += 7;
        });

        // Add footers to all pages (page numbers, branding, and date)
        const pages = doc.internal.getNumberOfPages();
        const currentDate = 'September 02, 2025'; // From the query
        for (let i = 1; i <= pages; i++) {
            doc.setPage(i);
            doc.setFontSize(10);
            doc.setTextColor(100, 100, 100); // Gray for subtlety
            doc.text(`Page ${i} of ${pages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
            doc.text('Cutting Optimization Studio © 2025', marginLeft, pageHeight - 10);
            doc.text(`Generated on ${currentDate}`, pageWidth - marginRight - 50, pageHeight - 10);
            doc.setTextColor(0, 0, 0); // Reset to black
        }

        doc.save('cutting_optimization_report.pdf');
        showNotification('PDF exported successfully.', 'success');
    });
    
    // Re-run optimization
    rerunOptimizationBtn.addEventListener('click', function() {
        currentStep = 3;
        updateSteps();
    });
    
    // Sheet navigation
    document.getElementById('prev-sheet').addEventListener('click', () => {
        if (currentSheet > 0) {
            currentSheet--;
            updateSheetIndicator();
            drawCuttingLayout();
        }
    });

    document.getElementById('next-sheet').addEventListener('click', () => {
        if (currentSheet < optimizationResults.layouts.length - 1) {
            currentSheet++;
            updateSheetIndicator();
            drawCuttingLayout();
        }
    });

    function updateSheetNavigation() {
        if (!optimizationResults || !currentMaterial) return;
        const numLayouts = optimizationResults.layouts.length;
        updateSheetIndicator();
        const sheetNav = document.querySelector('.sheet-navigation');
        if (sheetNav) {
            sheetNav.style.display = (numLayouts > 1) ? 'flex' : 'none';
        }
        document.getElementById('prev-sheet').disabled = currentSheet === 0;
        document.getElementById('next-sheet').disabled = currentSheet === numLayouts - 1;
    }

    function updateSheetIndicator() {
        if (!optimizationResults) return;
        sheetIndicator.textContent = `${currentSheet + 1} of ${optimizationResults.layouts.length}`;
    }
    
    // Help button
    helpBtn.addEventListener('click', () => {
        helpModal.style.display = 'flex';
    });
    
    closeHelp.addEventListener('click', () => {
        helpModal.style.display = 'none';
    });
    
    helpModal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            helpModal.style.display = 'none';
        }
    });
    
    // Local storage
    function saveToLocalStorage() {
        localStorage.setItem('partsList', JSON.stringify(partsList));
        localStorage.setItem('currentMaterial', JSON.stringify(currentMaterial));
    }
    
    function loadFromLocalStorage() {
        try {
            const savedParts = localStorage.getItem('partsList');
            const savedMaterial = localStorage.getItem('currentMaterial');
            if (savedParts) {
                partsList = JSON.parse(savedParts);
                updatePartsList();
            }
            if (savedMaterial) {
                currentMaterial = JSON.parse(savedMaterial);
                // Populate form with saved data
                document.getElementById('sheet-type').value = currentMaterial.type;
                document.getElementById('thickness').value = currentMaterial.thickness;
                document.getElementById('sheet-width').value = currentMaterial.width;
                document.getElementById('sheet-length').value = currentMaterial.length;
                document.getElementById('sheet-quantity').value = currentMaterial.quantity;
                document.getElementById('kerf').value = currentMaterial.kerf;
                document.getElementById('edge-offset').value = currentMaterial.edgeOffset;
                document.getElementById('has-grain').checked = currentMaterial.hasGrain;
            }
        } catch (error) {
            console.error('Error loading from localStorage', error);
            // Optionally clear corrupted data
            localStorage.removeItem('partsList');
            localStorage.removeItem('currentMaterial');
        }
    }
    
    // Initialize
    currentMaterial = initMaterialStock();
    updateSteps();
});