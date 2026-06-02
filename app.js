const workspace = document.getElementById('workspace');
const canvas = document.getElementById('canvas');
const svg = document.getElementById('connections');
const statusEl = document.getElementById('status');
const nameInput = document.getElementById('nameInput');
const colorInput = document.getElementById('colorInput');
const projectTabs = document.getElementById('projectTabs');
const contextMenu = document.getElementById('contextMenu');
const portMenu = document.getElementById('portMenu');
const ctxName = document.getElementById('ctxName');
const ctxColor = document.getElementById('ctxColor');
const ctxFamily = document.getElementById('ctxFamily');
const ctxFontSize = document.getElementById('ctxFontSize');
const ctxFormulaLabel = document.getElementById('ctxFormulaLabel');
const ctxFormula = document.getElementById('ctxFormula');
const recentColorsEl = document.getElementById('recentColors');
const ctxCopyStyle = document.getElementById('ctxCopyStyle');
const ctxResetStyle = document.getElementById('ctxResetStyle');
const ctxMuted = document.getElementById('ctxMuted');
const ctxStatus = document.getElementById('ctxStatus');
const legendPanel = document.getElementById('legendPanel');
const flowSearchInput = document.getElementById('flowSearchInput');
const searchCount = document.getElementById('searchCount');
const ctxComment = document.getElementById('ctxComment');
const commentModal = document.getElementById('commentModal');
const commentModalTitle = document.getElementById('commentModalTitle');
const commentTextInput = document.getElementById('commentTextInput');
const commentCloseBtn = document.getElementById('commentCloseBtn');
const commentCancelBtn = document.getElementById('commentCancelBtn');
const commentSaveBtn = document.getElementById('commentSaveBtn');
const commentDeleteBtn = document.getElementById('commentDeleteBtn');
const pdfFileInput = document.getElementById('pdfFileInput');
let pendingPdfNodeId = null;

let state = {
  version: 2,
  projects: [],
  activeProjectId: null,
  selectedNodes: new Set(),
  selectedConnection: null,
  portDraft: null,
  connectionDrag: null,
  clipboard: null,
  pasteOffset: 0,
  undoStack: [],
  redoStack: [],
  historyLimit: 3,
  recentColors: [],
  formatPainter: null,
  commentEditTargets: [],
  viewMode: 'edit',
  legendVisible: false,
  searchQuery: '',
  searchResults: [],
  searchIndex: -1
};

const uid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
const NODE_FAMILIES = {
  source: { label: 'Source', short: 'SOURCE', color: '#e0f2fe' },
  information: { label: 'Information', short: 'INFO', color: '#ffffff' },
  datatype: { label: 'Type de donnée', short: 'TYPE', color: '#f3e8ff' },
  criterion: { label: 'Critère', short: 'CRITÈRE', color: '#fef3c7' },
  result: { label: 'Résultat', short: 'RÉSULTAT', color: '#bbf7d0' },
  tool: { label: 'Outil', short: 'OUTIL', color: '#eef2ff' }
};
function familyInfo(family) { return NODE_FAMILIES[family] || NODE_FAMILIES.information; }
const ACTIVITY_TAGS = {
  construction: { label: 'Construction neuve', icon: '🏗️' },
  renovation: { label: 'Rénovation', icon: '🛠️' },
  tertiary: { label: 'Bâtiment tertiaire', icon: '🏢' }
};
const NODE_STATUSES = {
  draft: { label: 'Brouillon', short: 'Brouillon', icon: '○' },
  validated: { label: 'Validé', short: 'Validé', icon: '✓' },
  check: { label: 'À vérifier', short: 'À vérifier', icon: '!' },
  error: { label: 'Erreur', short: 'Erreur', icon: '×' },
  final: { label: 'Final', short: 'Final', icon: '★' }
};
function statusInfo(status) { return NODE_STATUSES[status] || NODE_STATUSES.draft; }

function normalizeActivityTags(value) {
  return {
    construction: !!value?.construction,
    renovation: !!value?.renovation,
    tertiary: !!value?.tertiary
  };
}
const setStatus = msg => statusEl.textContent = msg;
const currentProject = () => state.projects.find(p => p.id === state.activeProjectId) || state.projects[0];

function estimateTextLines(text, width, fontSize = 12) {
  const safeWidth = Math.max(80, Number(width) || 210);
  const charsPerLine = Math.max(10, Math.floor((safeWidth - 70) / Math.max(6, fontSize * 0.56)));
  return Math.max(1, Math.min(3, Math.ceil(String(text || '').length / charsPerLine)));
}
function minNodeSize(node) {
  const fontSize = Number(node.fontSize) || 12;
  const portCount = Math.max(node.leftPorts?.length || 0, node.rightPorts?.length || 0, 1);
  const titleLines = estimateTextLines(node.title, node.width || 210, fontSize);
  const headerH = titleLines > 1 ? 52 : 40;
  const tagH = 58; // case Tout + 3 logos métier toujours visibles
  const portH = Math.max(0, (portCount - 1) * 26);
  const contentExtra = {
    box: 18,
    panel: 76,
    slider: 94,
    switch: 54,
    add: 54,
    subtract: 54,
    multiply: 54,
    divide: 54,
    formula: 58,
    pdf: 80,
    link: 76
  }[node.kind || 'box'] ?? 18;
  const minWidth = {
    box: 190,
    panel: 210,
    slider: 230,
    switch: 200,
    add: 200,
    subtract: 210,
    multiply: 210,
    divide: 200,
    formula: 220,
    pdf: 180,
    link: 180
  }[node.kind || 'box'] ?? 190;
  return { width: minWidth, height: Math.max(138, headerH + tagH + contentExtra + portH) };
}
function enforceNodeMinimum(node) {
  const min = minNodeSize(node);
  node.width = Math.max(min.width, Number(node.width) || min.width);
  node.height = Math.max(min.height, Number(node.height) || min.height);
}

const CONNECTION_LINE_STYLES = [
  { key: '', label: 'Par defaut / trait plein', dash: '', width: 3, cap: 'round' },
  { key: 'solid', label: 'Trait plein', dash: '', width: 3, cap: 'round' },
  { key: 'dash-fine', label: 'Tiret fin', dash: '8 6', width: 2, cap: 'butt' },
  { key: 'dash-bold', label: 'Tiret epais', dash: '14 8', width: 5, cap: 'butt' },
  { key: 'dotted', label: 'Pointilles', dash: '1 7', width: 3, cap: 'round' },
  { key: 'dash-dot', label: 'Point trait', dash: '12 6 2 6', width: 3, cap: 'round' }
];
function lineStyleLabel(key) {
  return (CONNECTION_LINE_STYLES.find(s => s.key === key) || CONNECTION_LINE_STYLES[0]).label;
}
function lineStyleConfig(key) {
  return CONNECTION_LINE_STYLES.find(s => s.key === key) || CONNECTION_LINE_STYLES[0];
}


function historySnapshot() {
  return JSON.stringify({ activeProjectId: state.activeProjectId, projects: state.projects });
}

function pushHistory() {
  const snap = historySnapshot();
  if (state.undoStack[state.undoStack.length - 1] === snap) return;
  state.undoStack.push(snap);
  if (state.undoStack.length > state.historyLimit) state.undoStack.shift();
  state.redoStack = [];
}

function restoreHistorySnapshot(snap) {
  try {
    const data = JSON.parse(snap);
    state.projects = (data.projects || []).map(normalizeProject);
    state.activeProjectId = data.activeProjectId && state.projects.some(p => p.id === data.activeProjectId) ? data.activeProjectId : state.projects[0]?.id;
    state.selectedNodes = new Set();
    state.selectedConnection = null;
    state.portDraft = null;
    state.connectionDrag = null;
    hideContextMenu();
    syncInspector();
    render();
  } catch (err) {
    console.error(err);
    alert('Impossible de restaurer l’historique.');
  }
}

function undo() {
  if (!state.undoStack.length) return setStatus('Aucun retour en arrière disponible.');
  state.redoStack.push(historySnapshot());
  if (state.redoStack.length > state.historyLimit) state.redoStack.shift();
  const snap = state.undoStack.pop();
  restoreHistorySnapshot(snap);
  setStatus('Retour en arrière.');
}

function redo() {
  if (!state.redoStack.length) return setStatus('Aucun rétablissement disponible.');
  state.undoStack.push(historySnapshot());
  if (state.undoStack.length > state.historyLimit) state.undoStack.shift();
  const snap = state.redoStack.pop();
  restoreHistorySnapshot(snap);
  setStatus('Action rétablie.');
}

function blankProject(title = `Projet ${state.projects.length + 1}`) {
  return { id: uid('project'), title, nodes: [], connections: [], groups: [], scale: 1, panX: 0, panY: 0 };
}

function seedProject(project) {
  state.activeProjectId = project.id;
  createNode({ x: 120, y: 110, title: 'Source', color: '#ffffff', rightPorts: ['Data'] }, false);
  createNode({ x: 440, y: 190, title: 'Traitement', color: '#fef3c7', leftPorts: ['Input'], rightPorts: ['Result'] }, false);
  createNode({ x: 780, y: 120, title: 'Sortie', color: '#dbeafe', leftPorts: ['Geometry'] }, false);
}

function ensureProject() {
  if (!state.projects.length) {
    const p = blankProject('Projet 1');
    state.projects.push(p);
    seedProject(p);
  }
  if (!state.activeProjectId) state.activeProjectId = state.projects[0].id;
}

function createProject() {
  pushHistory();
  const p = blankProject();
  state.projects.push(p);
  switchProject(p.id);
  setStatus('Nouveau projet créé.');
}

function switchProject(id) {
  state.activeProjectId = id;
  state.selectedNodes.clear();
  state.selectedConnection = null;
  state.portDraft = null;
  state.connectionDrag = null;
  syncInspector();
  render();
}

function renameProject() {
  const p = currentProject();
  const next = prompt('Nom du projet', p.title);
  if (next) { pushHistory(); p.title = next; renderProjectTabs(); setStatus('Projet renommé.'); }
}

function deleteProject() {
  if (state.projects.length <= 1) return alert('Il faut garder au moins un projet.');
  const p = currentProject();
  if (!confirm(`Supprimer le projet "${p.title}" ?`)) return;
  pushHistory();
  state.projects = state.projects.filter(x => x.id !== p.id);
  state.activeProjectId = state.projects[0].id;
  state.selectedNodes.clear();
  render();
}

function createNode(opts = {}, doSelect = true) {
  if (doSelect) pushHistory();
  const p = currentProject();
  let kind = opts.kind || 'box';
  let requestedFamily = opts.family;
  if (kind === 'sourceBox') { kind = 'box'; requestedFamily = 'source'; opts.title = opts.title || 'Source'; opts.color = opts.color || NODE_FAMILIES.source.color; }
  if (kind === 'informationBox') { kind = 'box'; requestedFamily = 'information'; opts.title = opts.title || 'Information'; opts.color = opts.color || NODE_FAMILIES.information.color; }
  if (kind === 'dataTypeBox') { kind = 'box'; requestedFamily = 'datatype'; opts.title = opts.title || 'Type de donnée'; opts.color = opts.color || NODE_FAMILIES.datatype.color; }
  if (kind === 'criterionBox') { kind = 'box'; requestedFamily = 'criterion'; opts.title = opts.title || 'Critère'; opts.color = opts.color || NODE_FAMILIES.criterion.color; }
  if (kind === 'resultBox') { kind = 'box'; requestedFamily = 'result'; opts.title = opts.title || 'Résultat'; opts.color = opts.color || NODE_FAMILIES.result.color; }
  if (kind === 'toolBox') { kind = 'box'; requestedFamily = 'tool'; opts.title = opts.title || 'Outil'; opts.color = opts.color || NODE_FAMILIES.tool.color; }
  const defaults = {
    box: { title: `Box ${p.nodes.length + 1}`, leftPorts: ['Entrée'], rightPorts: ['Sortie'], color: '#ffffff', width: 220, height: 146 },
    panel: { title: 'Panel', leftPorts: ['In'], rightPorts: ['Texte'], color: '#fff7ad', text: 'Écris ton texte ici...', width: 250, height: 190 },
    slider: { title: 'Slider', leftPorts: [], rightPorts: ['Valeur'], color: '#e0f2fe', value: 50, min: 0, max: 100, width: 240, height: 176 },
    switch: { title: 'Vrai / Faux', leftPorts: ['In'], rightPorts: ['Out'], color: '#dcfce7', value: true, width: 220, height: 150 },
    add: { title: 'Addition', leftPorts: ['A', 'B'], rightPorts: ['Résultat'], color: '#eef2ff', width: 220, height: 154 },
    subtract: { title: 'Soustraction', leftPorts: ['A', 'B'], rightPorts: ['Résultat'], color: '#eef2ff', width: 230, height: 154 },
    multiply: { title: 'Multiplication', leftPorts: ['A', 'B'], rightPorts: ['Résultat'], color: '#eef2ff', width: 230, height: 154 },
    divide: { title: 'Division', leftPorts: ['A', 'B'], rightPorts: ['Résultat'], color: '#eef2ff', width: 220, height: 154 },
    formula: { title: 'Formule', leftPorts: ['x', 'y'], rightPorts: ['Résultat'], color: '#f3e8ff', formula: 'x + y', width: 240, height: 160 },
    pdf: { title: 'Fichier joint', leftPorts: [], rightPorts: ['Source'], color: '#f8fafc', width: 190, height: 170, fileName: '', fileData: '', fileType: 'application/octet-stream' },
    link: { title: 'Lien internet', leftPorts: [], rightPorts: ['Source'], color: '#ecfeff', width: 190, height: 166, url: '' }
  }[kind] || { title: `Box ${p.nodes.length + 1}`, leftPorts: ['Entrée'], rightPorts: ['Sortie'], color: '#ffffff' };
  const n = {
    id: uid('node'), kind,
    family: requestedFamily || opts.family || defaults.family || 'information',
    title: opts.title || defaults.title,
    x: opts.x ?? 160,
    y: opts.y ?? 140,
    width: opts.width ?? defaults.width ?? 210,
    height: opts.height ?? defaults.height ?? 112,
    color: opts.color || defaults.color,
    fontSize: opts.fontSize ?? defaults.fontSize ?? 12,
    groupId: null,
    text: opts.text ?? defaults.text ?? '',
    value: opts.value ?? defaults.value ?? 0,
    min: opts.min ?? defaults.min ?? 0,
    max: opts.max ?? defaults.max ?? 100,
    formula: opts.formula ?? defaults.formula ?? 'x + y',
    fileName: opts.fileName ?? defaults.fileName ?? '',
    fileData: opts.fileData ?? defaults.fileData ?? '',
    fileType: opts.fileType ?? defaults.fileType ?? '',
    url: opts.url ?? defaults.url ?? '',
    leftPorts: (opts.leftPorts ?? defaults.leftPorts).map(port => typeof port === 'object' ? { id: uid('port'), label: port.label || 'Entrée', connectionStyle: port.connectionStyle || '' } : { id: uid('port'), label: port, connectionStyle: '' }),
    rightPorts: (opts.rightPorts ?? defaults.rightPorts).map(port => typeof port === 'object' ? { id: uid('port'), label: port.label || 'Sortie', connectionStyle: port.connectionStyle || '' } : { id: uid('port'), label: port, connectionStyle: '' }),
    comment: opts.comment ?? '',
    status: opts.status || 'draft',
    activityTags: normalizeActivityTags(opts.activityTags)
  };
  enforceNodeMinimum(n);
  p.nodes.push(n);
  render();
  if (doSelect) selectNode(n.id, false);
  return n;
}

function selectedNodes() { return currentProject().nodes.filter(n => state.selectedNodes.has(n.id)); }
function getNode(id) { return currentProject().nodes.find(n => n.id === id); }
function getPort(nodeId, portId) {
  const node = getNode(nodeId);
  if (!node) return null;
  const left = node.leftPorts.find(p => p.id === portId);
  const right = node.rightPorts.find(p => p.id === portId);
  return left ? { node, port: left, side: 'left' } : right ? { node, port: right, side: 'right' } : null;
}

function selectNode(id, additive) {
  if (!additive) state.selectedNodes.clear();
  state.selectedConnection = null;
  if (state.selectedNodes.has(id) && additive) state.selectedNodes.delete(id);
  else state.selectedNodes.add(id);
  syncInspector();
  render();
}

function syncInspector() {
  const nodes = selectedNodes();
  if (nodes.length === 1) {
    nameInput.value = nodes[0].title;
    nameInput.disabled = false;
    colorInput.value = rgbToHex(nodes[0].color || '#ffffff');
    colorInput.disabled = false;
  } else {
    nameInput.value = nodes.length ? `${nodes.length} éléments sélectionnés` : '';
    nameInput.disabled = nodes.length !== 1;
    colorInput.disabled = nodes.length === 0;
  }
}
function rgbToHex(v) { return v && v.startsWith('#') ? v : '#ffffff'; }
function loadRecentColors() {
  try {
    const raw = localStorage.getItem('node-board-recent-colors');
    const list = JSON.parse(raw || '[]');
    state.recentColors = Array.isArray(list) ? list.filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 5) : [];
  } catch { state.recentColors = []; }
}
function saveRecentColors() {
  try { localStorage.setItem('node-board-recent-colors', JSON.stringify(state.recentColors.slice(0, 5))); } catch {}
}
function rememberColor(color) {
  const c = rgbToHex(color || '').toLowerCase();
  if (!/^#[0-9a-f]{6}$/i.test(c)) return;
  state.recentColors = [c, ...state.recentColors.filter(x => x.toLowerCase() !== c)].slice(0, 5);
  saveRecentColors();
  renderRecentColors();
}
function renderRecentColors() {
  if (!recentColorsEl) return;
  recentColorsEl.innerHTML = '';
  const colors = [
    { label: 'Pas de couleur', value: 'none', css: '#ffffff' },
    { label: 'Bleu', value: '#dbeafe', css: '#3b82f6' },
    { label: 'Rouge', value: '#fee2e2', css: '#ef4444' },
    { label: 'Jaune', value: '#fef3c7', css: '#f59e0b' },
    { label: 'Vert', value: '#dcfce7', css: '#22c55e' }
  ];
  colors.forEach(item => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'recent-color-swatch standard-color-swatch' + (item.value === 'none' ? ' no-color-swatch' : '');
    b.style.background = item.css;
    b.title = item.label;
    b.setAttribute('aria-label', item.label);
    if (item.value === 'none') b.textContent = '∅';
    b.addEventListener('click', e => {
      e.preventDefault();
      const nodes = selectedNodes();
      if (!nodes.length) return;
      pushHistory();
      nodes.forEach(n => n.color = item.value === 'none' ? defaultVisualStyleForNode(n).color : item.value);
      if (ctxColor) ctxColor.value = item.value === 'none' ? '#ffffff' : item.value;
      render();
    });
    recentColorsEl.appendChild(b);
  });
}
function copyStyleFromNode(node) {
  return {
    color: node.color || '#ffffff',
    fontSize: node.fontSize || 12,
    width: node.width || 210,
    height: node.height || 112,
    muted: !!node.muted
  };
}
function defaultVisualStyleForNode(node) {
  const dimensions = {
    box: { width: 220, height: 146 },
    panel: { width: 250, height: 190 },
    slider: { width: 240, height: 176 },
    switch: { width: 220, height: 150 },
    add: { width: 220, height: 154 },
    subtract: { width: 230, height: 154 },
    multiply: { width: 230, height: 154 },
    divide: { width: 220, height: 154 },
    formula: { width: 240, height: 160 },
    pdf: { width: 190, height: 170 },
    link: { width: 190, height: 166 }
  };
  const colors = {
    box: familyInfo(node.family || 'information').color,
    panel: '#fff7ad',
    slider: '#e0f2fe',
    switch: '#dcfce7',
    add: '#eef2ff',
    subtract: '#eef2ff',
    multiply: '#eef2ff',
    divide: '#eef2ff',
    formula: '#f3e8ff',
    pdf: '#f8fafc',
    link: '#ecfeff'
  };
  return {
    color: colors[node.kind] || familyInfo(node.family || 'information').color,
    fontSize: 12,
    muted: false,
    ...(dimensions[node.kind] || dimensions.box)
  };
}
function resetStyleForSelection() {
  const nodes = selectedNodes();
  if (!nodes.length) return;
  pushHistory();
  nodes.forEach(n => Object.assign(n, defaultVisualStyleForNode(n)));
  render();
  syncInspector();
  const first = nodes[0];
  if (ctxColor) ctxColor.value = rgbToHex(first.color || '#ffffff');
  if (ctxFontSize) ctxFontSize.value = first.fontSize || 12;
  setStatus(nodes.length > 1 ? `Mise en forme réinitialisée pour ${nodes.length} outils.` : 'Mise en forme réinitialisée.');
}
function applyCopiedStyleToSelectionOrNode(nodeId) {
  if (!state.formatPainter) return false;
  const target = getNode(nodeId);
  if (!target) return false;
  pushHistory();
  const ids = state.selectedNodes.has(nodeId) ? [...state.selectedNodes] : [nodeId];
  ids.map(getNode).filter(Boolean).forEach(n => Object.assign(n, state.formatPainter));
  rememberColor(state.formatPainter.color);
  state.formatPainter = null;
  document.body.classList.remove('format-painter-active');
  setStatus('Mise en forme appliquée.');
  syncInspector();
  render();
  return true;
}

function render() {
  ensureProject();
  renderProjectTabs();
  updateViewModeUI();
  updateLegendUI();
  applyTransform();
  canvas.innerHTML = '';
  svg.innerHTML = '';
  renderGroups();
  const muted = downstreamMutedNodes();
  for (const node of currentProject().nodes) renderNode(node, muted.has(node.id));
  // Les connexions sont dessinées après les outils afin d'utiliser
  // la position réelle des connecteurs dans le DOM. Cela évite les
  // décalages après zoom, redimensionnement ou changement de style CSS.
  renderConnections();
}

function renderProjectTabs() {
  projectTabs.innerHTML = '';
  state.projects.forEach(p => {
    const b = document.createElement('button');
    b.className = 'project-tab' + (p.id === state.activeProjectId ? ' active' : '');
    b.textContent = p.title;
    b.title = 'Cliquer pour ouvrir · double-clic pour renommer';
    b.onclick = () => switchProject(p.id);
    b.ondblclick = (e) => { e.preventDefault(); e.stopPropagation(); switchProject(p.id); renameProject(); };
    b.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); switchProject(p.id); renameProject(); };
    projectTabs.appendChild(b);
  });
}

function renderNode(node, muted) {
  enforceNodeMinimum(node);
  const tpl = document.getElementById('nodeTemplate');
  const el = tpl.content.firstElementChild.cloneNode(true);
  el.dataset.nodeId = node.id;
  el.classList.add(`kind-${node.kind || 'box'}`);
  el.classList.add(`family-${node.family || 'information'}`);
  el.classList.add(`status-${node.status || 'draft'}`);
  if (auditIssueForNode(node)) el.classList.add('audit-issue');
  if (muted || node.muted) el.classList.add('muted-downstream');
  if (node.muted) el.classList.add('muted-manual');
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
  el.style.width = `${node.width || 210}px`;
  el.style.height = `${node.height || 112}px`;
  el.style.background = node.color;
  el.style.setProperty('--node-font-size', `${node.fontSize || 12}px`);
  el.querySelector('.node-title').textContent = node.title;
  el.querySelector('.node-kind').textContent = displayNodeKind(node);
  const status = node.status || 'draft';
  if (status && status !== 'draft') {
    const badge = document.createElement('span');
    badge.className = `node-status-badge status-${status}`;
    badge.textContent = statusInfo(status).icon + ' ' + statusInfo(status).short;
    badge.title = 'Statut : ' + statusInfo(status).label;
    el.querySelector('.node-header').appendChild(badge);
  }
  if (node.comment && String(node.comment).trim()) {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'comment-dot';
    dot.title = node.comment;
    dot.setAttribute('aria-label', 'Commentaire : ' + node.comment);
    dot.addEventListener('pointerdown', e => e.stopPropagation());
    dot.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      editNodeComment(node.id);
    });
    el.querySelector('.node-header').appendChild(dot);
  }
  if (state.selectedNodes.has(node.id)) el.classList.add('selected');
  if (node.groupId) el.classList.add('grouped');
  el.querySelector('.node-header').addEventListener('pointerdown', e => startDrag(e, node));
  el.addEventListener('pointerdown', e => {
    if (e.target.classList.contains('port') || e.target.classList.contains('port-remove') || e.target.closest('.node-control')) return;
    if (e.shiftKey) selectNode(node.id, true);
    else if (!state.selectedNodes.has(node.id)) selectNode(node.id, false);
  });
  el.addEventListener('dblclick', e => {
    if (e.target.classList.contains('port') || e.target.classList.contains('port-label') || e.target.closest('.node-control')) return;
    e.preventDefault();
    e.stopPropagation();
    if (!state.selectedNodes.has(node.id)) selectNode(node.id, e.shiftKey);
    showContextMenu(e.clientX, e.clientY, node.id);
  });
  el.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    if (state.formatPainter) {
      applyCopiedStyleToSelectionOrNode(node.id);
      return;
    }
    if (!state.selectedNodes.has(node.id)) selectNode(node.id, e.shiftKey);
    showContextMenu(e.clientX, e.clientY, node.id);
  });
  const left = el.querySelector('.ports.left');
  const right = el.querySelector('.ports.right');
  node.leftPorts.forEach(p => left.appendChild(portRow(node, p, 'left')));
  left.appendChild(portAddButton(node, 'left'));
  node.rightPorts.forEach(p => right.appendChild(portRow(node, p, 'right')));
  right.appendChild(portAddButton(node, 'right'));
  renderNodeContent(node, el.querySelector('.node-content'));
  const resizer = document.createElement('div');
  resizer.className = 'node-resizer';
  resizer.title = 'Redimensionner';
  resizer.addEventListener('pointerdown', e => startResize(e, node));
  el.appendChild(resizer);
  canvas.appendChild(el);
}

function displayNodeKind(node) {
  if ((node.kind || 'box') === 'box') return familyInfo(node.family).short;
  return kindLabel(node.kind);
}

function kindLabel(kind) {
  return ({
    box: 'BOX', panel: 'PANEL', slider: 'SLIDER', switch: 'BOOL',
    add: 'ADD', subtract: 'SUB', multiply: 'MUL', divide: 'DIV', formula: 'FORMULE', pdf: 'FICHIER', link: 'LIEN'
  })[kind || 'box'] || 'BOX';
}

function isCalculationKind(kind) {
  return ['add', 'subtract', 'multiply', 'divide', 'formula'].includes(kind);
}

function incomingConnection(nodeId, portId) {
  return currentProject().connections.find(c => c.to.nodeId === nodeId && c.to.portId === portId);
}

function outputValue(nodeId, visited = new Set()) {
  const node = getNode(nodeId);
  if (!node) return null;
  if (visited.has(nodeId)) return null;
  visited.add(nodeId);

  if (node.kind === 'slider') return Number(node.value) || 0;
  if (node.kind === 'switch') return !!node.value;
  if (node.kind === 'panel') {
    const v = inputValue(node, 0, visited);
    return v !== null && v !== undefined ? v : node.text;
  }
  if (node.kind === 'box') {
    const v = inputValue(node, 0, visited);
    return v !== null && v !== undefined ? v : null;
  }
  if (isCalculationKind(node.kind)) return calculateNode(node, visited);
  if (node.kind === 'link') return node.url || null;
  return inputValue(node, 0, visited);
}

function inputValue(node, index = 0, visited = new Set()) {
  const port = node.leftPorts[index];
  if (!port) return null;
  const c = incomingConnection(node.id, port.id);
  if (!c) return null;
  return outputValue(c.from.nodeId, new Set(visited));
}

function numericInputs(node, visited = new Set()) {
  return node.leftPorts.map((_, i) => {
    const v = inputValue(node, i, visited);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  });
}

function calculateNode(node, visited = new Set()) {
  const nums = numericInputs(node, visited);
  const a = nums[0] ?? 0;
  const b = nums[1] ?? 0;
  if (node.kind === 'add') return nums.reduce((sum, v) => sum + v, 0);
  if (node.kind === 'multiply') return nums.length ? nums.reduce((prod, v) => prod * v, 1) : 0;
  if (node.kind === 'subtract') return nums.slice(1).reduce((res, v) => res - v, a);
  if (node.kind === 'divide') {
    if (b === 0) return 'Erreur : division par zéro';
    return nums.slice(1).reduce((res, v) => v === 0 ? 'Erreur : division par zéro' : res / v, a);
  }
  if (node.kind === 'formula') return evaluateFormula(node, nums);
  return null;
}

function safeVarName(label, index) {
  const base = String(label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_$]/g, '_').replace(/^[^a-zA-Z_$]+/, '');
  return base || ['x','y','z','a','b','c'][index] || `v${index + 1}`;
}

function evaluateFormula(node, nums) {
  try {
    const names = node.leftPorts.map((p, i) => safeVarName(p.label, i));
    const alias = ['x','y','z','a','b','c'];
    const allNames = [...names];
    const allVals = [...nums];
    alias.forEach((name, i) => { if (!allNames.includes(name)) { allNames.push(name); allVals.push(nums[i] ?? 0); } });
    const fn = new Function(...allNames, 'Math', `"use strict"; return (${node.formula || '0'});`);
    const result = fn(...allVals, Math);
    return Number.isFinite(result) ? result : String(result);
  } catch {
    return 'Erreur formule';
  }
}

function formatValue(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(6)));
  return String(v);
}


function normalizeUrl(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  return /^https?:\/\//i.test(u) ? u : 'https://' + u;
}
function editLinkNode(nodeId) {
  const node = getNode(nodeId);
  if (!node) return;
  const value = prompt('Lien internet à associer à cet outil', node.url || 'https://');
  if (value === null) return;
  pushHistory();
  node.url = String(value || '').trim();
  if (node.url && (!node.title || node.title === 'Lien internet')) {
    try { node.title = new URL(normalizeUrl(node.url)).hostname; } catch { node.title = 'Lien internet'; }
  }
  render();
  setStatus(node.url ? 'Lien internet ajouté.' : 'Lien supprimé.');
}

function attachPdfToNode(nodeId) {
  const node = getNode(nodeId);
  if (!node) return;
  pendingPdfNodeId = nodeId;
  pdfFileInput?.click();
}

function openPdfNode(node) {
  if (!node?.fileData) return attachPdfToNode(node.id);
  try {
    const blob = dataUrlToBlob(node.fileData, node.fileType || 'application/octet-stream');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setStatus(`Fichier ouvert : ${node.fileName || 'fichier'}`);
  } catch (err) {
    console.error(err);
    alert('Impossible d’ouvrir ce fichier. Essaie de le rattacher.');
  }
}

function dataUrlToBlob(dataUrl, fallbackType = 'application/octet-stream') {
  const parts = String(dataUrl).split(',');
  const meta = parts[0] || '';
  const b64 = parts[1] || '';
  const type = (meta.match(/data:([^;]+)/) || [])[1] || fallbackType;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

function handlePdfFileSelected(file) {
  const node = pendingPdfNodeId ? getNode(pendingPdfNodeId) : null;
  pendingPdfNodeId = null;
  if (!node || !file) return;
  const reader = new FileReader();
  reader.onload = () => {
    pushHistory();
    node.fileName = file.name;
    node.fileType = file.type || 'application/octet-stream';
    node.fileData = reader.result;
    node.title = node.title && node.title !== 'Fichier joint' && node.title !== 'Fichier joint' ? node.title : file.name.replace(/\.[^.]+$/i, '');
    render();
    setStatus(`Fichier attaché : ${file.name}`);
  };
  reader.onerror = () => alert('Impossible de lire ce fichier.');
  reader.readAsDataURL(file);
}

function renderActivityTags(node) {
  const container = document.createElement('div');
  container.className = 'activity-tags-block node-control';

  node.activityTags = normalizeActivityTags(node.activityTags);
  const allActive = Object.keys(ACTIVITY_TAGS).every(key => !!node.activityTags[key]);

  const allLine = document.createElement('label');
  allLine.className = 'activity-all-toggle';
  allLine.title = allActive ? 'Désactiver les 3 catégories' : 'Activer les 3 catégories';
  const allInput = document.createElement('input');
  allInput.type = 'checkbox';
  allInput.checked = allActive;
  allInput.addEventListener('pointerdown', e => e.stopPropagation());
  allInput.addEventListener('click', e => {
    e.stopPropagation();
  });
  allInput.addEventListener('change', e => {
    e.preventDefault();
    e.stopPropagation();
    pushHistory();
    const next = !!allInput.checked;
    node.activityTags = normalizeActivityTags(node.activityTags);
    Object.keys(ACTIVITY_TAGS).forEach(key => node.activityTags[key] = next);
    render();
    setStatus(next ? 'Les 3 catégories sont activées.' : 'Les 3 catégories sont désactivées.');
  });
  const allText = document.createElement('span');
  allText.textContent = 'Tout';
  allLine.append(allInput, allText);

  const wrap = document.createElement('div');
  wrap.className = 'activity-tags';
  Object.entries(ACTIVITY_TAGS).forEach(([key, cfg]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'activity-tag ' + (node.activityTags?.[key] ? 'active' : 'inactive');
    btn.title = cfg.label + (node.activityTags?.[key] ? ' — cliquer pour désactiver' : ' — cliquer pour activer');
    btn.setAttribute('aria-label', cfg.label);
    btn.textContent = cfg.icon;
    btn.addEventListener('pointerdown', e => e.stopPropagation());
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      pushHistory();
      node.activityTags = normalizeActivityTags(node.activityTags);
      node.activityTags[key] = !node.activityTags[key];
      render();
      setStatus(`${cfg.label} ${node.activityTags[key] ? 'activé' : 'désactivé'}.`);
    });
    wrap.appendChild(btn);
  });
  container.append(allLine, wrap);
  return container;
}

function renderNodeContent(node, content) {
  content.innerHTML = '';
  content.appendChild(renderActivityTags(node));
  if (node.kind === 'panel') {
    const v = inputValue(node, 0);
    if (v !== null && v !== undefined) {
      const result = document.createElement('div');
      result.className = 'panel-result';
      result.textContent = formatValue(v);
      content.appendChild(result);
      return;
    }
    const ta = document.createElement('textarea');
    ta.className = 'node-control panel-text';
    ta.value = node.text || '';
    ta.placeholder = 'Texte libre';
    ta.addEventListener('input', () => { node.text = ta.value; });
    content.appendChild(ta);
    return;
  }
  if (node.kind === 'pdf') {
    const wrap = document.createElement('div');
    wrap.className = 'node-control pdf-widget';
    const icon = document.createElement('button');
    icon.type = 'button';
    icon.className = 'pdf-file-button ' + (node.fileData ? 'has-file' : 'empty-file');
    icon.title = node.fileData ? 'Ouvrir le fichier dans une nouvelle fenêtre' : 'Ajouter un fichier';
    icon.innerHTML = node.fileData ? '<span class="pdf-emoji">📄</span><span>Fichier présent</span>' : '<span class="pdf-emoji">📎</span><span>Ajouter un fichier</span>';
    icon.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (node.fileData) openPdfNode(node);
      else attachPdfToNode(node.id);
    });
    const name = document.createElement('div');
    name.className = 'pdf-file-name';
    name.textContent = node.fileData ? (node.fileName || 'fichier') : 'Aucun fichier attaché';
    const replace = document.createElement('button');
    replace.type = 'button';
    replace.className = 'pdf-small-action';
    replace.textContent = node.fileData ? 'Remplacer' : 'Choisir';
    replace.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); attachPdfToNode(node.id); });
    wrap.append(icon, name, replace);
    content.appendChild(wrap);
    return;
  }

  if (node.kind === 'link') {
    const wrap = document.createElement('div');
    wrap.className = 'node-control link-widget';
    const icon = document.createElement('button');
    icon.type = 'button';
    icon.className = 'link-button ' + (node.url ? 'has-link' : 'empty-link');
    icon.title = node.url ? 'Ouvrir le lien dans un nouvel onglet' : 'Ajouter un lien internet';
    icon.innerHTML = node.url ? '<span class="link-emoji">🔗</span><span>Lien présent</span>' : '<span class="link-emoji">➕</span><span>Ajouter un lien</span>';
    icon.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (node.url) window.open(normalizeUrl(node.url), '_blank', 'noopener');
      else editLinkNode(node.id);
    });
    const name = document.createElement('div');
    name.className = 'link-url-name';
    name.textContent = node.url ? node.url : 'Aucun lien attaché';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'pdf-small-action';
    edit.textContent = node.url ? 'Modifier' : 'Choisir';
    edit.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); editLinkNode(node.id); });
    wrap.append(icon, name, edit);
    content.appendChild(wrap);
    return;
  }

  if (node.kind === 'slider') {
    const wrap = document.createElement('div'); wrap.className = 'node-control slider-wrap';
    const value = document.createElement('input'); value.type = 'number'; value.value = node.value; value.min = node.min; value.max = node.max;
    const range = document.createElement('input'); range.type = 'range'; range.value = node.value; range.min = node.min; range.max = node.max;
    const limits = document.createElement('div'); limits.className = 'slider-limits';
    const min = document.createElement('input'); min.type = 'number'; min.value = node.min; min.title = 'Minimum';
    const max = document.createElement('input'); max.type = 'number'; max.value = node.max; max.title = 'Maximum';
    const updateRange = () => { range.min = node.min; range.max = node.max; value.min = node.min; value.max = node.max; range.value = node.value; value.value = node.value; };
    value.oninput = () => { node.value = Number(value.value); range.value = node.value; };
    range.oninput = () => { node.value = Number(range.value); value.value = node.value; };
    min.onchange = () => { node.min = Number(min.value); if (node.value < node.min) node.value = node.min; updateRange(); };
    max.onchange = () => { node.max = Number(max.value); if (node.value > node.max) node.value = node.max; updateRange(); };
    limits.append(min, max); wrap.append(value, range, limits); content.appendChild(wrap); return;
  }
  if (node.kind === 'switch') {
    const label = document.createElement('label'); label.className = 'node-control switch-control';
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!node.value;
    const pill = document.createElement('span'); pill.textContent = node.value ? 'Vrai' : 'Faux';
    input.onchange = () => { node.value = input.checked; render(); };
    label.append(input, pill); content.appendChild(label); return;
  }
  if (isCalculationKind(node.kind)) {
    const preview = document.createElement('div');
    preview.className = 'calc-preview';
    preview.textContent = `Résultat : ${formatValue(calculateNode(node)) || '—'}`;
    content.appendChild(preview);
    return;
  }
  const hint = document.createElement('div');
  hint.className = 'empty-box-hint';
  hint.textContent = ' ';
  content.appendChild(hint);
}

function portRow(node, p, side) {
  const row = document.createElement('div'); row.className = 'port-row';
  row.dataset.nodeId = node.id; row.dataset.portId = p.id; row.dataset.side = side;
  row.title = `${side === 'left' ? 'Entrée' : 'Sortie'} : ${p.label}`;
  const dot = document.createElement('div'); dot.className = 'port';
  dot.dataset.nodeId = node.id; dot.dataset.portId = p.id; dot.dataset.side = side;
  dot.title = `${side === 'left' ? 'Entrée' : 'Sortie'} : ${p.label}`;
  if (state.portDraft?.portId === p.id) dot.classList.add('active');
  const label = document.createElement('span'); label.className = 'port-label'; label.textContent = p.label; label.title = p.label;
  const remove = document.createElement('span'); remove.className = 'port-remove'; remove.textContent = '×';
  row.addEventListener('pointerdown', e => {
    if (e.target.classList.contains('port-remove')) return;
    startConnectionDrag(e, node, p, side);
  });
  row.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); showPortMenu(node.id, p.id, side, e.clientX, e.clientY); });
  dot.addEventListener('dblclick', e => { e.stopPropagation(); renamePort(p); });
  label.addEventListener('dblclick', e => { e.stopPropagation(); renamePort(p); });
  remove.addEventListener('click', e => { e.stopPropagation(); removePort(node.id, p.id, side); });
  row.append(dot, label, remove); return row;
}


function portAddButton(node, side) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `port-add port-add-${side}`;
  btn.title = side === 'left' ? 'Ajouter une entrée' : 'Ajouter une sortie';
  btn.textContent = '+';
  btn.addEventListener('pointerdown', e => e.stopPropagation());
  btn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    pushHistory();
    const arrName = side === 'left' ? 'leftPorts' : 'rightPorts';
    const fallback = side === 'left' ? 'Entrée' : 'Sortie';
    node[arrName].push({ id: uid('port'), label: `${fallback} ${node[arrName].length + 1}`, connectionStyle: '' });
    render();
    setStatus(`${fallback} ajoutée.`);
  });
  return btn;
}

function openCommentModalForNodes(nodes, title = 'Commentaire') {
  if (!commentModal || !commentTextInput || !nodes.length) return;
  state.commentEditTargets = nodes.map(n => n.id);
  if (commentModalTitle) commentModalTitle.textContent = title;
  commentTextInput.value = nodes.length === 1 ? (nodes[0].comment || '') : '';
  if (commentDeleteBtn) commentDeleteBtn.hidden = nodes.length > 1 && !nodes.some(n => n.comment);
  commentModal.hidden = false;
  hideContextMenu();
  requestAnimationFrame(() => {
    commentTextInput.focus();
    commentTextInput.setSelectionRange(commentTextInput.value.length, commentTextInput.value.length);
  });
}

function closeCommentModal() {
  if (commentModal) commentModal.hidden = true;
  state.commentEditTargets = [];
}

function saveCommentModal() {
  const ids = state.commentEditTargets || [];
  const nodes = ids.map(getNode).filter(Boolean);
  if (!nodes.length) return closeCommentModal();
  pushHistory();
  const value = String(commentTextInput?.value || '').trim();
  nodes.forEach(n => n.comment = value);
  closeCommentModal();
  render();
  setStatus(value ? 'Commentaire enregistré.' : 'Commentaire supprimé.');
}

function deleteCommentModal() {
  const ids = state.commentEditTargets || [];
  const nodes = ids.map(getNode).filter(Boolean);
  if (!nodes.length) return closeCommentModal();
  pushHistory();
  nodes.forEach(n => n.comment = '');
  closeCommentModal();
  render();
  setStatus('Commentaire supprimé.');
}

function editNodeComment(nodeId) {
  const node = getNode(nodeId);
  if (!node) return;
  openCommentModalForNodes([node], 'Commentaire de l’outil');
}

function commentSelection() {
  const nodes = selectedNodes();
  if (!nodes.length) return;
  openCommentModalForNodes(nodes, nodes.length === 1 ? 'Commentaire de l’outil' : `Commentaire commun (${nodes.length} outils)`);
}

function renamePort(p) { const next = prompt('Nom du connecteur', p.label); if (next) { pushHistory(); p.label = next; render(); } }
function removePort(nodeId, portId, side) {
  const node = getNode(nodeId); const arr = side === 'left' ? node.leftPorts : node.rightPorts;
  if (arr.length <= 1) return alert('Impossible : il faut garder au moins un connecteur de ce côté.');
  if (!confirm('Supprimer ce connecteur et ses liens ?')) return;
  pushHistory();
  node[side === 'left' ? 'leftPorts' : 'rightPorts'] = arr.filter(p => p.id !== portId);
  currentProject().connections = currentProject().connections.filter(c => c.from.portId !== portId && c.to.portId !== portId);
  render();
}

function connectionEndpoints(start, target) {
  if (!target || start.nodeId === target.nodeId || start.side === target.side) return null;
  if (start.side === 'right' && target.side === 'left') {
    return { from: { nodeId: start.nodeId, portId: start.portId }, to: { nodeId: target.nodeId, portId: target.portId } };
  }
  if (start.side === 'left' && target.side === 'right') {
    return { from: { nodeId: target.nodeId, portId: target.portId }, to: { nodeId: start.nodeId, portId: start.portId } };
  }
  return null;
}

function curvePath(a, b) {
  const dx = Math.max(80, Math.abs(b.x - a.x) * .45);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

function startConnectionDrag(e, node, port, side) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const start = { nodeId: node.id, portId: port.id, side };
  const startPos = portPosition(node.id, port.id);
  if (!startPos) return;
  const preview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  preview.setAttribute('class', 'connection preview');
  preview.setAttribute('d', curvePath(startPos, startPos));
  svg.appendChild(preview);
  setStatus(e.shiftKey ? 'Glisse vers un connecteur lié pour supprimer la liaison.' : 'Glisse vers un connecteur opposé pour créer la liaison.');

  const onMove = ev => {
    const pos = screenToCanvas(ev.clientX, ev.clientY);
    const a = side === 'right' ? startPos : pos;
    const b = side === 'right' ? pos : startPos;
    preview.setAttribute('d', curvePath(a, b));
  };

  const onUp = ev => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    preview.remove();
    const targetEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.port, .port-row');
    const target = targetEl ? { nodeId: targetEl.dataset.nodeId, portId: targetEl.dataset.portId, side: targetEl.dataset.side } : null;
    const ends = connectionEndpoints(start, target);
    if (!ends) { setStatus('Connexion annulée.'); return render(); }
    const p = currentProject();
    const matches = p.connections.filter(c => c.from.nodeId === ends.from.nodeId && c.from.portId === ends.from.portId && c.to.nodeId === ends.to.nodeId && c.to.portId === ends.to.portId);
    if (ev.shiftKey || e.shiftKey) {
      if (!matches.length) setStatus('Aucune liaison correspondante à supprimer.');
      else {
        pushHistory();
        const ids = new Set(matches.map(c => c.id));
        p.connections = p.connections.filter(c => !ids.has(c.id));
        setStatus(matches.length > 1 ? `${matches.length} liaisons supprimées.` : 'Liaison supprimée.');
      }
      return render();
    }
    if (matches.length) setStatus('Cette liaison existe déjà.');
    else {
      pushHistory();
      p.connections.push({ id: uid('conn'), from: ends.from, to: ends.to });
      setStatus('Connexion créée.');
    }
    render();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}


function chooseConnectionLineStyle(nodeId, portId, side) {
  const info = getPort(nodeId, portId);
  if (!info) return;
  const current = info.port.connectionStyle || '';
  const list = CONNECTION_LINE_STYLES.map((s, i) => `${i}. ${s.label}${s.key === current ? '  (actuel)' : ''}`).join('\n');
  const scope = side === 'left'
    ? 'Ce style s appliquera a toutes les connexions qui arrivent dans cette entree, sauf celles qui ont un style specifique depuis leur sortie.'
    : 'Ce style s appliquera aux connexions qui partent de cette sortie et primera sur le style des entrees.';
  const choice = prompt(`Style de ligne\n${scope}\n\n${list}\n\nTape le numero du style.`);
  if (choice === null || choice === '') return;
  const picked = CONNECTION_LINE_STYLES[Number(choice)];
  if (!picked) return alert('Numero invalide.');
  pushHistory();
  info.port.connectionStyle = picked.key;
  setStatus(`${side === 'left' ? 'Entrée' : 'Sortie'} : style ${picked.label}.`);
  render();
}

function clearConnectionLineStyle(nodeId, portId, side) {
  const info = getPort(nodeId, portId);
  if (!info) return;
  if (!info.port.connectionStyle) return setStatus('Ce connecteur utilise deja le style par defaut.');
  pushHistory();
  info.port.connectionStyle = '';
  setStatus(`Style de ligne du connecteur remis par defaut.`);
  render();
}

function connectionLabelFor(endpoint) {
  const n = getNode(endpoint.nodeId);
  const info = getPort(endpoint.nodeId, endpoint.portId);
  return `${n?.title || 'Outil'} / ${info?.port?.label || 'connecteur'}`;
}

function relatedLinksForPort(portId) {
  return currentProject().connections.filter(c => c.from.portId === portId || c.to.portId === portId);
}

function hidePortMenu() {
  if (!portMenu) return;
  portMenu.hidden = true;
  portMenu.innerHTML = '';
}

function setPortConnectionStyle(nodeId, portId, side, styleKey) {
  const info = getPort(nodeId, portId);
  if (!info) return;
  pushHistory();
  info.port.connectionStyle = styleKey;
  const picked = lineStyleLabel(styleKey || '');
  setStatus(`${side === 'left' ? 'Entrée' : 'Sortie'} : style ${picked}.`);
  hidePortMenu();
  render();
}

function disconnectConnectionsFromPort(portId, connectionIds) {
  const p = currentProject();
  const ids = new Set(connectionIds);
  const count = p.connections.filter(c => ids.has(c.id)).length;
  if (!count) return setStatus('Aucune liaison à supprimer.');
  pushHistory();
  p.connections = p.connections.filter(c => !ids.has(c.id));
  setStatus(count > 1 ? `${count} liaisons supprimées.` : 'Liaison supprimée.');
  hidePortMenu();
  render();
}

function stylePreviewElement(styleKey) {
  const cfg = lineStyleConfig(styleKey);
  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEl.setAttribute('viewBox', '0 0 64 14');
  svgEl.setAttribute('class', 'line-style-preview');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M4 7 H60');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', String(cfg.width));
  path.setAttribute('stroke-linecap', cfg.cap);
  if (cfg.dash) path.setAttribute('stroke-dasharray', cfg.dash);
  svgEl.appendChild(path);
  return svgEl;
}

function showPortMenu(nodeId, portId, side, x, y) {
  const info = getPort(nodeId, portId);
  if (!info || !portMenu) return;
  hideContextMenu();
  const links = relatedLinksForPort(portId);
  const current = info.port.connectionStyle || '';
  const scopeText = side === 'left'
    ? 'Style appliqué à toutes les connexions qui arrivent ici, sauf styles définis sur une sortie.'
    : 'Style appliqué uniquement aux liaisons partant de cette sortie. Prioritaire sur les entrées.';

  portMenu.innerHTML = '';
  portMenu.hidden = false;
  portMenu.dataset.nodeId = nodeId;
  portMenu.dataset.portId = portId;

  const title = document.createElement('div');
  title.className = 'port-menu-title';
  title.innerHTML = `<span class="port-menu-icon">${side === 'left' ? '▌' : '●'}</span><div><strong>${side === 'left' ? 'Entrée' : 'Sortie'} : ${info.port.label}</strong><small>${scopeText}</small></div>`;
  portMenu.appendChild(title);

  const styleBlock = document.createElement('div');
  styleBlock.className = 'port-menu-section';
  const styleHead = document.createElement('div');
  styleHead.className = 'port-menu-section-title';
  styleHead.textContent = 'Style de connexion';
  styleBlock.appendChild(styleHead);

  const styleGrid = document.createElement('div');
  styleGrid.className = 'line-style-grid';
  CONNECTION_LINE_STYLES.forEach(style => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `line-style-option ${style.key === current ? 'active' : ''}`;
    btn.title = style.label;
    btn.appendChild(stylePreviewElement(style.key));
    const label = document.createElement('span');
    label.textContent = style.label.replace('Par defaut / ', '');
    btn.appendChild(label);
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      setPortConnectionStyle(nodeId, portId, side, style.key);
    });
    styleGrid.appendChild(btn);
  });
  styleBlock.appendChild(styleGrid);
  portMenu.appendChild(styleBlock);

  const disconnectBlock = document.createElement('div');
  disconnectBlock.className = 'port-menu-section';
  const disconnectBtn = document.createElement('button');
  disconnectBtn.type = 'button';
  disconnectBtn.className = 'disconnect-main-btn';
  disconnectBtn.disabled = !links.length;
  disconnectBtn.innerHTML = `<span class="disconnect-icon">⛓️‍💥</span><span>Déconnecter</span><small>${links.length ? `${links.length} liaison${links.length > 1 ? 's' : ''}` : 'Aucune liaison'}</small>`;
  const sub = document.createElement('div');
  sub.className = 'disconnect-submenu';
  sub.hidden = true;

  if (links.length) {
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'disconnect-option disconnect-all';
    all.innerHTML = `<strong>Tout déconnecter</strong><small>${links.length} liaison${links.length > 1 ? 's' : ''}</small>`;
    all.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      disconnectConnectionsFromPort(portId, links.map(c => c.id));
    });
    sub.appendChild(all);

    links.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'disconnect-option';
      const other = c.from.portId === portId ? c.to : c.from;
      const direction = c.from.portId === portId ? 'vers' : 'depuis';
      b.innerHTML = `<span>${direction} ${connectionLabelFor(other)}</span><small>${connectionLabelFor(c.from)} → ${connectionLabelFor(c.to)}</small>`;
      b.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        disconnectConnectionsFromPort(portId, [c.id]);
      });
      sub.appendChild(b);
    });
  }
  disconnectBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (!links.length) return;
    sub.hidden = !sub.hidden;
  });
  disconnectBlock.append(disconnectBtn, sub);
  portMenu.appendChild(disconnectBlock);

  const rectMargin = 12;
  portMenu.style.left = `${Math.min(x, window.innerWidth - 360 - rectMargin)}px`;
  portMenu.style.top = `${Math.min(y, window.innerHeight - 520 - rectMargin)}px`;
  requestAnimationFrame(() => {
    const r = portMenu.getBoundingClientRect();
    if (r.right > window.innerWidth - rectMargin) portMenu.style.left = `${window.innerWidth - r.width - rectMargin}px`;
    if (r.bottom > window.innerHeight - rectMargin) portMenu.style.top = `${window.innerHeight - r.height - rectMargin}px`;
  });
}

function portContextMenu(nodeId, portId, side) {
  showPortMenu(nodeId, portId, side, window.innerWidth / 2 - 160, window.innerHeight / 2 - 180);
}

function getConnectionLineStyle(c) {
  const out = getPort(c.from.nodeId, c.from.portId)?.port?.connectionStyle || '';
  const inn = getPort(c.to.nodeId, c.to.portId)?.port?.connectionStyle || '';
  return out || inn || 'solid';
}

function applyConnectionLineStyle(path, c) {
  const cfg = lineStyleConfig(getConnectionLineStyle(c));
  path.style.strokeDasharray = cfg.dash;
  path.style.strokeWidth = `${cfg.width + (state.selectedConnection === c.id ? 1 : 0)}px`;
  path.style.strokeLinecap = cfg.cap;
}

function disconnectPortMenu(nodeId, portId) {
  const p = currentProject();
  const links = p.connections.filter(c => c.from.portId === portId || c.to.portId === portId);
  if (!links.length) return setStatus('Aucune liaison sur ce connecteur.');
  const labelFor = (endpoint) => {
    const n = getNode(endpoint.nodeId);
    const info = getPort(endpoint.nodeId, endpoint.portId);
    return `${n?.title || 'Outil'} / ${info?.port?.label || 'connecteur'}`;
  };
  let picked = links[0];
  if (links.length > 1) {
    const list = links.map((c, i) => `${i + 1}. ${labelFor(c.from)} → ${labelFor(c.to)}`).join('\n');
    const choice = prompt(`Quelle liaison déconnecter ?\n${list}\n\nTape le numéro, ou "tout" pour tout déconnecter.`);
    if (!choice) return;
    if (choice.toLowerCase().trim() === 'tout') {
      pushHistory();
      const ids = new Set(links.map(c => c.id));
      p.connections = p.connections.filter(c => !ids.has(c.id));
      setStatus(`${links.length} liaisons supprimées.`);
      return render();
    }
    picked = links[Number(choice) - 1];
    if (!picked) return alert('Numéro invalide.');
  } else if (!confirm(`Déconnecter : ${labelFor(links[0].from)} → ${labelFor(links[0].to)} ?`)) return;
  pushHistory();
  p.connections = p.connections.filter(c => c.id !== picked.id);
  setStatus('Liaison supprimée.');
  render();
}

function renderConnections() { currentProject().connections.forEach(drawConnection); }
function drawConnection(c) {
  const a = portPosition(c.from.nodeId, c.from.portId), b = portPosition(c.to.nodeId, c.to.portId); if (!a || !b) return;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', curvePath(a, b));
  path.setAttribute('class', `connection ${state.selectedConnection === c.id ? 'selected' : ''}`);
  applyConnectionLineStyle(path, c);
  path.style.pointerEvents = 'stroke';
  path.addEventListener('click', e => { e.stopPropagation(); state.selectedConnection = c.id; state.selectedNodes.clear(); syncInspector(); render(); });
  svg.appendChild(path);
}
function portPosition(nodeId, portId) {
  const info = getPort(nodeId, portId);
  if (!info) return null;

  // Priorité à la position réelle affichée : le connecteur peut bouger
  // selon le zoom, la taille de la box, le nombre de ports ou le CSS.
  // On lit donc son centre visuel, puis on le reconvertit en coordonnées canvas.
  const candidates = Array.from(canvas.querySelectorAll('.port, .port-row'));
  const el = candidates.find(item => item.dataset.nodeId === nodeId && item.dataset.portId === portId && item.dataset.side === info.side);
  if (el) {
    const dot = el.classList.contains('port-row') ? el.querySelector('.port') || el : el;
    const r = dot.getBoundingClientRect();
    if (r.width || r.height) {
      return screenToCanvas(r.left + r.width / 2, r.top + r.height / 2);
    }
  }

  // Secours géométrique si le DOM n'est pas encore prêt.
  const node = getNode(nodeId);
  if (!node) return null;
  const arr = info.side === 'left' ? node.leftPorts : node.rightPorts;
  const index = arr.findIndex(p => p.id === portId), count = arr.length;
  const w = node.width || 210;
  const h = node.height || 112;
  const spacing = 27;
  const centerY = node.y + h / 2;
  const x = info.side === 'left' ? node.x + 7 : node.x + w + 18;
  return { x, y: centerY + (index - (count - 1) / 2) * spacing };
}

function downstreamMutedNodes() {
  const p = currentProject(); const muted = new Set();
  const starts = p.nodes.filter(n => n.kind === 'switch' && !n.value).map(n => n.id);
  const walk = id => p.connections.filter(c => c.from.nodeId === id).forEach(c => { if (!muted.has(c.to.nodeId)) { muted.add(c.to.nodeId); walk(c.to.nodeId); } });
  starts.forEach(walk); return muted;
}

function startDrag(e, node) {
  e.stopPropagation();
  pushHistory();
  if (e.shiftKey) selectNode(node.id, true);
  else if (!state.selectedNodes.has(node.id)) selectNode(node.id, false);
  const start = screenToCanvas(e.clientX, e.clientY);
  const moving = selectedNodes().map(n => ({ id: n.id, x: n.x, y: n.y }));
  const onMove = ev => { const p = screenToCanvas(ev.clientX, ev.clientY); const dx = p.x - start.x, dy = p.y - start.y; moving.forEach(m => { const n = getNode(m.id); n.x = snap(m.x + dx); n.y = snap(m.y + dy); }); render(); };
  const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
}
function snap(v) { return Math.round(v / 12) * 12; }
function screenToCanvas(x, y) { const r = workspace.getBoundingClientRect(); const p = currentProject(); return { x: (x - r.left - p.panX) / p.scale, y: (y - r.top - p.panY) / p.scale }; }
function applyTransform() { const p = currentProject(); const t = `translate(${p.panX}px, ${p.panY}px) scale(${p.scale})`; canvas.style.transform = t; svg.style.transform = t; }


function setViewMode(mode) {
  state.viewMode = ['edit', 'read', 'audit'].includes(mode) ? mode : 'edit';
  updateViewModeUI();
  render();
  const labels = { edit: 'édition', read: 'lecture', audit: 'audit' };
  setStatus(`Mode ${labels[state.viewMode]} activé.`);
}

function updateViewModeUI() {
  document.body.classList.toggle('mode-read', state.viewMode === 'read');
  document.body.classList.toggle('mode-audit', state.viewMode === 'audit');
  document.body.classList.toggle('mode-edit', state.viewMode === 'edit');
  document.getElementById('editModeBtn')?.classList.toggle('active', state.viewMode === 'edit');
  document.getElementById('readModeBtn')?.classList.toggle('active', state.viewMode === 'read');
  document.getElementById('auditModeBtn')?.classList.toggle('active', state.viewMode === 'audit');
}

function toggleLegend() {
  state.legendVisible = !state.legendVisible;
  updateLegendUI();
}

function updateLegendUI() {
  if (legendPanel) legendPanel.hidden = !state.legendVisible;
  document.getElementById('legendToggleBtn')?.classList.toggle('active', !!state.legendVisible);
}

function auditIssueForNode(node) {
  const p = currentProject();
  const hasIncoming = p.connections.some(c => c.to.nodeId === node.id);
  const hasOutgoing = p.connections.some(c => c.from.nodeId === node.id);
  if ((node.status || 'draft') === 'check' || (node.status || 'draft') === 'error') return true;
  if (node.comment && String(node.comment).trim()) return true;
  if ((node.family || 'information') === 'information' && !hasIncoming) return true;
  if (isCalculationKind(node.kind) && (!hasIncoming || !hasOutgoing)) return true;
  return false;
}

function autoLayoutByFamily() {
  const p = currentProject();
  const nodes = selectedNodes().length ? selectedNodes() : p.nodes;
  if (!nodes.length) return setStatus('Aucun outil à organiser.');
  pushHistory();
  const columns = {
    source: [], information: [], criterion: [], datatype: [], tool: [], math: [], result: []
  };
  for (const n of nodes) {
    const family = n.family || 'information';
    const hasIncoming = p.connections.some(c => c.to.nodeId === n.id);
    if (family === 'source' || n.kind === 'pdf' || n.kind === 'link') columns.source.push(n);
    else if (family === 'criterion') columns.criterion.push(n);
    else if (family === 'datatype') columns.datatype.push(n);
    else if (family === 'tool') columns.tool.push(n);
    else if (family === 'result' || (n.kind === 'panel' && hasIncoming)) columns.result.push(n);
    else if (isCalculationKind(n.kind) || n.kind === 'slider' || n.kind === 'switch') columns.math.push(n);
    else columns.information.push(n);
  }
  const xMap = { source: 120, information: 390, criterion: 660, datatype: 930, tool: 1200, math: 1470, result: 1740 };
  Object.entries(columns).forEach(([key, list]) => {
    list.sort((a,b) => (a.y - b.y) || a.x - b.x);
    list.forEach((n, i) => {
      n.x = xMap[key];
      n.y = 110 + i * 210;
    });
  });
  render();
  fitViewToNodes(nodes);
  setStatus('Organisation automatique par famille appliquée : Source → Information → Critère → Type → Outil/Calcul → Résultat.');
}

function nodeSearchText(node) {
  return [
    node.title, node.text, node.comment, node.fileName, node.url, node.formula,
    kindLabel(node.kind), familyInfo(node.family).label, statusInfo(node.status).label
  ].filter(Boolean).join(' ').toLowerCase();
}

function updateSearchResults(resetIndex = true) {
  const q = String(flowSearchInput?.value || '').trim().toLowerCase();
  state.searchQuery = q;
  state.searchResults = q ? currentProject().nodes.filter(n => nodeSearchText(n).includes(q)).map(n => n.id) : [];
  if (resetIndex) state.searchIndex = state.searchResults.length ? 0 : -1;
  if (searchCount) searchCount.textContent = q ? `${state.searchResults.length} résultat(s)` : 'Aucune recherche';
}

function goToSearchResult(direction = 1) {
  updateSearchResults(false);
  if (!state.searchResults.length) {
    state.searchIndex = -1;
    state.selectedNodes.clear();
    syncInspector();
    render();
    setStatus('Aucun résultat pour cette recherche.');
    return;
  }
  if (state.searchIndex < 0) state.searchIndex = 0;
  else state.searchIndex = (state.searchIndex + direction + state.searchResults.length) % state.searchResults.length;
  const id = state.searchResults[state.searchIndex];
  const node = getNode(id);
  if (!node) return;
  state.selectedNodes = new Set([id]);
  state.selectedConnection = null;
  syncInspector();
  centerViewOnNode(node);
  render();
  if (searchCount) searchCount.textContent = `${state.searchIndex + 1} / ${state.searchResults.length}`;
  setStatus(`Résultat ${state.searchIndex + 1}/${state.searchResults.length} : ${node.title || 'outil'}.`);
}

function centerViewOnNode(node) {
  const p = currentProject();
  const r = workspace.getBoundingClientRect();
  const targetScale = Math.min(1.15, Math.max(.55, p.scale || 1));
  p.scale = targetScale;
  p.panX = r.width / 2 - (node.x + nodeWidth(node) / 2) * p.scale;
  p.panY = r.height / 2 - (node.y + nodeHeight(node) / 2) * p.scale;
  applyTransform();
}

function fitViewToNodes(targetNodes = null) {
  const p = currentProject();
  const nodes = targetNodes || p.nodes || [];
  if (!nodes.length) {
    p.scale = 1;
    p.panX = 0;
    p.panY = 0;
    applyTransform();
    setStatus('Vue recentrée.');
    return;
  }
  const minX = Math.min(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const maxX = Math.max(...nodes.map(n => n.x + nodeWidth(n)));
  const maxY = Math.max(...nodes.map(n => n.y + nodeHeight(n)));
  const r = workspace.getBoundingClientRect();
  const margin = 90;
  const contentW = Math.max(1, maxX - minX);
  const contentH = Math.max(1, maxY - minY);
  const sx = (r.width - margin * 2) / contentW;
  const sy = (r.height - margin * 2) / contentH;
  p.scale = Math.max(.08, Math.min(1.15, sx, sy));
  p.panX = r.width / 2 - ((minX + contentW / 2) * p.scale);
  p.panY = r.height / 2 - ((minY + contentH / 2) * p.scale);
  applyTransform();
  setStatus('Vue recentrée sur les outils.');
}


function isTypingTarget(el) {
  return !!el?.closest?.('input, textarea, select, [contenteditable="true"]');
}

function clonePlainNode(node) {
  return JSON.parse(JSON.stringify(node));
}

function copySelection() {
  const p = currentProject();
  const ids = new Set(state.selectedNodes);
  if (!ids.size) return setStatus('Aucun outil sélectionné à copier.');
  const nodes = p.nodes.filter(n => ids.has(n.id)).map(clonePlainNode);
  const connections = p.connections.filter(c => ids.has(c.from.nodeId) && ids.has(c.to.nodeId)).map(c => ({ from: c.from, to: c.to }));
  const groupIds = new Set(nodes.map(n => n.groupId).filter(Boolean));
  const groups = p.groups.filter(g => groupIds.has(g.id)).map(g => JSON.parse(JSON.stringify(g)));
  state.clipboard = { nodes, connections, groups };
  state.pasteOffset = 0;
  setStatus(`${nodes.length} outil(s) copié(s). Utilise Ctrl+V pour coller.`);
}

function pasteSelection() {
  const clip = state.clipboard;
  if (!clip?.nodes?.length) return setStatus('Rien à coller.');
  pushHistory();
  const p = currentProject();
  state.pasteOffset = (state.pasteOffset || 0) + 36;
  const nodeMap = new Map();
  const portMap = new Map();
  const groupMap = new Map();
  for (const g of clip.groups || []) {
    const oldId = g.id;
    const newGroup = { ...JSON.parse(JSON.stringify(g)), id: uid('group'), title: `${g.title || 'Groupe'} copie` };
    p.groups.push(newGroup);
    groupMap.set(oldId, newGroup.id);
  }
  // Répare les parentés des groupes copiés pour conserver les imbrications.
  p.groups.forEach(g => {
    if (g.parentId && groupMap.has(g.parentId)) g.parentId = groupMap.get(g.parentId);
    else if (g.parentId && !p.groups.some(x => x.id === g.parentId)) g.parentId = null;
  });
  const created = [];
  for (const original of clip.nodes) {
    const oldNodeId = original.id;
    const n = JSON.parse(JSON.stringify(original));
    n.id = uid('node');
    n.title = `${n.title || 'Outil'} copie`;
    n.x = snap((n.x || 0) + state.pasteOffset);
    n.y = snap((n.y || 0) + state.pasteOffset);
    n.groupId = n.groupId && groupMap.has(n.groupId) ? groupMap.get(n.groupId) : null;
    for (const port of [...(n.leftPorts || []), ...(n.rightPorts || [])]) {
      const oldPortId = port.id;
      port.id = uid('port');
      portMap.set(`${oldNodeId}:${oldPortId}`, port.id);
    }
    enforceNodeMinimum(n);
  p.nodes.push(n);
    nodeMap.set(oldNodeId, n.id);
    created.push(n.id);
  }
  for (const c of clip.connections || []) {
    const fromNode = nodeMap.get(c.from.nodeId);
    const toNode = nodeMap.get(c.to.nodeId);
    const fromPort = portMap.get(`${c.from.nodeId}:${c.from.portId}`);
    const toPort = portMap.get(`${c.to.nodeId}:${c.to.portId}`);
    if (fromNode && toNode && fromPort && toPort) {
      p.connections.push({ id: uid('conn'), from: { nodeId: fromNode, portId: fromPort }, to: { nodeId: toNode, portId: toPort } });
    }
  }
  state.selectedNodes = new Set(created);
  state.selectedConnection = null;
  syncInspector();
  render();
  setStatus(`${created.length} outil(s) collé(s).`);
}
let panning = false, spaceDown = false, marquee = null;

function isWorkspaceEmptyTarget(e) {
  return e.target === workspace || e.target === canvas || e.target === svg;
}

function startPan(e) {
  const p = currentProject();
  panning = { x: e.clientX, y: e.clientY, panX: p.panX, panY: p.panY, pointerId: e.pointerId };
  workspace.setPointerCapture?.(e.pointerId);
  workspace.classList.add('panning');
  e.preventDefault();
}

function startMarquee(e) {
  const r = workspace.getBoundingClientRect();
  const startClient = { x: e.clientX, y: e.clientY };
  const startCanvas = screenToCanvas(e.clientX, e.clientY);
  const rect = document.createElement('div');
  rect.className = 'selection-rect';
  workspace.appendChild(rect);
  marquee = { startClient, startCanvas, rect, moved: false, pointerId: e.pointerId };
  workspace.setPointerCapture?.(e.pointerId);
  const update = (ev) => {
    const left = Math.min(startClient.x, ev.clientX) - r.left;
    const top = Math.min(startClient.y, ev.clientY) - r.top;
    const width = Math.abs(ev.clientX - startClient.x);
    const height = Math.abs(ev.clientY - startClient.y);
    if (width > 4 || height > 4) marquee.moved = true;
    rect.style.left = `${left}px`;
    rect.style.top = `${top}px`;
    rect.style.width = `${width}px`;
    rect.style.height = `${height}px`;
  };
  marquee.update = update;
  update(e);
  e.preventDefault();
}


function selectAllNodes() {
  const ids = currentProject().nodes.map(n => n.id);
  state.selectedNodes = new Set(ids);
  state.selectedConnection = null;
  syncInspector();
  render();
  setStatus(`${ids.length} outil(s) sélectionné(s).`);
}

function startSelectionMove(e) {
  e.preventDefault();
  e.stopPropagation();
  pushHistory();
  const start = screenToCanvas(e.clientX, e.clientY);
  const moving = selectedNodes().map(n => ({ id: n.id, x: n.x, y: n.y }));
  if (!moving.length) return;
  workspace.setPointerCapture?.(e.pointerId);
  workspace.classList.add('panning');
  const onMove = ev => {
    const p = screenToCanvas(ev.clientX, ev.clientY);
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    moving.forEach(m => {
      const n = getNode(m.id);
      if (n) { n.x = snap(m.x + dx); n.y = snap(m.y + dy); }
    });
    render();
  };
  const onUp = () => {
    workspace.classList.remove('panning');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    setStatus(`${moving.length} outil(s) déplacé(s).`);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z' && !isTypingTarget(e.target)) { e.preventDefault(); undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y' && !isTypingTarget(e.target)) { e.preventDefault(); redo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'a' && !isTypingTarget(e.target)) { e.preventDefault(); selectAllNodes(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'c' && !isTypingTarget(e.target)) { e.preventDefault(); copySelection(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'v' && !isTypingTarget(e.target)) { e.preventDefault(); pasteSelection(); return; }
  if (e.code === 'Space' && !isTypingTarget(e.target)) { spaceDown = true; workspace.style.cursor = 'grab'; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && !isTypingTarget(e.target)) deleteSelection();
  if (e.key === 'Escape') { state.portDraft = null; state.connectionDrag = null; state.selectedConnection = null; hideContextMenu(); if (marquee?.rect) marquee.rect.remove(); marquee = null; render(); }
});
window.addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; workspace.style.cursor = 'default'; } });
workspace.addEventListener('contextmenu', e => { if (isWorkspaceEmptyTarget(e)) e.preventDefault(); });
workspace.addEventListener('pointerdown', e => {
  if (!isWorkspaceEmptyTarget(e)) return;
  hideContextMenu();
  if (e.button === 2 || spaceDown) { startPan(e); return; }
  if (e.button === 0 && e.shiftKey && state.selectedNodes.size) { startSelectionMove(e); return; }
  if (e.button === 0) { startMarquee(e); return; }
});
workspace.addEventListener('pointermove', e => {
  if (panning) {
    const p = currentProject();
    p.panX = panning.panX + e.clientX - panning.x;
    p.panY = panning.panY + e.clientY - panning.y;
    applyTransform();
    return;
  }
  if (marquee) marquee.update(e);
});
workspace.addEventListener('pointerup', e => {
  if (panning) { panning = false; workspace.classList.remove('panning'); return; }
  if (marquee) {
    const endCanvas = screenToCanvas(e.clientX, e.clientY);
    const minX = Math.min(marquee.startCanvas.x, endCanvas.x);
    const maxX = Math.max(marquee.startCanvas.x, endCanvas.x);
    const minY = Math.min(marquee.startCanvas.y, endCanvas.y);
    const maxY = Math.max(marquee.startCanvas.y, endCanvas.y);
    const selected = currentProject().nodes.filter(n => n.x >= minX && n.y >= minY && n.x + nodeWidth(n) <= maxX && n.y + nodeHeight(n) <= maxY).map(n => n.id);
    marquee.rect.remove();
    if (marquee.moved) {
      state.selectedNodes = new Set(selected);
      state.selectedConnection = null;
      setStatus(`${selected.length} outil(s) sélectionné(s).`);
    } else {
      state.selectedNodes.clear();
      state.selectedConnection = null;
      state.portDraft = null;
      state.connectionDrag = null;
    }
    marquee = null;
    syncInspector();
    render();
  }
});
workspace.addEventListener('wheel', e => { e.preventDefault(); const p = currentProject(); const before = screenToCanvas(e.clientX, e.clientY); p.scale = Math.min(2.2, Math.max(.02, p.scale * (e.deltaY < 0 ? 1.08 : .92))); const after = screenToCanvas(e.clientX, e.clientY); p.panX += (after.x - before.x) * p.scale; p.panY += (after.y - before.y) * p.scale; applyTransform(); }, { passive: false });

let lastMiddleClick = 0;
workspace.addEventListener('pointerdown', e => {
  if (e.button !== 1 || !isWorkspaceEmptyTarget(e)) return;
  e.preventDefault();
  const now = Date.now();
  if (now - lastMiddleClick < 380) {
    lastMiddleClick = 0;
    fitViewToNodes();
  } else {
    lastMiddleClick = now;
  }
});


function nodeWidth(n) { return n.width || 210; }
function nodeHeight(n) { return n.height || 112; }

function startResize(e, node) {
  e.preventDefault();
  pushHistory();
  e.stopPropagation();
  selectNode(node.id, e.shiftKey);
  const start = screenToCanvas(e.clientX, e.clientY);
  const startW = node.width || 210;
  const startH = node.height || 112;
  const onMove = ev => {
    const p = screenToCanvas(ev.clientX, ev.clientY);
    const min = minNodeSize(node);
    node.width = Math.max(min.width, snap(startW + (p.x - start.x)));
    node.height = Math.max(min.height, snap(startH + (p.y - start.y)));
    render();
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function align(kind) {
  const nodes = selectedNodes(); if (nodes.length < 2) return setStatus('Sélectionne au moins 2 éléments.');
  pushHistory();
  const minX = Math.min(...nodes.map(n => n.x)), maxX = Math.max(...nodes.map(n => n.x + nodeWidth(n)));
  const minY = Math.min(...nodes.map(n => n.y)), maxY = Math.max(...nodes.map(n => n.y + nodeHeight(n)));
  for (const n of nodes) { if (kind === 'left') n.x = minX; if (kind === 'center') n.x = minX + (maxX - minX) / 2 - nodeWidth(n) / 2; if (kind === 'right') n.x = maxX - nodeWidth(n); if (kind === 'top') n.y = minY; if (kind === 'middle') n.y = minY + (maxY - minY) / 2 - nodeHeight(n) / 2; if (kind === 'bottom') n.y = maxY - nodeHeight(n); }
  render();
}
function distribute(kind) {
  const nodes = selectedNodes();
  if (nodes.length < 3) return setStatus('Sélectionne au moins 3 éléments à distribuer.');
  pushHistory();
  if (kind === 'horizontal') {
    const sorted = [...nodes].sort((a, b) => a.x - b.x);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const firstCenter = first.x + nodeWidth(first) / 2;
    const lastCenter = last.x + nodeWidth(last) / 2;
    const step = (lastCenter - firstCenter) / (sorted.length - 1);
    sorted.forEach((n, i) => { n.x = snap(firstCenter + step * i - nodeWidth(n) / 2); });
    setStatus('Sélection distribuée horizontalement.');
  } else {
    const sorted = [...nodes].sort((a, b) => a.y - b.y);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const firstCenter = first.y + nodeHeight(first) / 2;
    const lastCenter = last.y + nodeHeight(last) / 2;
    const step = (lastCenter - firstCenter) / (sorted.length - 1);
    sorted.forEach((n, i) => { n.y = snap(firstCenter + step * i - nodeHeight(n) / 2); });
    setStatus('Sélection distribuée verticalement.');
  }
  render();
}
function autoSort() { pushHistory(); const nodes = selectedNodes().length ? selectedNodes() : currentProject().nodes; nodes.forEach((n, i) => { n.x = 120 + (i % 4) * 290; n.y = 110 + Math.floor(i / 4) * 190; }); render(); }
function groupSelection() {
  const selected = selectedNodes();
  if (selected.length < 2) return setStatus('Sélectionne plusieurs éléments à grouper.');
  pushHistory();
  const p = currentProject();
  sanitizeGroupHierarchy();
  const selectedIds = new Set(selected.map(n => n.id));
  const childGroupIds = new Set();

  // Si la sélection contient tous les outils d'un groupe existant, on conserve
  // ce groupe et on le place dans le nouveau groupe parent. Cela permet de
  // créer des groupes imbriqués sans casser les sous-groupes existants.
  for (const g of p.groups) {
    const descendants = descendantNodesOfGroup(g.id).map(n => n.id);
    if (descendants.length && descendants.every(id => selectedIds.has(id))) childGroupIds.add(g.id);
  }

  // On garde seulement les groupes les plus hauts de la sélection pour éviter
  // de parentifier à la fois un groupe et son sous-groupe.
  for (const gid of [...childGroupIds]) {
    let parentId = p.groups.find(g => g.id === gid)?.parentId || null;
    while (parentId) {
      if (childGroupIds.has(parentId)) { childGroupIds.delete(gid); break; }
      parentId = p.groups.find(g => g.id === parentId)?.parentId || null;
    }
  }

  const id = uid('group');
  p.groups.push({ id, parentId: null, title: `Groupe ${p.groups.length + 1}`, comment: 'Double-clique ici pour ajouter un commentaire.', color: '#dbeafe', titleFontSize: 12, commentFontSize: 12 });

  const coveredNodeIds = new Set();
  for (const gid of childGroupIds) {
    const g = p.groups.find(x => x.id === gid);
    if (g) g.parentId = id;
    descendantNodesOfGroup(gid).forEach(n => coveredNodeIds.add(n.id));
  }

  // Les outils sélectionnés qui n'appartiennent pas à un sous-groupe complet
  // deviennent directement enfants du nouveau groupe.
  selected.forEach(n => { if (!coveredNodeIds.has(n.id)) n.groupId = id; });
  render();
  setStatus(childGroupIds.size ? 'Groupe parent créé avec des sous-groupes.' : 'Groupe créé. Tu peux le déplacer et modifier son titre/commentaire.');
}

function ungroupSelection() {
  const p = currentProject();
  const ids = new Set(selectedNodes().map(n => n.groupId).filter(Boolean));
  if (!ids.size) return setStatus('Sélectionne un élément appartenant à un groupe.');
  pushHistory();
  for (const gid of ids) {
    const g = p.groups.find(x => x.id === gid);
    const parentId = g?.parentId || null;
    p.nodes.forEach(n => { if (n.groupId === gid) n.groupId = parentId; });
    p.groups.forEach(child => { if (child.parentId === gid) child.parentId = parentId; });
  }
  p.groups = p.groups.filter(g => !ids.has(g.id));
  render();
  setStatus('Groupe dégrouppé. Les sous-groupes éventuels sont conservés.');
}

function childGroupsOf(groupId) {
  const p = currentProject();
  return p.groups.filter(g => g.parentId === groupId && g.id !== groupId);
}

function sanitizeGroupHierarchy() {
  const p = currentProject();
  const groupIds = new Set(p.groups.map(g => g.id));
  for (const g of p.groups) {
    if (!g.parentId || !groupIds.has(g.parentId) || g.parentId === g.id) {
      g.parentId = null;
      continue;
    }
    const seen = new Set([g.id]);
    let parent = p.groups.find(x => x.id === g.parentId);
    while (parent) {
      if (seen.has(parent.id)) {
        g.parentId = null;
        break;
      }
      seen.add(parent.id);
      parent = parent.parentId ? p.groups.find(x => x.id === parent.parentId) : null;
    }
  }
  for (const n of p.nodes) {
    if (n.groupId && !groupIds.has(n.groupId)) n.groupId = null;
  }
}

function descendantNodesOfGroup(groupId, visited = new Set()) {
  if (!groupId || visited.has(groupId)) return [];
  visited.add(groupId);
  const p = currentProject();
  const nodes = p.nodes.filter(n => n.groupId === groupId);
  for (const child of p.groups.filter(g => g.parentId === groupId && g.id !== groupId)) {
    nodes.push(...descendantNodesOfGroup(child.id, visited));
  }
  return nodes;
}

function groupBounds(groupId) {
  const nodes = descendantNodesOfGroup(groupId);
  if (!nodes.length) return null;
  const hasChildren = childGroupsOf(groupId).length > 0;
  const minX = Math.min(...nodes.map(n => n.x)) - (hasChildren ? 48 : 34);
  const minY = Math.min(...nodes.map(n => n.y)) - (hasChildren ? 82 : 62);
  const maxX = Math.max(...nodes.map(n => n.x + nodeWidth(n))) + (hasChildren ? 48 : 34);
  const maxY = Math.max(...nodes.map(n => n.y + nodeHeight(n))) + (hasChildren ? 48 : 34);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY, nodes };
}

function groupDepth(groupId) {
  const p = currentProject();
  let depth = 0;
  let g = p.groups.find(x => x.id === groupId);
  const seen = new Set();
  while (g && g.parentId && !seen.has(g.parentId)) {
    seen.add(g.parentId);
    depth += 1;
    g = p.groups.find(x => x.id === g.parentId);
  }
  return depth;
}

function renderGroups() {
  sanitizeGroupHierarchy();
  const p = currentProject();
  const orderedGroups = [...p.groups].sort((a, b) => groupDepth(a.id) - groupDepth(b.id));
  for (const g of orderedGroups) {
    const b = groupBounds(g.id);
    if (!b) continue;
    const box = document.createElement('div');
    box.className = 'group-box' + (g.parentId ? ' group-box-child' : '') + (childGroupsOf(g.id).length ? ' group-box-parent' : '');
    box.dataset.groupId = g.id;
    box.style.setProperty('--group-color', g.color || '#dbeafe');
    box.style.setProperty('--group-title-size', `${g.titleFontSize || 12}px`);
    box.style.setProperty('--group-comment-size', `${g.commentFontSize || 12}px`);
    box.style.left = `${b.minX}px`;
    box.style.top = `${b.minY}px`;
    box.style.width = `${b.width}px`;
    box.style.height = `${b.height}px`;

    const title = document.createElement('div');
    title.className = 'group-title';
    title.textContent = g.title || 'Groupe';
    title.title = 'Glisser pour déplacer le groupe · double-clic pour modifier';

    const comment = document.createElement('div');
    comment.className = 'group-comment';
    comment.textContent = g.comment || '';
    comment.title = 'Double-clic pour modifier le titre/commentaire';

    title.addEventListener('pointerdown', e => startGroupDrag(e, g.id));
    box.addEventListener('pointerdown', e => { if (e.target === box) startGroupDrag(e, g.id); });
    title.addEventListener('dblclick', e => { e.preventDefault(); e.stopPropagation(); editGroupText(g.id); });
    comment.addEventListener('dblclick', e => { e.preventDefault(); e.stopPropagation(); editGroupText(g.id); });

    box.append(title, comment);
    canvas.appendChild(box);
  }
}

function startGroupDrag(e, groupId) {
  if (e.button !== 0) return;
  e.preventDefault();
  pushHistory();
  e.stopPropagation();
  const p = currentProject();
  const nodes = descendantNodesOfGroup(groupId);
  if (!nodes.length) return;
  const start = screenToCanvas(e.clientX, e.clientY);
  const moving = nodes.map(n => ({ id: n.id, x: n.x, y: n.y }));
  state.selectedNodes = new Set(nodes.map(n => n.id));
  const onMove = ev => {
    const pos = screenToCanvas(ev.clientX, ev.clientY);
    const dx = pos.x - start.x, dy = pos.y - start.y;
    moving.forEach(m => {
      const n = getNode(m.id);
      if (n) { n.x = snap(m.x + dx); n.y = snap(m.y + dy); }
    });
    render();
  };
  const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function editGroupText(groupId) {
  const g = currentProject().groups.find(x => x.id === groupId);
  if (!g) return;
  const title = prompt('Titre du groupe', g.title || 'Groupe');
  if (title === null) return;
  const comment = prompt('Commentaire / annotation du groupe', g.comment || '');
  if (comment === null) return;
  const color = prompt('Couleur du groupe en hexadécimal, ex. #dbeafe', g.color || '#dbeafe');
  if (color === null) return;
  const titleSize = prompt('Taille du titre du groupe', g.titleFontSize || 12);
  if (titleSize === null) return;
  const commentSize = prompt('Taille de police de l’annotation', g.commentFontSize || 12);
  if (commentSize === null) return;
  pushHistory();
  g.title = title.trim() || 'Groupe';
  g.comment = comment;
  if (/^#[0-9a-f]{6}$/i.test(String(color).trim())) g.color = String(color).trim();
  g.titleFontSize = Math.max(8, Math.min(48, Number(titleSize) || 12));
  g.commentFontSize = Math.max(8, Math.min(48, Number(commentSize) || 12));
  render();
}
function deleteSelection() { const p = currentProject(); if (state.selectedConnection) { pushHistory(); p.connections = p.connections.filter(c => c.id !== state.selectedConnection); state.selectedConnection = null; render(); return; } const ids = new Set(state.selectedNodes); if (!ids.size) return; pushHistory(); p.nodes = p.nodes.filter(n => !ids.has(n.id)); p.connections = p.connections.filter(c => !ids.has(c.from.nodeId) && !ids.has(c.to.nodeId)); state.selectedNodes.clear(); syncInspector(); render(); }

function serializableState() { return { version: 3, exportedAt: new Date().toISOString(), activeProjectId: state.activeProjectId, projects: state.projects }; }

function bytesToBase64(bytes) {
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}
function base64ToBytes(str) {
  const binary = atob(str);
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}
async function deriveAccessKey(secret, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
async function encryptPayload(payload, secret) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAccessKey(secret, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(payload)));
  return {
    nodeBoardEncrypted: true,
    version: 3,
    exportedAt: new Date().toISOString(),
    crypto: { alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', iterations: 250000, salt: bytesToBase64(salt), iv: bytesToBase64(iv) },
    payload: bytesToBase64(new Uint8Array(encrypted))
  };
}
async function decryptPayload(wrapper, secret) {
  if (!window.crypto?.subtle) throw new Error("Le chiffrement Web Crypto n'est pas disponible dans ce navigateur.");
  const dec = new TextDecoder();
  const salt = base64ToBytes(wrapper.crypto?.salt || '');
  const iv = base64ToBytes(wrapper.crypto?.iv || '');
  const data = base64ToBytes(wrapper.payload || '');
  const key = await deriveAccessKey(secret, salt);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return JSON.parse(dec.decode(decrypted));
}
function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function normalizeNode(n) {
  const node = { kind: 'box', family: 'information', text: '', value: true, min: 0, max: 100, formula: 'x + y', fileName: '', fileData: '', fileType: '', url: '', width: 220, height: 146, fontSize: 12, muted: false, comment: '', status: 'draft', activityTags: {}, ...n };
  node.activityTags = normalizeActivityTags(node.activityTags);
  const normalizePort = (p, fallback) => typeof p === 'object'
    ? { id: p.id || uid('port'), label: p.label || fallback, connectionStyle: p.connectionStyle || '' }
    : { id: uid('port'), label: String(p || fallback), connectionStyle: '' };
  node.leftPorts = Array.isArray(node.leftPorts) ? node.leftPorts.map(p => normalizePort(p, 'Entrée')) : [];
  node.rightPorts = Array.isArray(node.rightPorts) ? node.rightPorts.map(p => normalizePort(p, 'Sortie')) : [];
  if ((node.kind === 'pdf' || node.kind === 'link') && !node.leftPorts.length && !node.rightPorts.length) node.rightPorts = [{ id: uid('port'), label: 'Source', connectionStyle: '' }];
  enforceNodeMinimum(node);
  return node;
}
function normalizeProject(p, index = 0) { return { id: p.id || uid('project'), title: p.title || `Projet ${index + 1}`, nodes: Array.isArray(p.nodes) ? p.nodes.map(normalizeNode) : [], connections: Array.isArray(p.connections) ? p.connections : [], groups: Array.isArray(p.groups) ? p.groups.map((g, i) => ({ id: g.id || uid('group'), parentId: g.parentId || null, title: `Groupe ${i + 1}`, comment: '', color: '#dbeafe', titleFontSize: 12, commentFontSize: 12, ...g })) : [], scale: typeof p.scale === 'number' ? p.scale : 1, panX: typeof p.panX === 'number' ? p.panX : 0, panY: typeof p.panY === 'number' ? p.panY : 0 }; }
function normalizeLoadedState(loaded) {
  let projects;
  if (Array.isArray(loaded?.projects)) projects = loaded.projects.map(normalizeProject);
  else {
    const payload = loaded && loaded.nodes ? loaded : loaded?.project;
    if (!payload || !Array.isArray(payload.nodes) || !Array.isArray(payload.connections)) throw new Error('Format de fichier invalide.');
    projects = [normalizeProject({ ...payload, title: 'Projet importé' }, 0)];
  }
  if (!projects.length) projects = [blankProject('Projet 1')];
  return { version: 2, projects, activeProjectId: loaded.activeProjectId && projects.some(p => p.id === loaded.activeProjectId) ? loaded.activeProjectId : projects[0].id, selectedNodes: new Set(), selectedConnection: null, portDraft: null, connectionDrag: null, clipboard: null, pasteOffset: 0, undoStack: [], redoStack: [], historyLimit: 3, recentColors: state.recentColors || [], formatPainter: null, commentEditTargets: [], viewMode: state.viewMode || 'edit', legendVisible: !!state.legendVisible, searchQuery: '', searchResults: [], searchIndex: -1 };
}
async function exportFile() {
  const data = serializableState();
  const safeDate = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const suggested = `node-board-projets-${safeDate}`;
  const wantedName = prompt('Nom du fichier de sauvegarde', suggested);
  if (wantedName === null) return setStatus('Export annulé.');
  const cleanName = String(wantedName).trim()
    .replace(/\.json$/i, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 120) || suggested;
  let filename = `${cleanName}.json`;
  const key = prompt("Définis une clé d'accès pour protéger ce fichier. Laisse vide pour exporter sans protection.");
  if (key === null) return setStatus('Export annulé.');
  try {
    if (key.trim()) {
      const confirmKey = prompt("Confirme la clé d'accès.");
      if (confirmKey === null) return setStatus('Export annulé.');
      if (confirmKey !== key) return alert('Les deux clés ne correspondent pas. Export annulé.');
      const protectedData = await encryptPayload(data, key);
      downloadJson(protectedData, filename);
      setStatus(`Sauvegarde protégée exportée : ${filename}`);
    } else {
      downloadJson(data, filename);
      setStatus(`Sauvegarde non protégée exportée : ${filename}`);
    }
  } catch (err) {
    alert(err.message || 'Impossible de créer le fichier protégé.');
    setStatus('Export annulé.');
  }
}
async function importFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      let loaded = JSON.parse(reader.result);
      if (loaded?.nodeBoardEncrypted) {
        const key = prompt("Ce fichier est protégé. Entre la clé d'accès pour l'ouvrir.");
        if (!key) return setStatus('Import annulé.');
        try {
          loaded = await decryptPayload(loaded, key);
        } catch {
          alert('Clé incorrecte ou fichier protégé invalide.');
          return setStatus('Import annulé.');
        }
      }
      state = normalizeLoadedState(loaded);
      syncInspector();
      render();
      setStatus(`Fichier chargé : ${file.name}`);
    } catch (err) {
      alert(err.message || 'Impossible de charger ce fichier.');
      setStatus('Import annulé.');
    }
  };
  reader.onerror = () => { alert('Impossible de lire ce fichier.'); setStatus('Import annulé.'); };
  reader.readAsText(file);
}
function save() { localStorage.setItem('node-board-v2', JSON.stringify(serializableState())); setStatus('Tous les projets sont sauvegardés dans le navigateur.'); }
function load() { const raw = localStorage.getItem('node-board-v2') || localStorage.getItem('node-board-v1'); if (!raw) return setStatus('Aucune sauvegarde trouvée.'); try { state = normalizeLoadedState(JSON.parse(raw)); syncInspector(); render(); setStatus('Tous les projets sont chargés.'); } catch { setStatus('Sauvegarde navigateur incompatible.'); } }


function hideContextMenu() {
  if (contextMenu) contextMenu.hidden = true;
}

function showContextMenu(clientX, clientY, nodeId) {
  const node = getNode(nodeId);
  if (!node || !contextMenu) return;
  const titleEl = contextMenu.querySelector('.context-title');
  if (titleEl) titleEl.textContent = state.selectedNodes.size > 1 ? `Réglages (${state.selectedNodes.size} éléments)` : 'Réglages';
  ctxName.value = node.title || '';
  ctxColor.value = rgbToHex(node.color || '#ffffff');
  if (ctxFamily) ctxFamily.value = node.family || 'information';
  if (ctxMuted) {
    const nodes = selectedNodes();
    const mutedCount = nodes.filter(n => !!n.muted).length;
    ctxMuted.checked = !!node.muted;
    ctxMuted.indeterminate = nodes.length > 1 && mutedCount > 0 && mutedCount < nodes.length;
  }
  if (ctxFontSize) ctxFontSize.value = node.fontSize || 12;
  if (ctxFormulaLabel && ctxFormula) {
    ctxFormulaLabel.hidden = node.kind !== 'formula';
    ctxFormula.value = node.formula || 'x + y';
  }
  renderRecentColors();
  contextMenu.hidden = false;
  const pad = 10;
  const w = contextMenu.offsetWidth || 260;
  const h = contextMenu.offsetHeight || 320;
  contextMenu.style.left = `${Math.min(clientX, window.innerWidth - w - pad)}px`;
  contextMenu.style.top = `${Math.min(clientY, window.innerHeight - h - pad)}px`;
}

function renameSelectedPorts() {
  const nodes = selectedNodes();
  if (!nodes.length) return;
  const node = nodes[0];
  const all = [
    ...node.leftPorts.map((p, i) => ({ ...p, side: 'left', index: i + 1 })),
    ...node.rightPorts.map((p, i) => ({ ...p, side: 'right', index: i + 1 }))
  ];
  if (!all.length) return alert('Cet outil n’a pas de connecteur.');
  const list = all.map((p, i) => `${i + 1}. ${p.side === 'left' ? 'Entrée' : 'Sortie'} : ${p.label}`).join('\n');
  const choice = prompt(`Quel connecteur renommer ?\n${list}\n\nTape le numéro du connecteur.`);
  if (!choice) return;
  const idx = Number(choice) - 1;
  const picked = all[idx];
  if (!picked) return alert('Numéro invalide.');
  const port = picked.side === 'left' ? node.leftPorts[picked.index - 1] : node.rightPorts[picked.index - 1];
  const next = prompt('Nouveau nom du connecteur', port.label);
  if (next) { pushHistory(); port.label = next; render(); showContextMenu(contextMenu.offsetLeft, contextMenu.offsetTop, node.id); }
}

function createToolAt(tool, clientX, clientY) {
  const pos = screenToCanvas(clientX, clientY);
  const n = createNode({ kind: tool, x: snap(pos.x - 105), y: snap(pos.y - 56) });
  setStatus(`${kindLabel(tool).toLowerCase()} ajouté par glisser-déposer.`);
  return n;
}


let excelWorkbook = null;
let excelFileName = '';

function openExcelModal() {
  const modal = document.getElementById('excelModal');
  if (!modal) return;
  modal.hidden = false;
  setStatus('Import Excel / CSV ouvert.');
}
function closeExcelModal() {
  const modal = document.getElementById('excelModal');
  if (modal) modal.hidden = true;
}

function csvToRows(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"' && quoted && next === '"') { cell += '"'; i++; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === ',' && !quoted) { row.push(cell); cell = ''; continue; }
    if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = ''; continue;
    }
    cell += ch;
  }
  row.push(cell); rows.push(row);
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

function rowsToWorkbook(rows, name = 'CSV') {
  const maxCols = Math.max(1, ...rows.map(r => r.length));
  const maxRows = Math.max(1, rows.length);
  const sheet = { '!ref': `A1:${colToLetters(maxCols)}${maxRows}` };
  rows.forEach((r, ri) => r.forEach((value, ci) => { sheet[`${colToLetters(ci + 1)}${ri + 1}`] = { v: value, t: isNaN(Number(value)) || String(value).trim() === '' ? 's' : 'n' }; }));
  return { SheetNames: [name], Sheets: { [name]: sheet } };
}

function colToLetters(num) {
  let s = '';
  while (num > 0) { const m = (num - 1) % 26; s = String.fromCharCode(65 + m) + s; num = Math.floor((num - 1) / 26); }
  return s || 'A';
}
function lettersToCol(letters) {
  return String(letters).toUpperCase().split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}
function parseCellAddress(addr) {
  const m = String(addr).trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!m) throw new Error(`Adresse invalide : ${addr}`);
  return { col: lettersToCol(m[1]), row: Number(m[2]) };
}
function parseRange(rangeText, sheet) {
  let txt = String(rangeText || '').trim().toUpperCase();
  if (!txt) txt = sheet['!ref'] || 'A1:A1';
  if (!txt.includes(':')) txt = `${txt}:${txt}`;
  const [a, b] = txt.split(':').map(parseCellAddress);
  return { c1: Math.min(a.col, b.col), r1: Math.min(a.row, b.row), c2: Math.max(a.col, b.col), r2: Math.max(a.row, b.row) };
}
function sheetValue(sheet, col, row) {
  const cell = sheet[`${colToLetters(col)}${row}`];
  return cell ? (cell.w ?? cell.v ?? '') : '';
}
function currentExcelSheet() {
  const select = document.getElementById('excelSheetSelect');
  if (!excelWorkbook || !select?.value) return null;
  return excelWorkbook.Sheets[select.value];
}
function selectedExcelCells() {
  const sheet = currentExcelSheet();
  if (!sheet) throw new Error('Aucune feuille sélectionnée.');
  const range = parseRange(document.getElementById('excelRangeInput').value, sheet);
  const skipEmpty = document.getElementById('excelSkipEmptyInput').checked;
  const cells = [];
  for (let r = range.r1; r <= range.r2; r++) {
    for (let c = range.c1; c <= range.c2; c++) {
      const value = sheetValue(sheet, c, r);
      if (skipEmpty && String(value).trim() === '') continue;
      cells.push({ row: r, col: c, address: `${colToLetters(c)}${r}`, value });
    }
  }
  return { cells, range };
}
function updateExcelPreview() {
  const out = document.getElementById('excelPreview');
  if (!out) return;
  try {
    if (!excelWorkbook) { out.textContent = 'Aucun fichier sélectionné.'; return; }
    const { cells, range } = selectedExcelCells();
    const mode = document.getElementById('excelModeSelect').value;
    const count = mode === 'cell' ? cells.length : mode === 'row' ? new Set(cells.map(c => c.row)).size : new Set(cells.map(c => c.col)).size;
    const sample = cells.slice(0, 30);
    out.innerHTML = `<strong>${excelFileName}</strong><br>${count} box seront créées (${cells.length} cellule(s) utilisées).<br><br>`;
    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Cellule</th><th>Valeur</th></tr></thead>';
    const tbody = document.createElement('tbody');
    sample.forEach(c => { const tr = document.createElement('tr'); const a = document.createElement('td'); a.textContent = c.address; const v = document.createElement('td'); v.textContent = String(c.value); tr.append(a, v); tbody.appendChild(tr); });
    table.appendChild(tbody);
    out.appendChild(table);
    if (cells.length > sample.length) out.appendChild(document.createTextNode(`… + ${cells.length - sample.length} cellule(s)`));
  } catch (err) { out.textContent = err.message || 'Prévisualisation impossible.'; }
}
async function loadExcelFile(file) {
  if (!file) return;
  excelFileName = file.name;
  const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
  try {
    if (isCsv) {
      const text = await file.text();
      excelWorkbook = rowsToWorkbook(csvToRows(text), file.name.replace(/\.csv$/i, '') || 'CSV');
    } else {
      if (!window.XLSX) throw new Error('Le module Excel n’est pas chargé. Vérifie ta connexion internet, puis recharge la page.');
      const buffer = await file.arrayBuffer();
      excelWorkbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    }
    const select = document.getElementById('excelSheetSelect');
    select.innerHTML = '';
    excelWorkbook.SheetNames.forEach(name => {
      const opt = document.createElement('option'); opt.value = name; opt.textContent = name; select.appendChild(opt);
    });
    const firstSheet = excelWorkbook.Sheets[excelWorkbook.SheetNames[0]];
    document.getElementById('excelRangeInput').value = firstSheet?.['!ref'] || 'A1:D10';
    updateExcelPreview();
    setStatus(`Fichier chargé pour import : ${file.name}`);
  } catch (err) {
    alert(err.message || 'Impossible de lire ce fichier Excel / CSV.');
    setStatus('Import Excel annulé.');
  }
}
function createExcelNodes() {
  try {
    if (!excelWorkbook) return alert('Choisis d’abord un fichier Excel ou CSV.');
    const { cells } = selectedExcelCells();
    if (!cells.length) return alert('Aucune cellule à importer dans cette plage.');
    const mode = document.getElementById('excelModeSelect').value;
    const prefix = document.getElementById('excelPrefixInput').value.trim() || 'Excel';
    const p = currentProject();
    pushHistory();
    const start = screenToCanvas(workspace.getBoundingClientRect().left + 220, workspace.getBoundingClientRect().top + 160);
    const newIds = [];
    if (mode === 'cell') {
      const minCol = Math.min(...cells.map(c => c.col));
      const minRow = Math.min(...cells.map(c => c.row));
      cells.forEach(c => {
        const colIndex = c.col - minCol;
        const rowIndex = c.row - minRow;
        const n = createNode({ kind: 'box', title: `${prefix} ${c.address}: ${String(c.value).slice(0, 42)}`, x: snap(start.x + colIndex * 260), y: snap(start.y + rowIndex * 150), text: String(c.value), color: '#f8fafc' }, false);
        newIds.push(n.id);
      });
    } else if (mode === 'row') {
      const rows = [...new Set(cells.map(c => c.row))].sort((a,b)=>a-b);
      rows.forEach((row, i) => {
        const vals = cells.filter(c => c.row === row).map(c => `${c.address}: ${c.value}`).join(' | ');
        const n = createNode({ kind: 'box', title: `${prefix} ligne ${row}`, x: snap(start.x), y: snap(start.y + i * 150), text: vals, color: '#f8fafc' }, false);
        newIds.push(n.id);
      });
    } else {
      const cols = [...new Set(cells.map(c => c.col))].sort((a,b)=>a-b);
      cols.forEach((col, i) => {
        const vals = cells.filter(c => c.col === col).map(c => `${c.address}: ${c.value}`).join(' | ');
        const n = createNode({ kind: 'box', title: `${prefix} colonne ${colToLetters(col)}`, x: snap(start.x + i * 260), y: snap(start.y), text: vals, color: '#f8fafc' }, false);
        newIds.push(n.id);
      });
    }
    state.selectedNodes = new Set(newIds);
    closeExcelModal();
    syncInspector();
    render();
    setStatus(`${newIds.length} box créées depuis ${excelFileName}.`);
  } catch (err) {
    alert(err.message || 'Impossible de créer les box.');
  }
}
function openWelcomeModal() {
  const modal = document.getElementById('welcomeModal');
  if (modal) modal.hidden = false;
}
function closeWelcomeModal() {
  const modal = document.getElementById('welcomeModal');
  if (modal) modal.hidden = true;
}
function startBlankProjectFromWelcome() {
  pushHistory();
  const p = blankProject('Projet 1');
  state.projects = [p];
  state.activeProjectId = p.id;
  state.selectedNodes = new Set();
  state.selectedConnection = null;
  state.portDraft = null;
  state.connectionDrag = null;
  state.undoStack = [];
  state.redoStack = [];
  closeWelcomeModal();
  syncInspector();
  render();
  setStatus('Nouveau projet prêt.');
}
function setupWelcomeModal() {
  const modal = document.getElementById('welcomeModal');
  if (!modal) return;
  document.getElementById('welcomeCloseBtn')?.addEventListener('click', closeWelcomeModal);
  document.getElementById('welcomeNewBtn')?.addEventListener('click', startBlankProjectFromWelcome);
  document.getElementById('welcomeLoadBtn')?.addEventListener('click', () => {
    closeWelcomeModal();
    document.getElementById('importFileInput')?.click();
  });
  document.getElementById('welcomeExcelBtn')?.addEventListener('click', () => {
    closeWelcomeModal();
    openExcelModal();
  });
}

function setupExcelImport() {
  const btn = document.getElementById('excelImportBtn');
  if (!btn) return;
  btn.addEventListener('click', openExcelModal);
  document.getElementById('excelCloseBtn')?.addEventListener('click', closeExcelModal);
  document.getElementById('excelChooseBtn')?.addEventListener('click', () => document.getElementById('excelFileInput').click());
  document.getElementById('excelFileInput')?.addEventListener('change', e => { loadExcelFile(e.target.files[0]); e.target.value = ''; });
  document.getElementById('excelSheetSelect')?.addEventListener('change', updateExcelPreview);
  document.getElementById('excelRangeInput')?.addEventListener('input', updateExcelPreview);
  document.getElementById('excelModeSelect')?.addEventListener('change', updateExcelPreview);
  document.getElementById('excelSkipEmptyInput')?.addEventListener('change', updateExcelPreview);
  document.getElementById('excelPreviewBtn')?.addEventListener('click', updateExcelPreview);
  document.getElementById('excelCreateBtn')?.addEventListener('click', createExcelNodes);
}
function setupPdfFileInput() {
  pdfFileInput?.addEventListener('change', e => {
    handlePdfFileSelected(e.target.files?.[0]);
    e.target.value = '';
  });
}

function setupToolPalette() {
  document.querySelectorAll('.tool-icon').forEach(icon => {
    if (!icon.dataset.tool) return;
    icon.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', icon.dataset.tool);
      e.dataTransfer.effectAllowed = 'copy';
      icon.classList.add('dragging');
    });
    icon.addEventListener('dragend', () => icon.classList.remove('dragging'));
    icon.addEventListener('click', () => setStatus('Glisse cette icône dans l’espace blanc pour l’ajouter.'));
  });
  workspace.addEventListener('dragover', e => {
    if (e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      workspace.classList.add('drop-ready');
    }
  });
  workspace.addEventListener('dragleave', e => {
    if (!workspace.contains(e.relatedTarget)) workspace.classList.remove('drop-ready');
  });
  workspace.addEventListener('drop', e => {
    e.preventDefault();
    workspace.classList.remove('drop-ready');
    const tool = e.dataTransfer.getData('text/plain');
    if (!['box', 'sourceBox', 'informationBox', 'dataTypeBox', 'panel', 'slider', 'switch', 'add', 'subtract', 'multiply', 'divide', 'formula', 'pdf', 'link'].includes(tool)) return;
    createToolAt(tool, e.clientX, e.clientY);
  });
}

function setupContextMenu() {
  document.addEventListener('click', e => {
    if (contextMenu && !contextMenu.hidden && !contextMenu.contains(e.target)) hideContextMenu();
    if (portMenu && !portMenu.hidden && !portMenu.contains(e.target)) hidePortMenu();
  });
  document.addEventListener('contextmenu', e => {
    if (!e.target.closest('.node')) hideContextMenu();
    if (!e.target.closest('.port-menu') && !e.target.closest('.port-row')) hidePortMenu();
  });
  ctxName.addEventListener('focus', () => pushHistory());
  ctxName.addEventListener('input', () => {
    selectedNodes().forEach(n => n.title = ctxName.value);
    render();
  });
  ctxColor.addEventListener('focus', () => pushHistory());
  ctxColor.addEventListener('input', () => {
    selectedNodes().forEach(n => n.color = ctxColor.value);
    rememberColor(ctxColor.value);
    render();
  });
  if (ctxFamily) {
    ctxFamily.addEventListener('focus', () => pushHistory());
    ctxFamily.addEventListener('change', () => {
      selectedNodes().forEach(n => {
        n.family = ctxFamily.value || 'information';
        if (!n.color || n.color === '#ffffff' || n.color === '#f8fafc' || n.color === '#e0f2fe' || n.color === '#f3e8ff' || n.color === '#fef3c7' || n.color === '#dcfce7' || n.color === '#eef2ff') n.color = familyInfo(n.family).color;
      });
      render();
    });
  }
  if (ctxFontSize) {
    ctxFontSize.addEventListener('focus', () => pushHistory());
    ctxFontSize.addEventListener('input', () => {
      const size = Math.max(8, Math.min(48, Number(ctxFontSize.value) || 12));
      selectedNodes().forEach(n => n.fontSize = size);
      render();
    });
  }
  if (ctxMuted) {
    ctxMuted.addEventListener('change', () => {
      pushHistory();
      const value = ctxMuted.checked;
      selectedNodes().forEach(n => n.muted = value);
      ctxMuted.indeterminate = false;
      render();
      setStatus(value ? 'Outil grisé.' : 'Grisage retiré.');
    });
  }
  if (ctxStatus) {
    ctxStatus.addEventListener('focus', () => pushHistory());
    ctxStatus.addEventListener('change', () => {
      selectedNodes().forEach(n => n.status = ctxStatus.value || 'draft');
      render();
      setStatus('Statut appliqué à la sélection.');
    });
  }
  if (ctxFormula) {
    ctxFormula.addEventListener('focus', () => pushHistory());
    ctxFormula.addEventListener('input', () => {
      selectedNodes().forEach(n => { if (n.kind === 'formula') n.formula = ctxFormula.value; });
      render();
    });
  }
  ctxCopyStyle?.addEventListener('click', e => {
    e.preventDefault();
    const node = selectedNodes()[0];
    if (!node) return;
    state.formatPainter = copyStyleFromNode(node);
    document.body.classList.add('format-painter-active');
    hideContextMenu();
    setStatus('Mise en forme copiée : fais clic droit sur le prochain outil pour l’appliquer.');
  });
  ctxResetStyle?.addEventListener('click', e => {
    e.preventDefault();
    resetStyleForSelection();
  });
  ctxComment?.addEventListener('click', e => { e.preventDefault(); commentSelection(); });
  commentSaveBtn?.addEventListener('click', e => { e.preventDefault(); saveCommentModal(); });
  commentDeleteBtn?.addEventListener('click', e => { e.preventDefault(); deleteCommentModal(); });
  commentCancelBtn?.addEventListener('click', e => { e.preventDefault(); closeCommentModal(); });
  commentCloseBtn?.addEventListener('click', e => { e.preventDefault(); closeCommentModal(); });
  commentModal?.addEventListener('click', e => { if (e.target === commentModal) closeCommentModal(); });
  commentTextInput?.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') saveCommentModal();
    if (e.key === 'Escape') closeCommentModal();
  });
  document.getElementById('ctxAddLeft').onclick = e => {
    e.preventDefault();
    pushHistory();
    selectedNodes().forEach(n => n.leftPorts.push({ id: uid('port'), label: `Entrée ${n.leftPorts.length + 1}`, connectionStyle: '' }));
    render();
  };
  document.getElementById('ctxAddRight').onclick = e => {
    e.preventDefault();
    pushHistory();
    selectedNodes().forEach(n => n.rightPorts.push({ id: uid('port'), label: `Sortie ${n.rightPorts.length + 1}`, connectionStyle: '' }));
    render();
  };
  document.getElementById('ctxRenamePorts').onclick = e => { e.preventDefault(); renameSelectedPorts(); };
  document.getElementById('ctxGroup').onclick = e => { e.preventDefault(); groupSelection(); hideContextMenu(); };
  document.getElementById('ctxUngroup').onclick = e => { e.preventDefault(); ungroupSelection(); hideContextMenu(); };
  document.getElementById('ctxDelete').onclick = e => { e.preventDefault(); deleteSelection(); hideContextMenu(); };
}

nameInput.addEventListener('focus', () => pushHistory());
nameInput.addEventListener('input', () => { const nodes = selectedNodes(); if (nodes.length === 1) { nodes[0].title = nameInput.value; render(); } });
colorInput.addEventListener('focus', () => pushHistory());
colorInput.addEventListener('input', () => { selectedNodes().forEach(n => n.color = colorInput.value); rememberColor(colorInput.value); render(); });
document.getElementById('addLeftPortBtn').onclick = () => { pushHistory(); selectedNodes().forEach(n => n.leftPorts.push({ id: uid('port'), label: `Entrée ${n.leftPorts.length + 1}`, connectionStyle: '' })); render(); };
document.getElementById('addRightPortBtn').onclick = () => { pushHistory(); selectedNodes().forEach(n => n.rightPorts.push({ id: uid('port'), label: `Sortie ${n.rightPorts.length + 1}`, connectionStyle: '' })); render(); };
document.getElementById('addProjectBtn').onclick = createProject;
document.getElementById('renameProjectBtn').onclick = renameProject;
document.getElementById('deleteProjectBtn').onclick = deleteProject;
document.getElementById('deleteBtn').onclick = deleteSelection;
document.getElementById('sortBtn').onclick = autoSort;
document.getElementById('layoutFamilyBtn')?.addEventListener('click', autoLayoutByFamily);
document.getElementById('distributeHBtn')?.addEventListener('click', () => distribute('horizontal'));
document.getElementById('distributeVBtn')?.addEventListener('click', () => distribute('vertical'));
document.getElementById('addGroupBtn').onclick = groupSelection;
document.getElementById('ungroupBtn').onclick = ungroupSelection;
document.getElementById('saveBtn').onclick = save;
document.getElementById('loadBtn').onclick = load;
document.getElementById('exportBtn').onclick = exportFile;
document.getElementById('importBtn').onclick = () => document.getElementById('importFileInput').click();
document.getElementById('importFileInput').addEventListener('change', e => { importFile(e.target.files[0]); e.target.value = ''; });
document.getElementById('clearBtn').onclick = () => { if (confirm('Vider le projet actif ?')) { pushHistory(); const p = currentProject(); p.nodes=[]; p.connections=[]; p.groups=[]; state.selectedNodes.clear(); render(); } };
document.querySelectorAll('[data-align]').forEach(b => b.onclick = () => align(b.dataset.align));


document.getElementById('editModeBtn')?.addEventListener('click', () => setViewMode('edit'));
document.getElementById('readModeBtn')?.addEventListener('click', () => setViewMode('read'));
document.getElementById('auditModeBtn')?.addEventListener('click', () => setViewMode('audit'));
document.getElementById('legendToggleBtn')?.addEventListener('click', toggleLegend);
flowSearchInput?.addEventListener('input', () => { updateSearchResults(true); if (state.searchResults.length) goToSearchResult(0); });
flowSearchInput?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); goToSearchResult(e.shiftKey ? -1 : 1); } });
document.getElementById('searchPrevBtn')?.addEventListener('click', () => goToSearchResult(-1));
document.getElementById('searchNextBtn')?.addEventListener('click', () => goToSearchResult(1));
setupToolPalette();
setupContextMenu();
setupWelcomeModal();
setupExcelImport();
setupPdfFileInput();
loadRecentColors();
ensureProject();
syncInspector();
render();
openWelcomeModal();
