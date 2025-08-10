// Whiteboard prototype using Konva.js
// Supports: select/move, sticky notes (editable), shapes, flexible curved connectors.
// Local export/import (Konva stage toJSON / fromJSON)

const WIDTH = window.innerWidth - 120;
const HEIGHT = window.innerHeight;

const stage = new Konva.Stage({
  container: 'container',
  width: window.innerWidth - 120,
  height: window.innerHeight,
  draggable: false
});
const layer = new Konva.Layer();
stage.add(layer);

let mode = 'select'; // select, sticky, connect, shape
let selectedShape = null;
let connectSource = null;
let tempLine = null;
let actionStack = [];

// helper to push action for undo
function pushAction() { try { actionStack.push(stage.toJSON()); if(actionStack.length>50) actionStack.shift(); } catch(e){} }

// create a sticky note (group of rect + text)
function createSticky(x, y, text='New note') {
  pushAction();
  const group = new Konva.Group({ x, y, draggable:true });
  const rect = new Konva.Rect({
    width: 160, height: 90, fill: '#fff59d', cornerRadius: 6, stroke: '#e2c64d', strokeWidth: 2, shadowColor:'#000', shadowBlur:6, shadowOpacity:0.06
  });
  const txt = new Konva.Text({
    text: text, fontSize:14, padding:8, width:150, wrap:'word', fill:'#111', lineHeight:1.2
  });
  group.add(rect); group.add(txt);
  group.on('dblclick', ()=>{ editText(group, txt); });
  group.on('click', (e)=>{ if(mode==='connect'){ startConnect(group); e.cancelBubble=true; } selectNode(group); });
  group.on('dragend', ()=>{ pushAction(); });
  // store metadata
  group.sceneFunc = group.sceneFunc; // placeholder
  layer.add(group); layer.draw();
  selectNode(group);
  return group;
}

// create generic shape
function createShape(x,y,type){
  pushAction();
  let shape;
  const group = new Konva.Group({ x, y, draggable:true });
  if(type==='rect'){
    shape = new Konva.Rect({ width:120, height:70, fill:'#fff', stroke:'#475569', cornerRadius:6 });
  } else if(type==='circle'){
    shape = new Konva.Circle({ radius:40, fill:'#fff', stroke:'#475569' });
  } else if(type==='diamond'){
    // diamond as rotated rect
    shape = new Konva.RegularPolygon({ sides:4, radius:50, rotation:45, fill:'#fff', stroke:'#475569' });
  } else if(type==='star'){
    shape = new Konva.Star({ numPoints:5, innerRadius:18, outerRadius:40, fill:'#fff', stroke:'#475569' });
  } else if(type==='triangle'){
    shape = new Konva.RegularPolygon({ sides:3, radius:48, fill:'#fff', stroke:'#475569' });
  } else if(type==='speech'){
    const rect = new Konva.Rect({ width:140, height:70, fill:'#fff', stroke:'#475569', cornerRadius:6 });
    const tail = new Konva.RegularPolygon({ sides:3, radius:10, fill:'#fff', stroke:'#475569', rotation:90, x:110, y:60 });
    group.add(rect); group.add(tail);
    group.on('click', ()=> selectNode(group));
    group.on('dragend', ()=> pushAction());
    layer.add(group); layer.draw();
    selectNode(group);
    return group;
  }
  group.add(shape);
  // add label
  const label = new Konva.Text({ text: type, fontSize:13, width:120, padding:6, align:'center', y: (type==='circle'?40:20) });
  group.add(label);
  group.on('click', ()=> selectNode(group));
  group.on('dragend', ()=> pushAction());
  layer.add(group); layer.draw();
  selectNode(group);
  return group;
}

// editing sticky text using overlay textarea
const textArea = document.getElementById('textEditor');
function editText(group, textNode){
  // show textarea at position
  const absPos = group.getClientRect();
  textArea.style.display = 'block';
  textArea.value = textNode.text();
  textArea.style.left = (absPos.x + 130) + 'px';
  textArea.style.top = (absPos.y + 60) + 'px';
  textArea.style.width = Math.max(120, textNode.width()) + 'px';
  textArea.style.height = Math.max(40, textNode.height()) + 'px';
  textArea.focus();
  function apply(){
    pushAction();
    textNode.text(textArea.value);
    layer.draw();
    textArea.style.display='none';
    textArea.onblur = null;
  }
  textArea.onblur = apply;
  textArea.onkeydown = function(e){ if(e.key==='Enter' && (e.ctrlKey||e.metaKey)){ apply(); } if(e.key==='Escape'){ textArea.style.display='none'; } }
}

// selecting shapes
function selectNode(node){
  // deselect previous
  if(selectedShape && selectedShape !== node){
    selectedShape.children && selectedShape.children.each ? selectedShape.children.each(c=>c.stroke && c.stroke('#475569')) : null;
  }
  selectedShape = node;
  // highlight
  if(node){
    if(node.findOne && node.findOne('rect')){
      const r = node.findOne('rect');
      r.stroke('#7c3aed');
      r.strokeWidth(3);
    } else {
      node.find('shape').each(s=> s.stroke && s.stroke('#7c3aed'));
    }
    updatePreview(node);
  }
  layer.draw();
}

// update selected preview simple
function updatePreview(node){
  const preview = document.getElementById('selectedPreview');
  if(!node){ preview && (preview.innerText=''); return; }
  preview && (preview.innerText = 'Selected');
}

// connection logic (create flexible curved connector)
function startConnect(nodeGroup){
  if(!connectSource){ connectSource = nodeGroup; updateStatus('Select target node to connect'); return; }
  if(connectSource === nodeGroup){ connectSource=null; updateStatus('Cancelled'); return; }
  // compute centers
  const p1 = getGroupCenter(connectSource);
  const p2 = getGroupCenter(nodeGroup);
  const line = new Konva.Line({
    points:[p1.x, p1.y, (p1.x+p2.x)/2, (p1.y+p2.y)/2 - 80, p2.x, p2.y],
    stroke:'#1f2937', strokeWidth:3, lineCap:'round', lineJoin:'round', tension:0.5, bezier:true,
  });
  // arrowhead implemented as small triangle
  const arrow = new Konva.Arrow({
    points:[p1.x, p1.y, p2.x, p2.y],
    pointerLength:10, pointerWidth:10, stroke:'#1f2937', fill:'#1f2937', strokeWidth:0
  });
  // group the connector so it moves if nodes move (we'll attach to stage layer and update on drag)
  const connGroup = new Konva.Group();
  connGroup.add(line);
  connGroup.add(arrow);
  layer.add(connGroup);
  // store metadata linking nodes
  connGroup.toJSONData = { sourceId: connectSource._id, targetId: nodeGroup._id };
  // when source or target moves, update line points by listening to dragmove event for both groups
  function updateConnection(){
    const a = getGroupCenter(connectSource);
    const b = getGroupCenter(nodeGroup);
    line.points([a.x, a.y, (a.x+b.x)/2, (a.y+b.y)/2 - 80, b.x, b.y]);
    arrow.points([a.x, a.y, b.x, b.y]);
    layer.batchDraw();
  }
  connectSource.on('dragmove.connection', updateConnection);
  nodeGroup.on('dragmove.connection', updateConnection);
  // finalize
  connectSource = null;
  pushAction();
  updateStatus('Connection created');
  layer.draw();
}

// helper: get center of a group or shape
function getGroupCenter(g){
  const box = g.getClientRect({ relativeTo: layer });
  return { x: box.x + box.width/2, y: box.y + box.height/2 };
}

// update status preview
function updateStatus(t){ const preview = document.getElementById('selectedPreview'); if(preview) preview.innerText = t; }

// delete selected
function deleteSelected(){
  if(!selectedShape) return;
  pushAction();
  // if selectedShape is a Konva.Group or Shape
  selectedShape.destroy();
  selectedShape = null;
  layer.draw();
  updateStatus('Deleted');
}

// undo
function undo(){
  if(actionStack.length===0) return alert('Nothing to undo');
  const last = actionStack.pop();
  try{
    layer.destroyChildren();
    stage.clear();
    stage.removeChildren();
    // create new layer and load from JSON
    const newStage = Konva.Node.create(last, 'container');
    // replace stage (simple approach: reload page content)
    location.reload();
  }catch(e){ alert('Undo failed'); console.error(e); }
}

// export / import
function exportJSON(){
  const json = stage.toJSON();
  const blob = new Blob([json], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'whiteboard_' + new Date().toISOString().slice(0,10) + '.json'; a.click(); URL.revokeObjectURL(url);
}

function importJSONFile(file){
  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      const json = e.target.result;
      // clear, then create nodes from json
      layer.destroyChildren();
      stage.destroyChildren();
      // rebuild stage from JSON
      const obj = JSON.parse(json);
      Konva.Node.create(obj, 'container');
      location.reload();
    }catch(err){ alert('Invalid JSON'); console.error(err); }
  };
  reader.readAsText(file);
}

// clear board
function clearBoard(){ if(!confirm('Clear the board?')) return; pushAction(); layer.destroyChildren(); layer.draw(); updateStatus('Cleared'); }

// helpers to assign ids to groups for connections metadata
let idCounter = 1;
function assignId(node){
  if(!node._id) node._id = 'g_' + (idCounter++);
}

// click handlers for stage
stage.on('click', (e)=>{
  if(mode === 'sticky' && e.target === stage){ const pos = stage.getPointerPosition(); const g = createSticky(pos.x, pos.y); assignId(g); }
  if(mode === 'shape' && e.target === stage){ /* creating shapes handled via menu */ }
});

// wire UI
document.getElementById('selectTool').addEventListener('click', ()=>{ setMode('select'); });
document.getElementById('stickyTool').addEventListener('click', ()=>{ setMode('sticky'); });
document.getElementById('arrowTool').addEventListener('click', ()=>{ setMode('connect'); });
document.getElementById('shapeBtn').addEventListener('click', ()=>{ const s = document.getElementById('shapesList'); s.style.display = s.style.display==='block' ? 'none' : 'block'; });
document.querySelectorAll('.shapeItem').forEach(b=> b.addEventListener('click', ()=>{ setMode('shape'); const type = b.dataset.shape; const pos = { x: 300 + Math.random()*200, y: 120 + Math.random()*200 }; const g = createShape(pos.x,pos.y,type); assignId(g); document.getElementById('shapesList').style.display='none'; }));

document.getElementById('delBtn').addEventListener('click', ()=> deleteSelected());
document.getElementById('undoBtn').addEventListener('click', ()=> undo());
document.getElementById('exportBtn').addEventListener('click', ()=> exportJSON());
document.getElementById('importBtn').addEventListener('click', ()=> document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', (e)=> { if(e.target.files && e.target.files[0]) importJSONFile(e.target.files[0]); });
document.getElementById('clearBtn').addEventListener('click', ()=> clearBoard());
document.getElementById('fitBtn').addEventListener('click', ()=> stage.container().scrollIntoView({behavior:'smooth'}));

// selection via click on shapes (listen to layer clicks)
layer.on('click', function(e){
  if(e.target && e.target.getParent && e.target.getParent() instanceof Konva.Group){
    const group = e.target.getParent();
    selectNode(group);
  }
});

// ensure new groups get ids and are selectable
layer.on('add', function(e){ try{ assignId(e.target); }catch(e){}});

// mode
function setMode(m){
  mode = m;
  document.querySelectorAll('.tool').forEach(t=>t.classList.remove('active'));
  if(m === 'select') document.getElementById('selectTool').classList.add('active');
  if(m === 'sticky') document.getElementById('stickyTool').classList.add('active');
  if(m === 'connect') document.getElementById('arrowTool').classList.add('active');
  updateStatus('Mode: ' + m);
}

// helper escape
function escapeHtml(s){ return (s||'').replace(/[&<"'>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// init
setMode('select');
layer.draw();
window.addEventListener('resize', ()=>{ stage.width(window.innerWidth - 120); stage.height(window.innerHeight); });