export type Language = 'ko' | 'en';

export interface Translations {
  // Toolbar
  diagramEditor: string;
  zone: string;
  component: string;
  note: string;
  scenario: string;
  select: string;
  pan: string;
  arrowEdit: string;
  undo: string;
  redo: string;
  gridSnap: string;
  gridShow: string;
  json: string;
  import: string;
  png: string;
  shortcuts: string;

  // Properties Panel
  properties: string;
  selectElement: string;
  elementsSelected: string;
  name: string;
  icon: string;
  subtitle: string;
  color: string;
  position: string;
  size: string;
  label: string;
  title: string;
  text: string;
  description: string;
  style: string;
  solid: string;
  dashed: string;
  waypoints: string;
  waypointHint: string;
  clearWaypoints: string;
  delete: string;
  deleteAll: string;
  commonColor: string;
  opacity: string;
  layer: string;
  bringForward: string;
  sendBackward: string;
  bringToFront: string;
  sendToBack: string;
  saveProps: string;
  deleteElement: string;
  textColor: string;
  fontSize: string;
  selectEmoji: string;
  backgroundColor: string;
  shape: string;
  shapeRectangle: string;
  shapeTriangle: string;
  shapeCylinder: string;
  shapeStar: string;

  // Arrow Markers
  arrowMarkers: string;
  startMarker: string;
  endMarker: string;
  markerNone: string;
  markerArrow: string;
  markerCircle: string;

  // Arrow Alignment
  makeOrthogonal: string;
  makeOrthogonalHint: string;

  // Modals
  exportJson: string;
  importJson: string;
  copy: string;
  close: string;
  cancel: string;
  pasteJsonHere: string;
  copiedToClipboard: string;
  pngExportHint: string;
  browseFile: string;

  // Export dropdown
  export: string;
  exportPng: string;
  exportJpg: string;
  exportPdf: string;
  exportJsonFile: string;
  copyJson: string;
  exporting: string;
  exportSuccess: string;
  exportFailed: string;

  // Shortcuts Help
  shortcutsHelp: string;
  shortcutGeneral: string;
  shortcutTools: string;
  shortcutElements: string;
  shortcutView: string;
  shortcutSelection: string;
  shortcutUndoDesc: string;
  shortcutRedoDesc: string;
  shortcutCopyDesc: string;
  shortcutPasteDesc: string;
  shortcutDeleteDesc: string;
  shortcutSelectAllDesc: string;
  shortcutEscapeDesc: string;
  shortcutSelectToolDesc: string;
  shortcutPanToolDesc: string;
  shortcutArrowToolDesc: string;
  shortcutGridDesc: string;
  shortcutZoneDesc: string;
  shortcutComponentDesc: string;
  shortcutNoteDesc: string;
  shortcutScenarioDesc: string;
  shortcutZoomInDesc: string;
  shortcutZoomOutDesc: string;
  shortcutZoomResetDesc: string;
  shortcutArrowMoveDesc: string;
  shortcutArrowMoveFastDesc: string;
  shortcutShiftClickDesc: string;
  shortcutDragSelectDesc: string;
  shortcutSelectArrowsDesc: string;

  // Language
  language: string;
  korean: string;
  english: string;

  // Session Sidebar
  newDiagram: string;
  noSessions: string;
  deleteSession: string;
  deleteSessionConfirm: string;
  today: string;
  yesterday: string;
}

const ko: Translations = {
  // Toolbar
  diagramEditor: '다이어그램 에디터',
  zone: '영역',
  component: '컴포넌트',
  note: '노트',
  scenario: '시나리오',
  select: '선택',
  pan: '이동',
  arrowEdit: '화살표',
  undo: '실행 취소',
  redo: '다시 실행',
  gridSnap: '스냅',
  gridShow: '눈금',
  json: 'JSON',
  import: '가져오기',
  png: 'PNG',
  shortcuts: '단축키',

  // Properties Panel
  properties: '속성',
  selectElement: '요소를 선택하세요',
  elementsSelected: '개 요소 선택됨',
  name: '이름',
  icon: '아이콘 (이모지)',
  subtitle: '부제목',
  color: '색상',
  position: '위치',
  size: '크기',
  label: '라벨',
  title: '제목',
  text: '내용',
  description: '설명',
  style: '스타일',
  solid: '실선',
  dashed: '점선',
  waypoints: '꺾임점',
  waypointHint: '화살표 더블클릭으로 꺾임점 추가\nDelete 키로 삭제',
  clearWaypoints: '모든 꺾임점 제거',
  delete: '삭제',
  deleteAll: '모두 삭제',
  commonColor: '공통 색상',
  opacity: '투명도',
  layer: '요소위치',
  bringForward: '앞으로',
  sendBackward: '뒤로',
  bringToFront: '맨 앞으로',
  sendToBack: '맨 뒤로',
  saveProps: '속성저장',
  deleteElement: '요소삭제',
  textColor: '글자 색상',
  fontSize: '글자 크기',
  selectEmoji: '이모지 선택',
  backgroundColor: '배경 색상',
  shape: '도형',
  shapeRectangle: '사각형',
  shapeTriangle: '삼각형',
  shapeCylinder: 'DB(원통)',
  shapeStar: '별',

  // Arrow Markers
  arrowMarkers: '화살표 끝 모양',
  startMarker: '시작점',
  endMarker: '끝점',
  markerNone: '없음',
  markerArrow: '화살표',
  markerCircle: '원형',

  // Arrow Alignment
  makeOrthogonal: '직각으로 정렬',
  makeOrthogonalHint: '꺾임점을 직각으로 정렬합니다',

  // Modals
  exportJson: 'JSON 내보내기',
  importJson: 'JSON 가져오기',
  copy: '복사',
  close: '닫기',
  cancel: '취소',
  pasteJsonHere: 'JSON을 여기에 붙여넣으세요...',
  copiedToClipboard: '클립보드에 복사되었습니다!',
  pngExportHint: 'PNG 내보내기는 html2canvas 라이브러리가 필요합니다.\n현재는 브라우저 스크린샷 (Cmd+Shift+4)을 사용하세요.',
  browseFile: '파일 찾기',

  // Export dropdown
  export: '내보내기',
  exportPng: 'PNG로 내보내기',
  exportJpg: 'JPG로 내보내기',
  exportPdf: 'PDF로 내보내기',
  exportJsonFile: '파일로 저장',
  copyJson: '클립보드에 복사',
  exporting: '내보내는 중...',
  exportSuccess: '완료!',
  exportFailed: '내보내기 실패',

  // Shortcuts Help
  shortcutsHelp: '단축키 도움말',
  shortcutGeneral: '일반',
  shortcutTools: '도구',
  shortcutElements: '요소 추가',
  shortcutView: '뷰',
  shortcutSelection: '선택',
  shortcutUndoDesc: '실행 취소',
  shortcutRedoDesc: '다시 실행',
  shortcutCopyDesc: '복사',
  shortcutPasteDesc: '붙여넣기',
  shortcutDeleteDesc: '삭제',
  shortcutSelectAllDesc: '모두 선택',
  shortcutEscapeDesc: '선택 해제 / 취소',
  shortcutSelectToolDesc: '선택 도구',
  shortcutPanToolDesc: '이동 도구',
  shortcutArrowToolDesc: '화살표 편집 모드',
  shortcutGridDesc: '그리드 스냅 토글',
  shortcutZoneDesc: '영역 추가',
  shortcutComponentDesc: '컴포넌트 추가',
  shortcutNoteDesc: '노트 추가',
  shortcutScenarioDesc: '시나리오 추가',
  shortcutZoomInDesc: '확대',
  shortcutZoomOutDesc: '축소',
  shortcutZoomResetDesc: '줌 초기화',
  shortcutArrowMoveDesc: '선택 요소 이동',
  shortcutArrowMoveFastDesc: '빠르게 이동 (10px)',
  shortcutShiftClickDesc: '다중 선택 추가/제거',
  shortcutDragSelectDesc: '드래그로 영역 선택',
  shortcutSelectArrowsDesc: '화살표 편집 모드 토글',

  // Language
  language: '언어',
  korean: '한국어',
  english: 'English',

  // Session Sidebar
  newDiagram: '새 다이어그램',
  noSessions: '저장된 세션이 없습니다',
  deleteSession: '세션 삭제',
  deleteSessionConfirm: '이 세션을 삭제하시겠습니까?',
  today: '오늘',
  yesterday: '어제',
};

const en: Translations = {
  // Toolbar
  diagramEditor: 'Diagram Editor',
  zone: 'Zone',
  component: 'Component',
  note: 'Note',
  scenario: 'Scenario',
  select: 'Select',
  pan: 'Pan',
  arrowEdit: 'Arrows',
  undo: 'Undo',
  redo: 'Redo',
  gridSnap: 'Snap',
  gridShow: 'Grid',
  json: 'JSON',
  import: 'Import',
  png: 'PNG',
  shortcuts: 'Shortcuts',

  // Properties Panel
  properties: 'Properties',
  selectElement: 'Select an element',
  elementsSelected: 'elements selected',
  name: 'Name',
  icon: 'Icon (emoji)',
  subtitle: 'Subtitle',
  color: 'Color',
  position: 'Position',
  size: 'Size',
  label: 'Label',
  title: 'Title',
  text: 'Text',
  description: 'Description',
  style: 'Style',
  solid: 'Solid',
  dashed: 'Dashed',
  waypoints: 'Waypoints',
  waypointHint: 'Double-click arrow to add waypoint.\nPress Delete to remove.',
  clearWaypoints: 'Clear All Waypoints',
  delete: 'Delete',
  deleteAll: 'Delete All',
  commonColor: 'Common Color',
  opacity: 'Opacity',
  layer: 'Layer',
  bringForward: 'Forward',
  sendBackward: 'Backward',
  bringToFront: 'To Front',
  sendToBack: 'To Back',
  saveProps: 'Save',
  deleteElement: 'Delete',
  textColor: 'Text Color',
  fontSize: 'Font Size',
  selectEmoji: 'Select Emoji',
  backgroundColor: 'Background Color',
  shape: 'Shape',
  shapeRectangle: 'Rectangle',
  shapeTriangle: 'Triangle',
  shapeCylinder: 'DB (Cylinder)',
  shapeStar: 'Star',

  // Arrow Markers
  arrowMarkers: 'Arrow Markers',
  startMarker: 'Start',
  endMarker: 'End',
  markerNone: 'None',
  markerArrow: 'Arrow',
  markerCircle: 'Circle',

  // Arrow Alignment
  makeOrthogonal: 'Make Orthogonal',
  makeOrthogonalHint: 'Align waypoints to right angles',

  // Modals
  exportJson: 'Export JSON',
  importJson: 'Import JSON',
  copy: 'Copy',
  close: 'Close',
  cancel: 'Cancel',
  pasteJsonHere: 'Paste JSON here...',
  copiedToClipboard: 'Copied to clipboard!',
  pngExportHint: 'PNG export requires html2canvas library.\nFor now, use browser screenshot (Cmd+Shift+4).',
  browseFile: 'Browse',

  // Export dropdown
  export: 'Export',
  exportPng: 'PNG',
  exportJpg: 'JPG',
  exportPdf: 'PDF',
  exportJsonFile: 'Save File',
  copyJson: 'Copy',
  exporting: 'Exporting...',
  exportSuccess: 'Done!',
  exportFailed: 'Export failed',

  // Shortcuts Help
  shortcutsHelp: 'Keyboard Shortcuts',
  shortcutGeneral: 'General',
  shortcutTools: 'Tools',
  shortcutElements: 'Add Elements',
  shortcutView: 'View',
  shortcutSelection: 'Selection',
  shortcutUndoDesc: 'Undo',
  shortcutRedoDesc: 'Redo',
  shortcutCopyDesc: 'Copy',
  shortcutPasteDesc: 'Paste',
  shortcutDeleteDesc: 'Delete',
  shortcutSelectAllDesc: 'Select All',
  shortcutEscapeDesc: 'Deselect / Cancel',
  shortcutSelectToolDesc: 'Select Tool',
  shortcutPanToolDesc: 'Pan Tool',
  shortcutArrowToolDesc: 'Arrow Edit Mode',
  shortcutGridDesc: 'Toggle Grid Snap',
  shortcutZoneDesc: 'Add Zone',
  shortcutComponentDesc: 'Add Component',
  shortcutNoteDesc: 'Add Note',
  shortcutScenarioDesc: 'Add Scenario',
  shortcutZoomInDesc: 'Zoom In',
  shortcutZoomOutDesc: 'Zoom Out',
  shortcutZoomResetDesc: 'Reset Zoom',
  shortcutArrowMoveDesc: 'Move Selected',
  shortcutArrowMoveFastDesc: 'Move Fast (10px)',
  shortcutShiftClickDesc: 'Add/Remove from Selection',
  shortcutDragSelectDesc: 'Drag to Select Area',
  shortcutSelectArrowsDesc: 'Toggle Arrow Edit Mode',

  // Language
  language: 'Language',
  korean: '한국어',
  english: 'English',

  // Session Sidebar
  newDiagram: 'New Diagram',
  noSessions: 'No saved sessions',
  deleteSession: 'Delete Session',
  deleteSessionConfirm: 'Delete this session?',
  today: 'Today',
  yesterday: 'Yesterday',
};

const translations: Record<Language, Translations> = { ko, en };

class I18n {
  private currentLanguage: Language = 'ko';
  private listeners: Set<() => void> = new Set();

  constructor() {
    // Load saved language preference
    const saved = localStorage.getItem('diagram-editor-lang') as Language;
    if (saved && translations[saved]) {
      this.currentLanguage = saved;
    }
  }

  get lang(): Language {
    return this.currentLanguage;
  }

  get t(): Translations {
    return translations[this.currentLanguage];
  }

  setLanguage(lang: Language): void {
    if (this.currentLanguage === lang) return;
    this.currentLanguage = lang;
    localStorage.setItem('diagram-editor-lang', lang);
    this.notifyListeners();
  }

  toggleLanguage(): void {
    this.setLanguage(this.currentLanguage === 'ko' ? 'en' : 'ko');
  }

  onChange(callback: () => void): void {
    this.listeners.add(callback);
  }

  offChange(callback: () => void): void {
    this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach(cb => cb());
  }
}

export const i18n = new I18n();

// Helper function to get translation
export function t(key: keyof Translations): string {
  return i18n.t[key];
}
