(() => {
  const API_BASE = window.__API_BASE || 'http://localhost:3000/api';

  function qs(id) { return document.getElementById(id); }

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  async function fetchEvents() {
    const res = await fetch(`${API_BASE}/health-events?limit=100`);
    if (!res.ok) throw new Error('Failed to load events');
    return res.json();
  }

  function renderEvents(events) {
    const list = qs('events-list');
    list.innerHTML = '';
    for (const e of events) {
      const li = document.createElement('li');
      li.className = 'event';
      li.innerHTML = `<div class="meta"><strong>${e.date}</strong> <span class="category">${e.category}</span></div>
                      <div class="body">${e.notes || ''} ${e.intensity ? ' — Intensity: '+e.intensity : ''} ${e.duration_minutes ? ' — '+e.duration_minutes+'m' : ''}</div>
                      <div class="controls"><button data-id="${e.id}" class="del">Delete</button></div>`;
      list.appendChild(li);
    }
    qs('events-count').textContent = `${events.length} events`;
    attachDeleteHandlers();
    renderSparkline(events);
  }

  function attachDeleteHandlers(){
    document.querySelectorAll('.del').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        const id = btn.getAttribute('data-id');
        if (!confirm('Delete this event?')) return;
        try {
          const res = await fetch(`${API_BASE}/health-events/${id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Delete failed');
          loadAndRender();
        } catch (err) {
          alert('Delete failed');
        }
      });
    });
  }

  async function submitForm(ev) {
    ev.preventDefault();
    const payload = {
      date: qs('event-date').value,
      category: qs('category').value,
      intensity: qs('intensity').value ? Number(qs('intensity').value) : undefined,
      duration_minutes: qs('duration').value ? Number(qs('duration').value) : undefined,
      notes: qs('notes').value || undefined
    };
    try {
      const res = await fetch(`${API_BASE}/health-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(()=>({error:'unknown'}));
        qs('form-msg').textContent = 'Error: ' + (err.error || 'Failed');
        return;
      }
      qs('form-msg').textContent = 'Logged ✓';
      qs('health-form').reset();
      qs('event-date').value = todayISO();
      loadAndRender();
    } catch (err) {
      qs('form-msg').textContent = 'Network error';
    }
  }

  function renderSparkline(events) {
    const canvas = qs('sparkline');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // Use intensity if present, otherwise use duration_minutes (scaled)
    const values = events.slice(0,50).map(e => e.intensity ?? (e.duration_minutes ? Math.min(10, Math.round(e.duration_minutes/30)) : 0)).reverse();
    if (values.length === 0) return;
    const w = canvas.width, h = canvas.height; 
    const max = Math.max(...values) || 1;
    const min = Math.min(...values);
    ctx.strokeStyle = '#2b7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v,i) => {
      const x = (i/(values.length-1||1))*(w-10)+5;
      const y = h - ((v-min)/(max-min||1))*(h-10)-5;
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
  }

  async function loadAndRender(){
    try {
      const data = await fetchEvents();
      renderEvents(data.events || []);
    } catch (err) {
      qs('form-msg').textContent = 'Failed to load events';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    qs('event-date').value = todayISO();
    qs('health-form').addEventListener('submit', submitForm);
    qs('refresh').addEventListener('click', loadAndRender);
    loadAndRender();
  });

})();
