Hooks.once('init', async function() {
  console.log('Journal Graph | Initializing');
  Handlebars.registerHelper("ifEquals", (a,b,opts) => a==b ? opts.fn(this) : opts.inverse(this));
});

Hooks.on('renderJournalSheet', (app, html, data) => {
  const btn = $(`<a class="open-graph"><i class="fas fa-project-diagram"></i> Graph</a>`);
  btn.click(() => {
    new GraphApp(app.document).render(true);
  });
  html.closest('.app').find('.open-graph').remove();
  html.closest('.app').find('.window-title').after(btn);
});

class GraphApp extends Application {
  constructor(journal, options={}) {
    super(options);
    this.journal = journal;
    this.mode = 'view';
    this.dragging = false;
    this.currentEdge = null;
    this.nodes = [];
    this.edges = [];
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: 'journal-graph',
      template: 'templates/graph.html',
      resizable: true,
      width: 800,
      height: 600,
      title: 'Journal Graph'
    });
  }

  async getData() {
    const data = this.journal.getFlag('journal-graph', 'data') || {nodes:[], edges:[]};
    this.nodes = data.nodes;
    this.edges = data.edges;
    return {mode: this.mode};
  }

  activateListeners(html) {
    super.activateListeners(html);
    this.canvas = html.find('#graph-canvas')[0];
    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.draw();

    html.find('.controls button').click(ev => this.onControl(ev));
    this.canvas.addEventListener('mousedown', ev => this.onMouseDown(ev));
    this.canvas.addEventListener('mousemove', ev => this.onMouseMove(ev));
    this.canvas.addEventListener('mouseup', ev => this.onMouseUp(ev));
    this.canvas.addEventListener('dblclick', ev => this.onDoubleClick(ev));

    html.on('drop', ev => this.onDrop(ev.originalEvent));
    html.on('dragover', ev => ev.preventDefault());
  }

  resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.draw();
  }

  draw() {
    if (!this.ctx) return;
    this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    // draw edges
    for (let e of this.edges) {
      this.drawEdge(e);
    }
    // draw nodes
    for (let n of this.nodes) {
      this.drawNode(n);
    }
  }

  drawNode(node) {
    const ctx = this.ctx;
    ctx.save();
    if (node.bg) {
      const img = new Image();
      img.src = node.bg;
      ctx.drawImage(img, node.x-30, node.y-30, 60, 60);
    }
    ctx.beginPath();
    switch(node.shape) {
      case 'circle':
        ctx.arc(node.x, node.y, 30, 0, Math.PI*2);
        break;
      case 'diamond':
        ctx.moveTo(node.x, node.y-30);
        ctx.lineTo(node.x+30, node.y);
        ctx.lineTo(node.x, node.y+30);
        ctx.lineTo(node.x-30, node.y);
        ctx.closePath();
        break;
      default:
        ctx.rect(node.x-30, node.y-30, 60, 60);
    }
    ctx.fillStyle = node.fill || '#fff';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.label || '', node.x, node.y);
    ctx.restore();
  }

  drawEdge(edge) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    const a = this.getNode(edge.from);
    const b = this.getNode(edge.to);
    if (!a || !b) return;
    ctx.moveTo(a.x, a.y);
    for (let p of (edge.points||[])) {
      ctx.lineTo(p.x, p.y);
    }
    ctx.lineTo(b.x, b.y);
    if (edge.style === 'dashed') ctx.setLineDash([5,5]);
    ctx.strokeStyle = '#000';
    ctx.stroke();
    if (edge.style === 'arrow') {
      const angle = Math.atan2(b.y-a.y, b.x-a.x);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - 10*Math.cos(angle-0.3), b.y - 10*Math.sin(angle-0.3));
      ctx.lineTo(b.x - 10*Math.cos(angle+0.3), b.y - 10*Math.sin(angle+0.3));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  getNode(id) {
    return this.nodes.find(n => n.id === id);
  }

  onControl(ev) {
    const action = ev.currentTarget.dataset.action;
    switch(action) {
      case 'edit':
        this.mode = 'edit';
        break;
      case 'view':
        this.mode = 'view';
        break;
      case 'add-node':
        this.tool = 'node';
        break;
      case 'add-edge':
        this.tool = 'edge';
        break;
      case 'save':
        this.save();
        break;
      case 'clear':
        this.nodes = [];
        this.edges = [];
        this.save();
        break;
    }
    this.render(false);
  }

  onMouseDown(ev) {
    if (this.mode !== 'edit') return;
    const {offsetX:x, offsetY:y} = ev;
    if (this.tool === 'node') {
      const id = randomID();
      this.nodes.push({id, x, y, shape:'rect', label:'Node'});
      this.tool = null;
      this.draw();
    } else if (this.tool === 'edge') {
      const node = this.getNodeAt(x,y);
      if (node) {
        this.currentEdge = {id: randomID(), from: node.id, to: null, points: []};
        this.edges.push(this.currentEdge);
        this.dragging = true;
      }
    } else {
      // dragging node
      const node = this.getNodeAt(x,y);
      if (node) {
        this.dragging = node;
      }
    }
  }

  onMouseMove(ev) {
    if (this.mode !== 'edit') return;
    const {offsetX:x, offsetY:y} = ev;
    if (this.dragging && this.dragging.id) {
      this.dragging.x = x;
      this.dragging.y = y;
      this.draw();
    } else if (this.dragging && this.currentEdge) {
      this.currentEdge.temp = {x,y};
      this.draw();
      this.drawTempEdge(this.currentEdge);
    }
  }

  onMouseUp(ev) {
    if (this.mode !== 'edit') return;
    const {offsetX:x, offsetY:y} = ev;
    if (this.dragging && this.dragging.id) {
      this.dragging = false;
      this.draw();
    } else if (this.currentEdge) {
      const node = this.getNodeAt(x,y);
      if (node && node.id !== this.currentEdge.from) {
        this.currentEdge.to = node.id;
      } else {
        this.edges = this.edges.filter(e => e !== this.currentEdge);
      }
      this.currentEdge = null;
      this.ensureBounds();
      this.dragging = false;
      this.draw();
    }
  }

  onDoubleClick(ev) {
    if (this.mode !== 'edit') {
      const node = this.getNodeAt(ev.offsetX, ev.offsetY);
      if (node && node.link) {
        const doc = fromUuidSync(node.link);
        if (doc) doc.sheet.render(true);
      }
      return;
    }
    const node = this.getNodeAt(ev.offsetX, ev.offsetY);
    if (node) this.editNode(node);
  }

  onDrop(ev) {
    const data = JSON.parse(ev.dataTransfer.getData('text/plain'));
    if (data && data.uuid) {
      const pos = this.canvas.getBoundingClientRect();
      const x = ev.clientX - pos.left;
      const y = ev.clientY - pos.top;
      const id = randomID();
      this.nodes.push({id, x, y, shape:'rect', label:data.name, link:data.uuid});
      this.draw();
    }
  }

  drawTempEdge(edge) {
    const ctx = this.ctx;
    const a = this.getNode(edge.from);
    if (!a) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(edge.temp.x, edge.temp.y);
    ctx.setLineDash([5,5]);
    ctx.stroke();
    ctx.restore();
  }

  getNodeAt(x,y) {
    return this.nodes.find(n => Math.abs(n.x - x) <= 30 && Math.abs(n.y - y) <= 30);
  }
  ensureBounds() {
    const margin = 50;
    let resized = false;
    for (let n of this.nodes) {
      if (n.x > this.canvas.width - margin) {
        this.canvas.width += 200;
        resized = true;
      }
      if (n.y > this.canvas.height - margin) {
        this.canvas.height += 200;
        resized = true;
      }
    }
    if (resized) this.draw();
  }


  editNode(node) {
    new NodeConfig(node, updated => {
      Object.assign(node, updated);

      this.draw();
    }).render(true);
  }

  async save() {
    await this.journal.setFlag('journal-graph', 'data', {nodes:this.nodes, edges:this.edges});
    ui.notifications.info('Graph saved');
  }
}

class NodeConfig extends FormApplication {
  constructor(node, onSave, options={}) {
    super(node, options);
    this.node = node;
    this.onSave = onSave;
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      title: 'Node Configuration',
      template: 'templates/node-config.html',
      width: 300
    });
  }

  getData() { return this.node; }

  async _updateObject(event, formData) {
    this.onSave(formData);
  }
}
