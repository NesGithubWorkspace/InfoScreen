function getLookup(){ return JSON.parse(document.getElementById('lookup').textContent); }
    function toMinutes(hhmm){ const [h,m]=hhmm.split(':').map(Number); return h*60+(m||0); }
    function pad(n){ return n.toString().padStart(2,'0'); }

    // Weekday helpers
    const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    function normalizeDayName(x){ return String(x).slice(0,3).toLowerCase(); }
    function matchesToday(ev, todayIndex){
      if (!ev || (!ev.days && ev.day == null && !ev.weekdays)) return true; // no constraint = every day
      const todayKey = DAY_NAMES[todayIndex].toLowerCase();
      let list = [];
      if (Array.isArray(ev.days)) list = list.concat(ev.days);
      if (Array.isArray(ev.weekdays)) list = list.concat(ev.weekdays);
      if (ev.day != null) list.push(ev.day);
      return list.some(val => {
        if (typeof val === 'number' && Number.isFinite(val)) return val === todayIndex; // 0..6
        return normalizeDayName(val) === todayKey;
      });
    }

    function groupAndLane(events){
      // 1) Split into conflict groups (interval clusters)
      const sorted = [...events].sort((a,b)=> a._startMin - b._startMin || b._endMin - a._endMin);
      const groups = [];
      let current = [];
      let groupEnd = -Infinity;
      for (const ev of sorted) {
        if (current.length === 0 || ev._startMin < groupEnd) {
          current.push(ev);
          groupEnd = Math.max(groupEnd, ev._endMin);
        } else {
          groups.push(current);
          current = [ev];
          groupEnd = ev._endMin;
        }
      }
      if (current.length) groups.push(current);

      // 2) Assign lanes *within each group*
      groups.forEach((group, gid)=>{
        const lanes = [];
        group.sort((a,b)=> a._startMin - b._startMin || b._endMin - a._endMin).forEach(ev=>{
          let placed = false;
          for (let i=0;i<lanes.length;i++){
            if (ev._startMin >= lanes[i]) { ev._lane = i; lanes[i] = ev._endMin; placed = true; break; }
          }
          if (!placed) { ev._lane = lanes.length; lanes.push(ev._endMin); }
          ev._group = gid;
          ev._laneCount = lanes.length; // provisional; finalized after loop
        });
        // finalize laneCount for all events in this group
        group.forEach(ev => ev._laneCount = lanes.length);
      });

      return sorted; // each event now has _lane and _laneCount (per its conflict group)
    }

    function render(){
      const lookup = getLookup();
      const startHour = lookup.settings?.startHour ?? 6;
      const endHour   = lookup.settings?.endHour ?? 23;
      const hourCount = Math.max(1, endHour - startHour);
      const board     = document.getElementById('board');

      // Compute per-hour height in pixels from actual board height
      const boardRect = board.getBoundingClientRect();
      const hourHeightPx = boardRect.height / hourCount;
      const pxPerMin = hourHeightPx / 60;

      // Sync CSS vars so grid + labels align with pixel math
      board.style.setProperty('--hours', String(hourCount)); // rows correspond to each hour span
      board.style.setProperty('--hourHeight', `${hourHeightPx}px`);

      // Date / header
      let day = new Date();
      if (lookup.settings?.date && lookup.settings.date !== 'today') {
        day = new Date(lookup.settings.date + 'T00:00:00');
      }
      const todayIdx = day.getDay();
      document.getElementById('dayTitle').textContent = lookup.settings?.title || "Today's Schedule";
      document.getElementById('daySub').textContent = day.toLocaleDateString('da-DK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      // Logo handling: if settings.logoUrl exists, show the image and hide the title text
      const headerEl = document.getElementById('header');
      const brandEl = document.getElementById('brand');
      const logoUrl = lookup.settings?.logoUrl;
      const logoHeight = lookup.settings?.logoHeight; // optional number in px
      if (logoUrl) {
        brandEl.src = logoUrl;
        brandEl.alt = lookup.settings?.logoAlt || (lookup.settings?.title || 'Logo');
        headerEl.classList.add('has-logo');
        if (Number.isFinite(logoHeight)) {
          document.documentElement.style.setProperty('--logoH', logoHeight + 'px');
        }
      } else {
        headerEl.classList.remove('has-logo');
        brandEl.removeAttribute('src');
      }

      // Hour labels (top of each hour span)
      const labels = document.getElementById('labels');
      labels.innerHTML = '';
      for (let h = startHour; h < endHour; h++) { // exclusive of endHour to avoid overflow
        const el = document.createElement('div');
        el.className = 'label';
        el.setAttribute('data-time', `${pad(h)}:00`);
        labels.appendChild(el);
      }

      // Event area (in pixels)
      const startMin = startHour * 60;
      const endMin   = endHour   * 60;
      const eventsEl = document.getElementById('events');
      eventsEl.innerHTML = '';

      const todays = (lookup.events || []).filter(ev => matchesToday(ev, todayIdx)).map((ev,i)=>{
        const s = Math.max(startMin, toMinutes(ev.start));
        const e = Math.min(endMin,   toMinutes(ev.end));
        return {...ev, _startMin: s, _endMin: Math.max(e, s + 5)}; // min 5 minutes
      }).filter(ev => ev._endMin > startMin && ev._startMin < endMin);

      const items = groupAndLane(todays);

      // Width math for lanes in pixels
      const rootStyles = getComputedStyle(document.documentElement);
      const labelWidthPx = parseFloat(rootStyles.getPropertyValue('--labelWidth')) || 64;
      const leftGutter = 12, rightGutter = 12;
      const availableWidth = Math.max(0, boardRect.width - labelWidthPx - leftGutter - rightGutter);
      // lane width depends on each event's conflict group

      for (const ev of items) {
        const topPx = (ev._startMin - startMin) * pxPerMin;
        const heightPx = Math.max((ev._endMin - ev._startMin) * pxPerMin, 5 * pxPerMin);
        const laneWidth = availableWidth / ev._laneCount;
        const leftPx = labelWidthPx + leftGutter + ev._lane * laneWidth;
        const widthPx = Math.max(0, laneWidth - 6); // small gutter between lanes

        const color = (lookup.palette && lookup.palette[ev.type]) || '#3b82f6';
        const card = document.createElement('div');
        card.className = 'event';
        card.style.top = topPx + 'px';
        card.style.height = heightPx + 'px';
        card.style.left = leftPx + 'px';
        card.style.width = widthPx + 'px';
        card.style.background = `linear-gradient(180deg, ${color}cc, ${color}99)`;
        card.innerHTML = `<div class="title">${ev.title || 'Untitled'}</div>
                          <div class="meta">${pad(Math.floor(ev._startMin/60))}:${pad(ev._startMin%60)}–${pad(Math.floor(ev._endMin/60))}:${pad(ev._endMin%60)}${ev.room?` • ${ev.room}`:''}${ev.teacher?` • ${ev.teacher}`:''} • ${(ev.type||'')}</div>`;
        eventsEl.appendChild(card);
      }

      // Legend
      const legend = document.getElementById('legend');
      legend.innerHTML = '';
      if (lookup.palette) {
        Object.entries(lookup.palette).forEach(([name, col]) => {
          const key = document.createElement('div');
          key.className = 'key';
          key.innerHTML = `<span class="swatch" style="background:${col}"></span>${name}`;
          legend.appendChild(key);
        });
      }

      // Now line in pixels
      const oldNow = document.querySelector('.now');
      if (oldNow) oldNow.remove();
      if (lookup.settings?.showNowLine) {
        const now = new Date();
        const nowMin = now.getHours()*60 + now.getMinutes();
        if (nowMin >= startMin && nowMin <= endMin) {
          const nowTopPx = (nowMin - startMin) * pxPerMin;
          const nowEl = document.createElement('div');
          nowEl.className = 'now';
          nowEl.style.top = nowTopPx + 'px';
          nowEl.innerHTML = '<div class="dot" aria-hidden="true"></div>';
          board.appendChild(nowEl);
        }
      }
    }

    render();
    setInterval(render, 60*1000);
    window.addEventListener('keydown', (e) => { if (e.key && e.key.toLowerCase() === 'r') render(); });
    
    function isFullscreen(){
      return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    }
    function enterFullscreen(){
      const el = document.documentElement;
      const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (fn) return fn.call(el, { navigationUI: 'hide' });
      return Promise.reject(new Error('Fullscreen API not supported'));
    }
    function showFsPrompt(show){ const el = document.getElementById('fsPrompt'); if (!el) return; if (show) el.removeAttribute('hidden'); else el.setAttribute('hidden',''); }
    async function ensureFullscreen(init){
      if (isFullscreen()) { showFsPrompt(false); return; }
      try { await enterFullscreen(); showFsPrompt(false); }
      catch(e){ if (init) showFsPrompt(true); }
    }
    document.addEventListener('fullscreenchange', () => showFsPrompt(!isFullscreen()));
    document.addEventListener('webkitfullscreenchange', () => showFsPrompt(!isFullscreen()));
    document.addEventListener('keydown', (e) => { if (e.key && e.key.toLowerCase() === 'f') ensureFullscreen(false); });
    document.addEventListener('click', () => ensureFullscreen(false));
    window.addEventListener('load', () => ensureFullscreen(true), { once: true });