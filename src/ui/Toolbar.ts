import { State } from '../core/State';
import { Canvas } from '../core/Canvas';
import { i18n } from '../i18n';

export class Toolbar {
  private state: State;
  private canvas: Canvas;
  private container: HTMLElement;
  private boundClickHandler: (e: MouseEvent) => void;

  constructor(state: State, canvas: Canvas) {
    this.state = state;
    this.canvas = canvas;
    this.container = document.getElementById('toolbar')!;

    // Bind click handler once
    this.boundClickHandler = this.handleClick.bind(this);
    this.container.addEventListener('click', this.boundClickHandler);

    this.render();
    this.bindEvents();

    // Re-render on language change
    i18n.onChange(() => this.render());
  }

  private handleClick(e: MouseEvent): void {
    const button = (e.target as HTMLElement).closest('[data-action]') as HTMLElement;
    if (!button) return;
    const action = button.dataset.action;
    if (action) this.handleAction(action);
  }

  private render(): void {
    const t = i18n.t;

    this.container.innerHTML = `
      <div class="toolbar-logo" title="${t.diagramEditor}">
        <svg viewBox="0 0 32 32" fill="none" width="28" height="28">
          <circle cx="16" cy="16" r="14" fill="url(#toolbarGrad)" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>
          <text x="16" y="21.5" text-anchor="middle" fill="white" font-size="16" font-weight="600" font-family="Arial, sans-serif">D</text>
          <defs>
            <linearGradient id="toolbarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#3a3a5e"/>
              <stop offset="100%" style="stop-color:#2196f3"/>
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div class="toolbar-group">
        <button class="toolbar-btn" data-action="add-zone" title="${t.zone} (Z)">
          <span>${t.zone}</span>
        </button>
        <button class="toolbar-btn" data-action="add-component" title="${t.component} (C)">
          <span>${t.component}</span>
        </button>
        <button class="toolbar-btn" data-action="add-note" title="${t.note} (N)">
          <span>${t.note}</span>
        </button>
        <button class="toolbar-btn" data-action="add-scenario" title="${t.scenario} (S)">
          <span>${t.scenario}</span>
        </button>
      </div>

      <div class="toolbar-group">
        <button class="toolbar-btn ${this.state.currentTool === 'select' ? 'active' : ''}"
                data-action="tool-select" title="${t.select} (V)">
          <span>${t.select}</span>
        </button>
        <button class="toolbar-btn ${this.state.currentTool === 'pan' ? 'active' : ''}"
                data-action="tool-pan" title="${t.pan} (H)">
          <span>${t.pan}</span>
        </button>
        <button class="toolbar-btn ${this.state.arrowEditMode ? 'active' : ''}"
                data-action="toggle-arrow-edit" title="${t.arrowEdit} (A)">
          <span>${t.arrowEdit}</span>
        </button>
      </div>

      <div class="toolbar-group">
        <button class="toolbar-btn" data-action="undo" title="${t.undo} (⌘Z)" ${!this.state.canUndo() ? 'disabled' : ''}>
          <span>${t.undo}</span>
        </button>
        <button class="toolbar-btn" data-action="redo" title="${t.redo} (⌘⇧Z)" ${!this.state.canRedo() ? 'disabled' : ''}>
          <span>${t.redo}</span>
        </button>
      </div>

      <div class="toolbar-group">
        <button class="toolbar-btn ${this.state.gridVisible ? 'active' : ''}"
                data-action="toggle-grid-visible" title="${t.gridShow}">
          <span>${t.gridShow}</span>
        </button>
        <button class="toolbar-btn ${this.state.gridSnap ? 'active' : ''}"
                data-action="toggle-grid-snap" title="${t.gridSnap} (G)">
          <span>${t.gridSnap}</span>
        </button>
      </div>

      <div class="toolbar-spacer"></div>

      <div class="toolbar-group">
        <button class="toolbar-btn" data-action="zoom-out" title="${t.shortcutZoomOutDesc}">
          <span>−</span>
        </button>
        <span class="zoom-display">${Math.round(this.state.zoom * 100)}%</span>
        <button class="toolbar-btn" data-action="zoom-in" title="${t.shortcutZoomInDesc}">
          <span>+</span>
        </button>
        <button class="toolbar-btn" data-action="zoom-reset" title="${t.shortcutZoomResetDesc}">
          <span>100%</span>
        </button>
      </div>

      <div class="toolbar-group">
        <button class="toolbar-btn" data-action="shortcuts" title="${t.shortcuts} (?)">
          <span>?</span>
        </button>
      </div>

      <div class="toolbar-group">
        <button class="toolbar-btn" data-action="export-json" title="${t.json}">
          <span>${t.json}</span>
        </button>
        <button class="toolbar-btn" data-action="import-json" title="${t.import}">
          <span>${t.import}</span>
        </button>
        <div class="export-dropdown">
          <button class="toolbar-btn primary" data-action="toggle-export-menu">
            <span>${t.export}</span>
            <span class="dropdown-arrow">▼</span>
          </button>
          <div class="export-menu" id="export-menu">
            <button class="export-menu-item" data-action="export-png">${t.exportPng}</button>
            <button class="export-menu-item" data-action="export-jpg">${t.exportJpg}</button>
            <button class="export-menu-item" data-action="export-pdf">${t.exportPdf}</button>
          </div>
        </div>
      </div>

      <div class="toolbar-group">
        <button class="toolbar-btn lang-toggle" data-action="toggle-lang" title="${t.language}">
          <span>${i18n.lang === 'ko' ? '한' : 'EN'}</span>
        </button>
      </div>
    `;
  }

  private bindEvents(): void {
    // Update toolbar when state changes
    this.state.on('toolChange', () => this.updateToolButtons());
    this.state.on('historyChange', () => this.updateHistoryButtons());
    this.state.on('viewChange', () => this.updateZoomDisplay());
    this.state.on('gridChange', () => this.updateGridButton());
    this.state.on('arrowEditModeChange', () => this.updateArrowEditButton());

    // Keyboard shortcuts for tools
    document.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' ||
          (e.target as HTMLElement).tagName === 'TEXTAREA') return;

      switch (e.key.toLowerCase()) {
        case 'v':
          this.state.setTool('select');
          break;
        case 'h':
          this.state.setTool('pan');
          break;
        case 'g':
          this.state.toggleGridSnap();
          break;
        case 'z':
          if (!e.metaKey && !e.ctrlKey) {
            this.addZone();
          }
          break;
        case 'c':
          if (!e.metaKey && !e.ctrlKey) {
            this.addComponent();
          }
          break;
        case 'n':
          this.addNote();
          break;
        case 's':
          if (!e.metaKey && !e.ctrlKey) {
            this.addScenario();
          }
          break;
        case '?':
        case '/':
          if (e.shiftKey || e.key === '?') {
            this.showShortcutsHelp();
          }
          break;
        case '=':
        case '+':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            this.state.setZoom(this.state.zoom * 1.2);
          }
          break;
        case '-':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            this.state.setZoom(this.state.zoom / 1.2);
          }
          break;
        case '0':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            this.state.setZoom(1);
          }
          break;
      }
    });
  }

  private handleAction(action: string): void {
    switch (action) {
      case 'add-zone':
        this.addZone();
        break;
      case 'add-component':
        this.addComponent();
        break;
      case 'add-note':
        this.addNote();
        break;
      case 'add-scenario':
        this.addScenario();
        break;
      case 'tool-select':
        this.state.setTool('select');
        break;
      case 'tool-pan':
        this.state.setTool('pan');
        break;
      case 'toggle-arrow-edit':
        this.state.toggleArrowEditMode();
        this.updateCanvasArrowEditClass();
        break;
      case 'undo':
        this.state.undo();
        break;
      case 'redo':
        this.state.redo();
        break;
      case 'toggle-grid-snap':
        this.state.toggleGridSnap();
        break;
      case 'toggle-grid-visible':
        this.state.toggleGridVisible();
        break;
      case 'zoom-in':
        this.state.setZoom(this.state.zoom * 1.2);
        break;
      case 'zoom-out':
        this.state.setZoom(this.state.zoom / 1.2);
        break;
      case 'zoom-reset':
        this.state.setZoom(1);
        break;
      case 'shortcuts':
        this.showShortcutsHelp();
        break;
      case 'toggle-export-menu':
        this.toggleExportMenu();
        break;
      case 'export-json':
        this.exportJSON();
        break;
      case 'import-json':
        this.importJSON();
        break;
      case 'export-png':
        this.exportImage('png');
        this.closeExportMenu();
        break;
      case 'export-jpg':
        this.exportImage('jpg');
        this.closeExportMenu();
        break;
      case 'export-pdf':
        this.exportPDF();
        this.closeExportMenu();
        break;
      case 'toggle-lang':
        i18n.toggleLanguage();
        break;
    }
  }

  private addZone(): void {
    const zone = this.state.createZone(100, 100);
    this.state.addElement(zone);
    this.state.select(zone.id);
  }

  private addComponent(): void {
    const comp = this.state.createComponent(150, 150);
    this.state.addElement(comp);
    this.state.select(comp.id);
  }

  private addNote(): void {
    const note = this.state.createNote(200, 200);
    this.state.addElement(note);
    this.state.select(note.id);
  }

  private addScenario(): void {
    const scenario = this.state.createScenario(250, 250);
    this.state.addElement(scenario);
    this.state.select(scenario.id);
  }

  private updateToolButtons(): void {
    this.container.querySelectorAll('[data-action^="tool-"]').forEach(btn => {
      const action = (btn as HTMLElement).dataset.action;
      const tool = action?.replace('tool-', '');
      btn.classList.toggle('active', tool === this.state.currentTool);
    });
  }

  private updateHistoryButtons(): void {
    const undoBtn = this.container.querySelector('[data-action="undo"]') as HTMLButtonElement;
    const redoBtn = this.container.querySelector('[data-action="redo"]') as HTMLButtonElement;

    if (undoBtn) undoBtn.disabled = !this.state.canUndo();
    if (redoBtn) redoBtn.disabled = !this.state.canRedo();
  }

  private updateZoomDisplay(): void {
    const display = this.container.querySelector('.zoom-display');
    if (display) {
      display.textContent = `${Math.round(this.state.zoom * 100)}%`;
    }
  }

  private updateGridButton(): void {
    const snapBtn = this.container.querySelector('[data-action="toggle-grid-snap"]');
    const visibleBtn = this.container.querySelector('[data-action="toggle-grid-visible"]');
    if (snapBtn) {
      snapBtn.classList.toggle('active', this.state.gridSnap);
    }
    if (visibleBtn) {
      visibleBtn.classList.toggle('active', this.state.gridVisible);
    }
  }

  private updateArrowEditButton(): void {
    const btn = this.container.querySelector('[data-action="toggle-arrow-edit"]');
    if (btn) {
      btn.classList.toggle('active', this.state.arrowEditMode);
    }
    this.updateCanvasArrowEditClass();
  }

  private updateCanvasArrowEditClass(): void {
    const canvas = this.canvas.getCanvas();
    canvas.classList.toggle('arrow-edit-mode', this.state.arrowEditMode);
  }

  private showShortcutsHelp(): void {
    const t = i18n.t;
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

    const generateShortcutsContent = (os: 'mac' | 'windows') => {
      const cmd = os === 'mac' ? '⌘' : 'Ctrl';
      const del = os === 'mac' ? 'Delete' : 'Del';

      return `
        <div class="shortcuts-grid">
          <div class="shortcuts-section">
            <h4>${t.shortcutGeneral}</h4>
            <div class="shortcut-row"><kbd>${cmd}</kbd><kbd>Z</kbd><span>${t.shortcutUndoDesc}</span></div>
            <div class="shortcut-row"><kbd>${cmd}</kbd><kbd>⇧</kbd><kbd>Z</kbd><span>${t.shortcutRedoDesc}</span></div>
            <div class="shortcut-row"><kbd>${cmd}</kbd><kbd>C</kbd><span>${t.shortcutCopyDesc}</span></div>
            <div class="shortcut-row"><kbd>${cmd}</kbd><kbd>V</kbd><span>${t.shortcutPasteDesc}</span></div>
            <div class="shortcut-row"><kbd>${del}</kbd><span>${t.shortcutDeleteDesc}</span></div>
            <div class="shortcut-row"><kbd>${cmd}</kbd><kbd>A</kbd><span>${t.shortcutSelectAllDesc}</span></div>
            <div class="shortcut-row"><kbd>Esc</kbd><span>${t.shortcutEscapeDesc}</span></div>
          </div>

          <div class="shortcuts-section">
            <h4>${t.shortcutTools}</h4>
            <div class="shortcut-row"><kbd>V</kbd><span>${t.shortcutSelectToolDesc}</span></div>
            <div class="shortcut-row"><kbd>H</kbd><span>${t.shortcutPanToolDesc}</span></div>
            <div class="shortcut-row"><kbd>A</kbd><span>${t.shortcutArrowToolDesc}</span></div>
            <div class="shortcut-row"><kbd>G</kbd><span>${t.shortcutGridDesc}</span></div>
          </div>

          <div class="shortcuts-section">
            <h4>${t.shortcutElements}</h4>
            <div class="shortcut-row"><kbd>Z</kbd><span>${t.shortcutZoneDesc}</span></div>
            <div class="shortcut-row"><kbd>C</kbd><span>${t.shortcutComponentDesc}</span></div>
            <div class="shortcut-row"><kbd>N</kbd><span>${t.shortcutNoteDesc}</span></div>
            <div class="shortcut-row"><kbd>S</kbd><span>${t.shortcutScenarioDesc}</span></div>
          </div>

          <div class="shortcuts-section">
            <h4>${t.shortcutView}</h4>
            <div class="shortcut-row"><kbd>${cmd}</kbd><kbd>+</kbd><span>${t.shortcutZoomInDesc}</span></div>
            <div class="shortcut-row"><kbd>${cmd}</kbd><kbd>-</kbd><span>${t.shortcutZoomOutDesc}</span></div>
            <div class="shortcut-row"><kbd>${cmd}</kbd><kbd>0</kbd><span>${t.shortcutZoomResetDesc}</span></div>
            <div class="shortcut-row"><kbd>↑↓←→</kbd><span>${t.shortcutArrowMoveDesc}</span></div>
            <div class="shortcut-row"><kbd>⇧</kbd><kbd>↑↓←→</kbd><span>${t.shortcutArrowMoveFastDesc}</span></div>
          </div>

          <div class="shortcuts-section">
            <h4>${t.shortcutSelection}</h4>
            <div class="shortcut-row"><kbd>⇧</kbd><kbd>Click</kbd><span>${t.shortcutShiftClickDesc}</span></div>
            <div class="shortcut-row"><kbd>Drag</kbd><span>${t.shortcutDragSelectDesc}</span></div>
            <div class="shortcut-row"><kbd>A</kbd><span>${t.shortcutSelectArrowsDesc}</span></div>
          </div>

          <div class="shortcuts-section">
            <h4>${t.shortcutGridSnap}</h4>
            <div class="shortcut-row"><span class="grid-desc">📐 ${t.gridShow}</span><span>${t.gridShowDesc}</span></div>
            <div class="shortcut-row"><span class="grid-desc">🧲 ${t.gridSnap}</span><span>${t.gridSnapDesc}</span></div>
          </div>
        </div>
      `;
    };

    const modal = this.createModal(t.shortcutsHelp, `
      <div class="shortcuts-tabs">
        <button class="shortcuts-tab ${isMac ? 'active' : ''}" data-tab="mac">🍎 ${t.tabMac}</button>
        <button class="shortcuts-tab ${!isMac ? 'active' : ''}" data-tab="windows">🪟 ${t.tabWindows}</button>
      </div>
      <div class="shortcuts-tab-content" data-content="mac" ${isMac ? '' : 'style="display:none"'}>
        ${generateShortcutsContent('mac')}
      </div>
      <div class="shortcuts-tab-content" data-content="windows" ${!isMac ? '' : 'style="display:none"'}>
        ${generateShortcutsContent('windows')}
      </div>
      <div class="modal-actions">
        <button class="toolbar-btn primary" data-modal-action="close">${t.close}</button>
      </div>
    `);

    // Tab switching logic
    const tabs = modal.querySelectorAll('.shortcuts-tab');
    const contents = modal.querySelectorAll('.shortcuts-tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = (tab as HTMLElement).dataset.tab;

        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        contents.forEach(content => {
          const contentElement = content as HTMLElement;
          if (contentElement.dataset.content === targetTab) {
            contentElement.style.display = '';
          } else {
            contentElement.style.display = 'none';
          }
        });
      });
    });
  }

  private toggleExportMenu(): void {
    const menu = document.getElementById('export-menu');
    if (menu) {
      const isOpen = menu.classList.contains('open');
      if (isOpen) {
        this.closeExportMenu();
      } else {
        menu.classList.add('open');
        // Close when clicking outside
        setTimeout(() => {
          document.addEventListener('click', this.handleOutsideClick);
        }, 0);
      }
    }
  }

  private handleOutsideClick = (e: MouseEvent) => {
    const dropdown = (e.target as HTMLElement).closest('.export-dropdown');
    if (!dropdown) {
      this.closeExportMenu();
    }
  };

  private closeExportMenu(): void {
    const menu = document.getElementById('export-menu');
    if (menu) {
      menu.classList.remove('open');
      document.removeEventListener('click', this.handleOutsideClick);
    }
  }

  private exportJSON(): void {
    const t = i18n.t;
    const json = this.state.toJSON();
    const modal = this.createModal(t.exportJson, `
      <pre class="json-box">${this.escapeHtml(json)}</pre>
      <div class="modal-actions">
        <button class="toolbar-btn" data-modal-action="save-file">${t.exportJsonFile}</button>
        <button class="toolbar-btn primary" data-modal-action="copy">${t.copyJson}</button>
        <button class="toolbar-btn" data-modal-action="close">${t.close}</button>
      </div>
    `);

    modal.querySelector('[data-modal-action="save-file"]')?.addEventListener('click', () => {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diagram-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const btn = modal.querySelector('[data-modal-action="save-file"]') as HTMLButtonElement;
      const originalText = btn.textContent;
      btn.textContent = t.exportSuccess;
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 1500);
    });

    modal.querySelector('[data-modal-action="copy"]')?.addEventListener('click', () => {
      navigator.clipboard.writeText(json);
      const btn = modal.querySelector('[data-modal-action="copy"]') as HTMLButtonElement;
      const originalText = btn.textContent;
      btn.textContent = t.copiedToClipboard;
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 1500);
    });
  }

  private importJSON(): void {
    const t = i18n.t;
    const modal = this.createModal(t.importJson, `
      <input type="file" id="import-json-file" accept=".json" style="display:none;">
      <div class="json-input-container">
        <textarea id="import-json-input" style="width:100%;height:300px;font-family:monospace;font-size:12px;padding:12px;border:1px solid #e0e0e0;border-radius:6px;" placeholder="${t.pasteJsonHere}"></textarea>
        <div id="json-validation-status" class="json-validation-status"></div>
      </div>
      <div class="modal-actions">
        <button class="toolbar-btn" data-modal-action="browse">${t.browseFile}</button>
        <button class="toolbar-btn primary" data-modal-action="import" id="import-btn">${t.import}</button>
        <button class="toolbar-btn" data-modal-action="close">${t.cancel}</button>
      </div>
    `);

    const fileInput = document.getElementById('import-json-file') as HTMLInputElement;
    const textArea = document.getElementById('import-json-input') as HTMLTextAreaElement;
    const validationStatus = document.getElementById('json-validation-status')!;
    const importBtn = document.getElementById('import-btn') as HTMLButtonElement;

    // 실시간 JSON 검증 (debounce 적용)
    let validationTimeout: number | null = null;
    const validateInput = () => {
      const value = textArea.value.trim();

      if (!value) {
        validationStatus.className = 'json-validation-status';
        validationStatus.textContent = '';
        textArea.classList.remove('json-valid', 'json-invalid');
        importBtn.disabled = true;
        return;
      }

      const result = this.state.validateJSON(value);

      if (result.valid) {
        validationStatus.className = 'json-validation-status valid';
        validationStatus.innerHTML = '✓ Valid JSON';
        textArea.classList.remove('json-invalid');
        textArea.classList.add('json-valid');
        importBtn.disabled = false;
      } else {
        validationStatus.className = 'json-validation-status invalid';
        let errorMsg = result.error || 'Invalid JSON';
        if (result.line) {
          errorMsg += ` (line ${result.line}, column ${result.column})`;
        }
        validationStatus.innerHTML = `✗ ${errorMsg}`;
        textArea.classList.remove('json-valid');
        textArea.classList.add('json-invalid');
        importBtn.disabled = true;
      }
    };

    textArea.addEventListener('input', () => {
      if (validationTimeout) {
        clearTimeout(validationTimeout);
      }
      validationTimeout = window.setTimeout(validateInput, 300);
    });

    modal.querySelector('[data-modal-action="browse"]')?.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          textArea.value = e.target?.result as string;
          validateInput(); // 파일 로드 후 즉시 검증
        };
        reader.readAsText(file);
      }
    });

    modal.querySelector('[data-modal-action="import"]')?.addEventListener('click', () => {
      if (textArea.value) {
        const result = this.state.fromJSON(textArea.value);
        if (result.success) {
          this.closeModal();
        } else {
          // 에러 발생 시 상태 업데이트
          validationStatus.className = 'json-validation-status invalid';
          validationStatus.innerHTML = `✗ ${result.error}`;
          textArea.classList.add('json-invalid');
        }
      }
    });

    // 초기 상태: import 버튼 비활성화
    importBtn.disabled = true;
  }

  private async exportImage(format: 'png' | 'jpg'): Promise<void> {
    const t = i18n.t;
    const canvasEl = this.canvas.getCanvas();

    // Show loading state
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'export-loading';
    loadingOverlay.innerHTML = `<div class="export-loading-content">${t.exporting}</div>`;
    document.body.appendChild(loadingOverlay);

    try {
      // Dynamic import of html2canvas
      const html2canvas = (await import('html2canvas')).default;

      // Store current state
      const currentZoom = this.state.zoom;
      const currentPan = { ...this.state.pan };
      const wasGridVisible = this.state.gridVisible;

      // Reset zoom and pan for export, hide grid
      this.state.setZoom(1);
      this.state.setPan(0, 0);
      if (wasGridVisible) {
        this.state.toggleGridVisible(); // Hide grid for export
      }

      // Wait for render
      await new Promise(resolve => setTimeout(resolve, 100));

      // Use canvas size instead of element bounds
      const { width, height } = this.state.canvasSize;

      // Capture canvas based on canvasSize
      const canvas = await html2canvas(canvasEl, {
        backgroundColor: '#ffffff',
        scale: 2,
        x: 0,
        y: 0,
        width: width,
        height: height,
        useCORS: true,
        logging: false,
      });

      // Restore zoom, pan, and grid visibility
      this.state.setZoom(currentZoom);
      this.state.setPan(currentPan.x, currentPan.y);
      if (wasGridVisible) {
        this.state.toggleGridVisible(); // Restore grid
      }

      // Convert to image and download
      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
      const quality = format === 'jpg' ? 0.92 : undefined;
      const dataUrl = canvas.toDataURL(mimeType, quality);

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `diagram-${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

    } catch (error) {
      console.error('Export failed:', error);
      alert(t.exportFailed + '\n\n' + (error as Error).message);
    } finally {
      loadingOverlay.remove();
    }
  }

  private async exportPDF(): Promise<void> {
    const t = i18n.t;
    const canvasEl = this.canvas.getCanvas();

    // Show loading state
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'export-loading';
    loadingOverlay.innerHTML = `<div class="export-loading-content">${t.exporting}</div>`;
    document.body.appendChild(loadingOverlay);

    try {
      // Dynamic import of html2canvas and jspdf
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      // Store current state
      const currentZoom = this.state.zoom;
      const currentPan = { ...this.state.pan };
      const wasGridVisible = this.state.gridVisible;

      // Reset zoom and pan for export, hide grid
      this.state.setZoom(1);
      this.state.setPan(0, 0);
      if (wasGridVisible) {
        this.state.toggleGridVisible(); // Hide grid for export
      }

      // Wait for render
      await new Promise(resolve => setTimeout(resolve, 100));

      // Use canvas size instead of element bounds
      const { width, height } = this.state.canvasSize;

      // Capture canvas based on canvasSize
      const canvas = await html2canvas(canvasEl, {
        backgroundColor: '#ffffff',
        scale: 2,
        x: 0,
        y: 0,
        width: width,
        height: height,
        useCORS: true,
        logging: false,
      });

      // Restore zoom, pan, and grid visibility
      this.state.setZoom(currentZoom);
      this.state.setPan(currentPan.x, currentPan.y);
      if (wasGridVisible) {
        this.state.toggleGridVisible(); // Restore grid
      }

      // Determine orientation based on canvas size
      const orientation = width > height ? 'landscape' : 'portrait';

      // Create PDF
      const pdf = new jsPDF({
        orientation,
        unit: 'px',
        format: [width, height],
      });

      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 0, 0, width, height);
      pdf.save(`diagram-${Date.now()}.pdf`);

    } catch (error) {
      console.error('PDF Export failed:', error);
      alert(t.exportFailed + '\n\n' + (error as Error).message);
    } finally {
      loadingOverlay.remove();
    }
  }

  private createModal(title: string, content: string): HTMLElement {
    // Remove existing modal
    this.closeModal();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'modal-overlay';

    overlay.innerHTML = `
      <div class="modal">
        <h2>${title}</h2>
        ${content}
      </div>
    `;

    document.body.appendChild(overlay);

    // Close on overlay click or close button
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay ||
          (e.target as HTMLElement).closest('[data-modal-action="close"]')) {
        this.closeModal();
      }
    });

    // Close on Escape
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    return overlay.querySelector('.modal')!;
  }

  private closeModal(): void {
    document.getElementById('modal-overlay')?.remove();
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
