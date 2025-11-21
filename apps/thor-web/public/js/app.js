
  // ======= Helpers =======
  const $ = (id) => document.getElementById(id);

  // Convert Date object to YYYY-MM-DD using LOCAL timezone (not UTC)
  const toLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayISO = () => toLocalDateString(new Date());
  const toDow = (d) => {
    // Parse date in local timezone to avoid UTC offset issues
    const parts = d.split('-');
    const x = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const g = x.getDay();
    return g === 0 ? 7 : g;
  };

  // ======= Toast Notifications =======
  function showToast(message, type = 'info') {
    const container = $("toastContainer");
    const toast = document.createElement('div');
    const bgColors = {
      success: 'bg-emerald-500',
      error: 'bg-rose-500',
      info: 'bg-indigo-500',
      warning: 'bg-amber-500'
    };

    toast.className = `${bgColors[type]} text-white px-4 py-3 rounded-lg shadow-lg transform transition-all duration-300 ease-in-out max-w-sm`;
    toast.textContent = message;
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';

    container.appendChild(toast);

    // Animate in
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';
    }, 10);

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => container.removeChild(toast), 300);
    }, 3000);
  }

  // ======= Button Loading States =======
  function setButtonLoading(btn, isLoading, loadingText = 'Loading...') {
    if (isLoading) {
      btn.dataset.originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = loadingText;
      btn.style.opacity = '0.6';
      btn.style.cursor = 'not-allowed';
    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset.originalText || btn.textContent;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    }
  }

  // ======= Loading Skeleton =======
  function showLoadingSkeleton(containerId, count = 2) {
    const skeleton = `
      <div class="animate-pulse">
        ${Array(count).fill(0).map(() => `
          <div class="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 mb-3">
            <div class="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-1/3 mb-3"></div>
            <div class="space-y-2">
              <div class="h-3 bg-neutral-200 dark:bg-neutral-700 rounded w-full"></div>
              <div class="h-3 bg-neutral-200 dark:bg-neutral-700 rounded w-5/6"></div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    $(containerId).innerHTML = skeleton;
  }

  // ======= Custom Confirmation Dialog =======
  function showConfirm(options = {}) {
    const {
      title = 'Confirm Action',
      message = 'Are you sure you want to proceed?',
      confirmText = 'Delete',
      cancelText = 'Cancel',
      type = 'danger', // 'danger' or 'warning'
      icon = '⚠️'
    } = options;

    return new Promise((resolve) => {
      const modal = $('confirmModal');
      const titleEl = $('confirmTitle');
      const messageEl = $('confirmMessage');
      const iconEl = $('confirmIcon');
      const confirmBtn = $('confirmOkBtn');
      const cancelBtn = $('confirmCancelBtn');

      // Set content
      titleEl.textContent = title;
      messageEl.textContent = message;
      iconEl.textContent = icon;
      confirmBtn.textContent = confirmText;
      cancelBtn.textContent = cancelText;

      // Set button color based on type
      if (type === 'danger') {
        confirmBtn.className = 'flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 font-medium transition-colors';
      } else {
        confirmBtn.className = 'flex-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 font-medium transition-colors';
      }

      // Show modal
      modal.classList.remove('hidden');
      modal.classList.add('flex');

      // Handle confirm
      const handleConfirm = () => {
        cleanup();
        resolve(true);
      };

      // Handle cancel
      const handleCancel = () => {
        cleanup();
        resolve(false);
      };

      // Close on escape key
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          handleCancel();
        }
      };

      // Cleanup function
      const cleanup = () => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        document.removeEventListener('keydown', handleEscape);
      };

      // Add event listeners
      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      document.addEventListener('keydown', handleEscape);

      // Close on backdrop click
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          handleCancel();
        }
      });
    });
  }

  // Init date input to today
  $("dateInput").value = todayISO();

  function apiBase() {
    const apiUrlEl = $("apiUrl");
    let base = apiUrlEl ? apiUrlEl.value.replace(/\/$/, "") : defaultApi;

    // Remove any repeated /api segments (fixes corruption from previous bug)
    base = base.replace(/\/api(\/api)+/g, '/api');

    // Only add /api if it's not already there
    if (!base.endsWith('/api')) {
      base += '/api';
    }

    return base;
  }

  // ======= Config bootstrap & persistence =======
const LS_KEY = "thor_mvp_cfg";
function loadStoredCfg() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
function saveStoredCfg(obj) {
  localStorage.setItem(LS_KEY, JSON.stringify(obj || {}));
}

// Default API base: port 3000 for separate API server (if not stored)
const stored = loadStoredCfg();
// Use current hostname so it works from any device (localhost or LAN IP)
const defaultApi = stored.apiBase || `http://${window.location.hostname}:3000`;

// Show active backend status
function setCfgPill(state, detail) {
  const el = $("cfgPill");
  if (!el) return;
  const classes = "text-xs px-2 py-0.5 rounded-full";
  if (state === "ok") {
    el.className = classes + " bg-emerald-200/70 dark:bg-emerald-700/60 text-emerald-900 dark:text-emerald-100";
    el.textContent = detail || "ready";
  } else if (state === "warn") {
    el.className = classes + " bg-amber-200/70 dark:bg-amber-700/60 text-amber-900 dark:text-amber-100";
    el.textContent = detail || "config?";
  } else {
    el.className = classes + " bg-rose-200/70 dark:bg-rose-700/60 text-rose-900 dark:text-rose-100";
    el.textContent = detail || "offline";
  }
}

// Probe /config and /health (safe subset)
async function probeBackend() {
  const base = apiBase();
  try {
    const [cfgRes, healthRes] = await Promise.allSettled([
      fetch(base + "/config"),
      fetch(base + "/health")
    ]);

    let llm = "none", ollama = null, openai = null, healthOk = false;

    if (cfgRes.status === "fulfilled" && cfgRes.value.ok) {
      const cfg = await cfgRes.value.json();
      llm = cfg.llm; ollama = cfg.ollama; openai = cfg.openai;
    }

    if (healthRes.status === "fulfilled" && healthRes.value.ok) {
      const h = await healthRes.value.json();
      healthOk = h.status === "ok";
    }

    // Build pill text
    let label = healthOk ? "server: ok" : "server: ?";
    if (llm === "ollama" && ollama) label += ` • LLM: ollama (${ollama.model})`;
    else if (llm === "openai") label += " • LLM: openai";
    else label += " • LLM: none";

    setCfgPill(healthOk ? "ok" : "warn", label);

    // Persist chosen base
    saveStoredCfg({ apiBase: base });
  } catch {
    setCfgPill("err", "offline");
  }
}

// Kick off probe on load
probeBackend();

  // ======= Speech-to-text (Web Speech API) =======
  let recognition = null;
  let micActive = false;
  let transcriptBuffer = '';

  function setupSTT() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      $("micStatus").textContent = "SpeechRecognition not supported in this browser.";
      $("micBtn").disabled = true;
      return;
    }
    recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (e) => {
      let finalText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const txt = res[0].transcript;
        if (res.isFinal) finalText += txt + ' ';
      }
      if (finalText) {
        transcriptBuffer += finalText;
        const current = $("updateText").value;
        $("updateText").value = (current ? current + ' ' : '') + finalText.trim();
      }
    };

    recognition.onstart = () => { $("micStatus").textContent = "Listening… speak your workout sets (e.g., 'incline press 4 by 12 at 25')."; };
    recognition.onend = () => { micActive = false; $("micBtn").textContent = '🎤 Dictate'; $("micStatus").textContent = "Mic stopped."; };
    recognition.onerror = (e) => { $("micStatus").textContent = 'Mic error: ' + (e.error || 'unknown'); };
  }
  setupSTT();

  $("micBtn").addEventListener('click', () => {
    if (!recognition) return;
    if (micActive) {
      recognition.stop();
      micActive = false;
      $("micBtn").textContent = '🎤 Dictate';
      return;
    }
    transcriptBuffer='';
    recognition.start();
    micActive = true;
    $("micBtn").textContent = '⏹ Stop';
  });

  $("clearBtn").addEventListener('click', () => {
    $("updateText").value = '';
    $("ingestResult").innerHTML = '';
    hideValidationFeedback();
  });

  // ======= Form Validation =======
  function validateWorkoutInput(text) {
    if (!text.trim()) {
      return { hints: [], show: false };
    }

    const hints = [];
    const lines = text.split(/[;\n]/).filter(s => s.trim());

    // Common patterns for workout format
    const workoutPattern = /(\d+)\s*[xX×]\s*(\d+)/; // matches "4x12", "4 x 12", etc.
    const weightPattern = /@\s*(\d+)/; // matches "@45", "@ 45", etc.
    const exercisePattern = /^[a-zA-Z\s]+/; // matches exercise name at start

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let hasExercise = exercisePattern.test(trimmed);
      let hasSetsReps = workoutPattern.test(trimmed);
      let hasWeight = weightPattern.test(trimmed);

      if (hasExercise && hasSetsReps && hasWeight) {
        hints.push({ type: 'success', text: `✓ Line ${idx + 1}: Valid format` });
      } else if (hasExercise && hasSetsReps) {
        hints.push({ type: 'warning', text: `⚠️ Line ${idx + 1}: Missing weight (add @weight)` });
      } else if (hasExercise) {
        hints.push({ type: 'warning', text: `⚠️ Line ${idx + 1}: Missing sets/reps (e.g., 4x12)` });
      } else {
        hints.push({ type: 'info', text: `ℹ️ Line ${idx + 1}: Format: exercise name SETSxREPS @WEIGHT` });
      }
    });

    // Add helpful tips if no valid lines
    const hasAnyValid = hints.some(h => h.type === 'success');
    if (!hasAnyValid && hints.length > 0) {
      hints.push({ type: 'info', text: `💡 Example: "floor press 4x12 @45; incline 4x10 @30"` });
    }

    return { hints, show: true };
  }

  function displayValidationHints(validation) {
    const feedbackDiv = $("validationFeedback");
    const hintsDiv = $("validationHints");

    if (!validation.show || validation.hints.length === 0) {
      feedbackDiv.classList.add('hidden');
      return;
    }

    feedbackDiv.classList.remove('hidden');

    const hintHTML = validation.hints.map(hint => {
      let colorClass = '';
      if (hint.type === 'success') colorClass = 'text-green-600 dark:text-green-400';
      else if (hint.type === 'warning') colorClass = 'text-yellow-600 dark:text-yellow-400';
      else colorClass = 'text-blue-600 dark:text-blue-400';

      return `<div class="${colorClass}">${hint.text}</div>`;
    }).join('');

    hintsDiv.innerHTML = hintHTML;
  }

  function hideValidationFeedback() {
    $("validationFeedback").classList.add('hidden');
  }

  // Real-time validation on textarea input
  $("updateText").addEventListener('input', () => {
    const text = $("updateText").value;
    const validation = validateWorkoutInput(text);
    displayValidationHints(validation);
  });

  // ======= Networking =======
  async function postIngest() {
    const text = $("updateText").value.trim();
    if (!text) {
      showToast('Please enter or dictate an update', 'warning');
      return;
    }

    const btn = $("submitBtn");
    setButtonLoading(btn, true, 'Submitting...');

    const body = {
      text,
      date: $("dateInput").value || undefined,
      planId: $("planId").value
    };

    // Optimistic update - show pending state if logging for today
    const isToday = ($("dateInput").value === todayISO()) || !$("dateInput").value;
    let pendingWorkoutId = null;

    if (isToday) {
      pendingWorkoutId = 'pending-' + Date.now();
      showPendingWorkout(text, pendingWorkoutId);
    }

    try {
      const res = await fetch(apiBase() + '/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const t = await res.text();
        $("ingestResult").innerHTML = `<div class="text-red-600">Error: ${res.status} ${t}</div>`;
        showToast('Failed to submit workout', 'error');

        // Rollback - remove pending workout
        if (pendingWorkoutId) {
          removePendingWorkout(pendingWorkoutId);
        }
        return;
      }

      const data = await res.json();

      // Success - remove pending and show result
      if (pendingWorkoutId) {
        removePendingWorkout(pendingWorkoutId);
      }

      renderIngestResult(data);
      showToast('Workout logged successfully!', 'success');

      // Clear input on success
      $("updateText").value = '';
      hideValidationFeedback();

      // refresh data
      refreshProgress();
      loadTodaysWorkouts();
    } catch (e) {
      console.error('Failed to submit workout:', e);
      $("ingestResult").innerHTML = `<div class="text-red-600">Error: ${e.message}</div>`;
      showToast('Failed to submit workout', 'error');

      // Rollback - remove pending workout
      if (pendingWorkoutId) {
        removePendingWorkout(pendingWorkoutId);
      }
    } finally {
      setButtonLoading(btn, false);
    }
  }

  function showPendingWorkout(text, pendingId) {
    const section = $("todaysWorkoutsSection");
    section.classList.remove('hidden');

    const list = $("todaysWorkoutsList");
    const pendingHTML = `
      <div id="${pendingId}" class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-xl p-4 mb-3">
        <div class="flex items-start gap-2">
          <span class="text-yellow-600 dark:text-yellow-400">⏳</span>
          <div class="flex-1">
            <div class="text-xs font-medium text-yellow-700 dark:text-yellow-300 mb-1">Logging workout...</div>
            <div class="text-xs text-yellow-600 dark:text-yellow-400">${text}</div>
          </div>
        </div>
      </div>
    `;

    list.insertAdjacentHTML('afterbegin', pendingHTML);
  }

  function removePendingWorkout(pendingId) {
    const pending = document.getElementById(pendingId);
    if (pending) {
      pending.remove();
    }

    // Hide section if no workouts left
    const list = $("todaysWorkoutsList");
    if (list.children.length === 0) {
      $("todaysWorkoutsSection").classList.add('hidden');
    }
  }

  function renderIngestResult(data) {
    const { sessionId, date, day_of_week, results } = data;
    const rows = (results || []).map(r => {
      if (r.status === 'logged') {
        const noteRow = r.notes ? `<tr class="border-b border-neutral-200 dark:border-neutral-700">
          <td class="py-1 pr-3"></td>
          <td class="py-1 pr-3 italic text-neutral-500 dark:text-neutral-400 text-xs" colspan="4">💭 ${r.notes}</td>
        </tr>` : '';
        return `<tr class="border-b border-neutral-200 dark:border-neutral-700">
          <td class="py-1 pr-3">✅</td>
          <td class="py-1 pr-3">${r.exercise}</td>
          <td class="py-1 pr-3">${r.sets ?? ''}</td>
          <td class="py-1 pr-3">${r.reps ?? ''}</td>
          <td class="py-1 pr-3">${r.weight_lbs ?? ''}</td>
        </tr>${noteRow}`;
      }
      if (r.status === 'skipped_already_logged_today') {
        return `<tr class="border-b border-neutral-200 dark:border-neutral-700">
          <td class="py-1 pr-3">⚠️</td>
          <td class="py-1 pr-3" colspan="4">Skipped: <code>${r.exercise}</code> <span class="text-amber-600 dark:text-amber-400">(already logged today)</span></td>
        </tr>`;
      }
      return `<tr class="border-b border-neutral-200 dark:border-neutral-700">
        <td class="py-1 pr-3">⏭️</td>
        <td class="py-1 pr-3" colspan="4">Skipped: <code>${r.input || r.exercise}</code> (unknown for this day)</td>
      </tr>`;
    }).join('');

    $("ingestResult").innerHTML = `
      <div class="text-sm mb-2 text-neutral-600 dark:text-neutral-400">Session <code>${sessionId}</code> • Date <strong>${date}</strong> • DOW <strong>${day_of_week}</strong></div>
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="text-left text-neutral-600 dark:text-neutral-400">
            <tr>
              <th class="py-2 pr-3">Status</th>
              <th class="py-2 pr-3">Exercise</th>
              <th class="py-2 pr-3">Sets</th>
              <th class="py-2 pr-3">Reps</th>
              <th class="py-2 pr-3">Weight</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  async function fetchDay() {
    const date = $("dateInput").value || todayISO();
    const dow = toDow(date);
    const res = await fetch(apiBase() + '/day/' + dow);
    if (!res.ok) {
      $("dayList").innerHTML = `<div class="text-center py-4"><div class="text-red-600">Failed to load day ${dow}</div></div>`;
      return;
    }
    const data = await res.json();

    if (!data.exercises || data.exercises.length === 0) {
      $("dayList").innerHTML = '<div class="text-center py-6 text-neutral-500"><div class="text-3xl mb-2">📅</div><p>No exercises planned for this day</p></div>';
      return;
    }

    const items = (data.exercises || []).map(e => {
      const lastSession = e.lastSession;
      const lastInfo = lastSession
        ? `<div class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
             Last: ${lastSession.sets || '?'}x${lastSession.reps_per_set || '?'}
             ${lastSession.weight_lbs ? '@' + lastSession.weight_lbs + ' lbs' : ''}
             <span class="text-neutral-400 dark:text-neutral-500">(${lastSession.session_date})</span>
           </div>`
        : '<div class="text-xs text-neutral-400 dark:text-neutral-500 mt-1">First time!</div>';

      return `
        <div class="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 hover:border-indigo-400 dark:hover:border-indigo-600 transition-colors">
          <div class="font-medium text-neutral-800 dark:text-neutral-200">${e.name}</div>
          ${lastInfo}
        </div>
      `;
    }).join('');

    $("dayList").innerHTML = items;
  }

  // ======= Progress =======
  let sessionsChart = null;
  async function refreshProgress() {
    const to = todayISO();
    const from = toLocalDateString(new Date(Date.now() - 29*24*60*60*1000));
    const res = await fetch(`${apiBase()}/progress/summary?from=${from}&to=${to}`);
    if (!res.ok) return;
    const data = await res.json();

    // sessions per day chart
    const labels = (data.sessions || []).map(r => r.session_date).reverse();
    const values = (data.sessions || []).map(r => r.logs).reverse();

    const ctx = $("sessionsChart");
    if (sessionsChart) { sessionsChart.destroy(); }
    sessionsChart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Logs per day', data: values }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });

    // top exercises
    $("topExercises").innerHTML = (data.topLifts || [])
      .map(x => `<li>${x.name} — ${x.cnt}</li>`)
      .join('') || '<li class="text-neutral-500">No data yet.</li>';

    // recent table
    $("recentTable").innerHTML = (data.recent || [])
      .map(r => `<tr>
        <td class="py-1 pr-4">${r.session_date}</td>
        <td class="py-1 pr-4">${r.name}</td>
        <td class="py-1 pr-4">${r.sets ?? ''}</td>
        <td class="py-1 pr-4">${r.reps_per_set ?? ''}</td>
        <td class="py-1 pr-4">${r.weight_lbs ?? ''}</td>
      </tr>`).join('');
  }

  // ======= Weekly Summaries =======
  async function fetchWeeklySummaries() {
    try {
      const res = await fetch(`${apiBase()}/weekly-summaries?limit=10`);
      if (!res.ok) {
        $("latestSummary").innerHTML = '<p class="text-sm text-red-600 dark:text-red-400">Failed to load summaries</p>';
        return;
      }
      const data = await res.json();
      renderWeeklySummaries(data.summaries || []);
    } catch (e) {
      console.error('Failed to fetch weekly summaries:', e);
      $("latestSummary").innerHTML = '<p class="text-sm text-red-600 dark:text-red-400">Error loading summaries</p>';
    }
  }

  function renderWeeklySummaries(summaries) {
    if (!summaries || summaries.length === 0) {
      $("latestSummary").innerHTML = `
        <div class="text-center py-8">
          <p class="text-neutral-500 dark:text-neutral-400 mb-3">No weekly summaries yet</p>
          <p class="text-sm text-neutral-400 dark:text-neutral-500">Generate your first summary to see AI-powered insights!</p>
        </div>`;
      $("historicalSummaries").innerHTML = '';
      return;
    }

    // Render latest summary
    const latest = summaries[0];
    const metrics = latest.metrics_json ? JSON.parse(latest.metrics_json) : {};
    const volumeChange = metrics.volume_change_pct;
    const changeIcon = volumeChange > 0 ? '📈' : volumeChange < 0 ? '📉' : '➡️';
    const changeColor = volumeChange > 0 ? 'text-emerald-600 dark:text-emerald-400' : volumeChange < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-neutral-600 dark:text-neutral-400';

    $("latestSummary").innerHTML = `
      <div class="bg-white dark:bg-neutral-800 rounded-xl p-4 shadow-sm border border-neutral-200 dark:border-neutral-700">
        <div class="flex items-start justify-between mb-3">
          <div>
            <div class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Latest Week</div>
            <div class="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mt-1">
              ${latest.week_start_date} → ${latest.week_end_date}
            </div>
          </div>
          <div class="text-2xl">${changeIcon}</div>
        </div>

        <div class="grid grid-cols-3 gap-3 mb-4">
          <div class="bg-indigo-50 dark:bg-indigo-950/30 rounded-lg p-3">
            <div class="text-2xl font-bold text-indigo-900 dark:text-indigo-100">${latest.total_sessions}</div>
            <div class="text-xs text-indigo-700 dark:text-indigo-300 mt-1">Sessions</div>
          </div>
          <div class="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-3">
            <div class="text-2xl font-bold text-purple-900 dark:text-purple-100">${latest.total_volume.toFixed(0)}</div>
            <div class="text-xs text-purple-700 dark:text-purple-300 mt-1">Volume (lbs)</div>
          </div>
          <div class="bg-neutral-50 dark:bg-neutral-900/50 rounded-lg p-3">
            <div class="text-xl font-bold ${changeColor}">${volumeChange !== undefined ? (volumeChange > 0 ? '+' : '') + volumeChange.toFixed(1) + '%' : 'N/A'}</div>
            <div class="text-xs text-neutral-600 dark:text-neutral-400 mt-1">vs Last Week</div>
          </div>
        </div>

        <div class="bg-neutral-50 dark:bg-neutral-900/50 rounded-lg p-3">
          <div class="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2">🤖 AI Coach Says:</div>
          <p class="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">${latest.summary_text || 'No summary available'}</p>
        </div>

        ${metrics.exercises_performed && metrics.exercises_performed.length > 0 ? `
          <div class="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700">
            <div class="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2">Top Exercises:</div>
            <div class="flex flex-wrap gap-2">
              ${metrics.exercises_performed.slice(0, 3).map(ex => `
                <span class="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded">
                  ${ex.name} (${ex.total_volume.toFixed(0)} lbs)
                </span>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    // Render historical summaries (excluding the latest)
    const historical = summaries.slice(1);
    if (historical.length > 0) {
      $("historicalSummaries").innerHTML = historical.map(summary => {
        const hist_metrics = summary.metrics_json ? JSON.parse(summary.metrics_json) : {};
        return `
          <div class="bg-white dark:bg-neutral-800 rounded-lg p-3 border border-neutral-200 dark:border-neutral-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  ${summary.week_start_date} → ${summary.week_end_date}
                </div>
                <div class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  ${summary.total_sessions} sessions • ${summary.total_volume.toFixed(0)} lbs
                  ${hist_metrics.volume_change_pct !== undefined ? ` • ${hist_metrics.volume_change_pct > 0 ? '+' : ''}${hist_metrics.volume_change_pct.toFixed(1)}%` : ''}
                </div>
              </div>
              <div class="text-lg">
                ${hist_metrics.volume_change_pct > 0 ? '📈' : hist_metrics.volume_change_pct < 0 ? '📉' : '➡️'}
              </div>
            </div>
          </div>
        `;
      }).join('');
    } else {
      $("historicalSummaries").innerHTML = '<p class="text-sm text-neutral-500 dark:text-neutral-400">No previous summaries</p>';
    }
  }

  async function generateNewSummary() {
    const btn = $("generateSummaryBtn");
    setButtonLoading(btn, true, 'Generating...');

    try {
      const res = await fetch(`${apiBase()}/weekly-summaries/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!res.ok) {
        throw new Error('Failed to generate summary');
      }

      await res.json();
      showToast('Weekly summary generated!', 'success');

      // Refresh summaries
      await fetchWeeklySummaries();
    } catch (e) {
      console.error('Failed to generate summary:', e);
      showToast('Failed to generate summary', 'error');
    } finally {
      setButtonLoading(btn, false);
    }
  }

  let historyVisible = false;
  function toggleHistory() {
    historyVisible = !historyVisible;
    const historyEl = $("historicalSummaries");
    const toggleBtn = $("toggleHistoryBtn");

    if (historyVisible) {
      historyEl.classList.remove('hidden');
      toggleBtn.textContent = 'Hide';
    } else {
      historyEl.classList.add('hidden');
      toggleBtn.textContent = 'Show All';
    }
  }

  // ======= Workout Management =======
  let workoutMgmtVisible = false;
  async function loadWorkoutsByDate() {
    const date = $("mgmtDateInput").value;
    if (!date) {
      showToast('Please select a date', 'warning');
      return;
    }

    try {
      // Show loading skeleton
      showLoadingSkeleton("workoutsList", 2);

      const res = await fetch(`${apiBase()}/workouts?date=${date}`);
      if (!res.ok) throw new Error('Failed to load workouts');

      const data = await res.json();
      renderWorkoutsList(data.workouts || []);
    } catch (e) {
      console.error('Failed to load workouts:', e);
      $("workoutsList").innerHTML = `
        <div class="text-center py-6">
          <div class="text-3xl mb-2">⚠️</div>
          <p class="text-sm text-red-600 dark:text-red-400 mb-2">Failed to load workouts</p>
          <button onclick="loadWorkoutsByDate()" class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">Try again</button>
        </div>
      `;
    }
  }

  function renderWorkoutsList(workouts) {
    if (workouts.length === 0) {
      $("workoutsList").innerHTML = `
        <div class="text-center py-8">
          <div class="text-4xl mb-3">💪</div>
          <p class="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">No workouts logged for this date</p>
          <p class="text-xs text-neutral-500 dark:text-neutral-400">Log your first workout using the form above!</p>
        </div>
      `;
      return;
    }

    // Flatten all exercises from all workouts into a single list
    const allExercises = workouts.flatMap(workout =>
      (workout.exercises || []).map(ex => ({
        ...ex,
        sessionId: workout.id,
        sessionDate: workout.session_date,
        dayOfWeek: workout.day_of_week,
        llm_provider: workout.llm_provider,
        llm_model: workout.llm_model
      }))
    );

    $("workoutsList").innerHTML = `
      <div class="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
        <div class="flex items-center justify-between mb-4">
          <div class="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            ${allExercises.length} exercise${allExercises.length !== 1 ? 's' : ''} logged
          </div>
          <button id="deleteSelectedHistoryBtn" onclick="deleteSelectedHistory()" class="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded hidden">
            Delete Selected
          </button>
        </div>
        <div class="space-y-2">
          ${allExercises.map(ex => `
            <div class="text-xs bg-neutral-50 dark:bg-neutral-900 rounded-lg p-3 flex items-start gap-3" data-log-id="${ex.id}">
              <input type="checkbox" class="history-checkbox mt-1" data-session-id="${ex.sessionId}" onchange="updateHistoryDeleteButton()" />
              <div class="flex-1">
                <div class="flex items-center justify-between mb-2">
                  <button onclick="loadExerciseByName('${ex.exercise.replace(/'/g, "\\'")}')" class="font-medium text-neutral-700 dark:text-neutral-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline cursor-pointer text-left transition-colors" title="Click to view exercise history">
                    ${ex.exercise}
                  </button>
                  <button onclick="toggleEditMode('history-${ex.id}')" class="text-indigo-600 dark:text-indigo-400 hover:underline text-xs">Edit</button>
                </div>
                <div class="view-mode-history-${ex.id}">
                  <div class="text-neutral-600 dark:text-neutral-400">${ex.sets || '?'}x${ex.reps_per_set || '?'} ${ex.weight_lbs ? '@' + ex.weight_lbs + ' lbs' : ''}</div>
                  ${ex.notes ? `<div class="text-xs text-neutral-500 dark:text-neutral-400 italic mt-1">💭 ${ex.notes}</div>` : ''}
                  ${ex.llm_provider && ex.llm_model ? `<div class="text-[10px] text-neutral-400 dark:text-neutral-500 mt-1 flex items-center gap-1">
                    <span title="AI Model used to parse this workout">🤖 ${ex.llm_provider}: ${ex.llm_model}</span>
                  </div>` : ''}
                </div>
                <div class="edit-mode-history-${ex.id} hidden">
                  <div class="grid grid-cols-3 gap-2 mb-2">
                    <input type="number" id="sets-history-${ex.id}" value="${ex.sets || ''}" placeholder="Sets" class="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs" />
                    <input type="number" id="reps-history-${ex.id}" value="${ex.reps_per_set || ''}" placeholder="Reps" class="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs" />
                    <input type="number" step="0.5" id="weight-history-${ex.id}" value="${ex.weight_lbs || ''}" placeholder="Weight" class="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs" />
                  </div>
                  <div class="mb-2">
                    <textarea id="notes-history-${ex.id}" placeholder="Notes (optional)" class="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs resize-none" rows="2">${ex.notes || ''}</textarea>
                  </div>
                  <div class="flex gap-2">
                    <button onclick="saveExerciseLog('history-${ex.id}')" class="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded">Save</button>
                    <button onclick="toggleEditMode('history-${ex.id}')" class="text-xs bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 px-3 py-1 rounded">Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Load and display today's workouts in the Today tab
  async function loadTodaysWorkouts() {
    // Use the selected date from the Today tab's date input
    const date = $("dateInput").value || todayISO();

    try {
      const res = await fetch(`${apiBase()}/workouts?date=${date}`);
      if (!res.ok) throw new Error('Failed to load workouts');

      const data = await res.json();
      renderTodaysWorkouts(data.workouts || []);
    } catch (e) {
      console.error('Failed to load workouts for selected date:', e);
      $("todaysWorkoutsSection").classList.add('hidden');
    }
  }

  function renderTodaysWorkouts(workouts) {
    if (workouts.length === 0) {
      $("todaysWorkoutsSection").classList.add('hidden');
      return;
    }

    $("todaysWorkoutsSection").classList.remove('hidden');

    // Flatten all exercises from all workouts into a single list
    const allExercises = workouts.flatMap(workout =>
      (workout.exercises || []).map(ex => ({
        ...ex,
        sessionId: workout.id,
        sessionDate: workout.session_date,
        llm_provider: workout.llm_provider,
        llm_model: workout.llm_model
      }))
    );

    $("todaysWorkoutsList").innerHTML = `
      <div class="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
        <div class="flex items-center justify-between mb-4">
          <div class="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            ${allExercises.length} exercise${allExercises.length !== 1 ? 's' : ''} logged today
          </div>
          <button id="deleteSelectedBtn" onclick="deleteSelectedWorkouts()" class="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded hidden">
            Delete Selected
          </button>
        </div>
        <div class="space-y-2">
          ${allExercises.map(ex => `
            <div class="text-xs bg-neutral-50 dark:bg-neutral-900 rounded-lg p-3 flex items-start gap-3" data-log-id="${ex.id}">
              <input type="checkbox" class="workout-checkbox mt-1" data-session-id="${ex.sessionId}" onchange="updateDeleteButton()" />
              <div class="flex-1">
                <div class="flex items-center justify-between mb-2">
                  <button onclick="loadExerciseByName('${ex.exercise.replace(/'/g, "\\'")}')" class="font-medium text-neutral-700 dark:text-neutral-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline cursor-pointer text-left transition-colors" title="Click to view exercise history">
                    ${ex.exercise}
                  </button>
                  <button onclick="toggleEditMode('today-${ex.id}')" class="text-indigo-600 dark:text-indigo-400 hover:underline text-xs">Edit</button>
                </div>
                <div class="view-mode-today-${ex.id}">
                  <div class="text-neutral-600 dark:text-neutral-400">${ex.sets || '?'}x${ex.reps_per_set || '?'} ${ex.weight_lbs ? '@' + ex.weight_lbs + ' lbs' : ''}</div>
                  ${ex.notes ? `<div class="text-xs text-neutral-500 dark:text-neutral-400 italic mt-1">💭 ${ex.notes}</div>` : ''}
                  ${ex.llm_provider && ex.llm_model ? `<div class="text-[10px] text-neutral-400 dark:text-neutral-500 mt-1 flex items-center gap-1">
                    <span title="AI Model used to parse this workout">🤖 ${ex.llm_provider}: ${ex.llm_model}</span>
                  </div>` : ''}
                </div>
                <div class="edit-mode-today-${ex.id} hidden">
                  <div class="grid grid-cols-3 gap-2 mb-2">
                    <input type="number" id="sets-today-${ex.id}" value="${ex.sets || ''}" placeholder="Sets" class="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs" />
                    <input type="number" id="reps-today-${ex.id}" value="${ex.reps_per_set || ''}" placeholder="Reps" class="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs" />
                    <input type="number" step="0.5" id="weight-today-${ex.id}" value="${ex.weight_lbs || ''}" placeholder="Weight" class="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs" />
                  </div>
                  <div class="mb-2">
                    <textarea id="notes-today-${ex.id}" placeholder="Notes (optional)" class="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs resize-none" rows="2">${ex.notes || ''}</textarea>
                  </div>
                  <div class="flex gap-2">
                    <button onclick="saveExerciseLog('today-${ex.id}')" class="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded">Save</button>
                    <button onclick="toggleEditMode('today-${ex.id}')" class="text-xs bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 px-3 py-1 rounded">Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function toggleEditMode(prefixedLogId) {
    const viewMode = document.querySelector(`.view-mode-${prefixedLogId}`);
    const editMode = document.querySelector(`.edit-mode-${prefixedLogId}`);

    if (viewMode && editMode) {
      viewMode.classList.toggle('hidden');
      editMode.classList.toggle('hidden');
    }
  }

  async function saveExerciseLog(prefixedLogId) {
    // Extract actual logId from prefixed version (e.g., "today-123" -> "123")
    const actualLogId = prefixedLogId.replace(/^(today-|history-)/, '');

    const setsInput = document.getElementById(`sets-${prefixedLogId}`);
    const repsInput = document.getElementById(`reps-${prefixedLogId}`);
    const weightInput = document.getElementById(`weight-${prefixedLogId}`);
    const notesInput = document.getElementById(`notes-${prefixedLogId}`);

    const newSets = setsInput.value;
    const newReps = repsInput.value;
    const newWeight = weightInput.value;
    const newNotes = notesInput ? notesInput.value : '';

    // Store old values for rollback
    const oldSets = setsInput.defaultValue;
    const oldReps = repsInput.defaultValue;
    const oldWeight = weightInput.defaultValue;
    const oldNotes = notesInput ? notesInput.defaultValue : '';

    const viewMode = document.querySelector(`.view-mode-${prefixedLogId}`);
    const oldViewHTML = viewMode ? viewMode.innerHTML : '';

    try {
      // Optimistic update - update UI immediately
      if (viewMode) {
        const setsVal = newSets || '?';
        const repsVal = newReps || '?';
        const weightText = newWeight ? `@${newWeight} lbs` : '';
        const notesHTML = newNotes ? `<div class="text-xs text-neutral-500 dark:text-neutral-400 italic mt-1">💭 ${newNotes}</div>` : '';
        viewMode.innerHTML = `<div class="text-neutral-600 dark:text-neutral-400">${setsVal}x${repsVal} ${weightText}</div>${notesHTML}<span class="text-yellow-500 ml-2 text-xs">⏳ Saving...</span>`;
      }

      toggleEditMode(prefixedLogId);
      showToast('Saving changes...', 'info');

      const res = await fetch(`${apiBase()}/exercise-logs/${actualLogId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sets: newSets ? parseInt(newSets) : null,
          reps_per_set: newReps ? parseInt(newReps) : null,
          weight_lbs: newWeight ? parseFloat(newWeight) : null,
          notes: newNotes || null
        })
      });

      if (!res.ok) throw new Error('Failed to update');

      // Success - remove pending indicator and update defaults
      if (viewMode) {
        const setsVal = newSets || '?';
        const repsVal = newReps || '?';
        const weightText = newWeight ? `@${newWeight} lbs` : '';
        const notesHTML = newNotes ? `<div class="text-xs text-neutral-500 dark:text-neutral-400 italic mt-1">💭 ${newNotes}</div>` : '';
        viewMode.innerHTML = `<div class="text-neutral-600 dark:text-neutral-400">${setsVal}x${repsVal} ${weightText}</div>${notesHTML}`;
      }
      setsInput.defaultValue = newSets;
      repsInput.defaultValue = newReps;
      weightInput.defaultValue = newWeight;
      if (notesInput) notesInput.defaultValue = newNotes;

      showToast('Exercise updated successfully!', 'success');
      await loadWorkoutsByDate();
      loadTodaysWorkouts();  // Also refresh today's workouts
    } catch (e) {
      console.error('Failed to update exercise:', e);

      // Rollback - restore old values
      if (viewMode) {
        viewMode.innerHTML = oldViewHTML;
      }
      setsInput.value = oldSets;
      repsInput.value = oldReps;
      weightInput.value = oldWeight;
      if (notesInput) notesInput.value = oldNotes;

      showToast('Failed to update exercise. Changes reverted.', 'error');
      toggleEditMode(prefixedLogId);  // Show edit mode again so user can retry
    }
  }

  window.toggleEditMode = toggleEditMode;
  window.saveExerciseLog = saveExerciseLog;

  async function deleteWorkout(sessionId) {
    const confirmed = await showConfirm({
      title: 'Delete Workout?',
      message: 'This action cannot be undone. All exercise logs in this workout will be permanently deleted.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
      icon: '🗑️'
    });

    if (!confirmed) return;

    try {
      showToast('Deleting workout...', 'info');

      const res = await fetch(`${apiBase()}/workouts/${sessionId}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Failed to delete');

      showToast('Workout deleted successfully!', 'success');
      await loadWorkoutsByDate();
      // Also refresh today's workouts if deleted workout was from today
      loadTodaysWorkouts();
    } catch (e) {
      console.error('Failed to delete workout:', e);
      showToast('Failed to delete workout. Please try again.', 'error');
    }
  }

  // Make deleteWorkout available globally
  window.deleteWorkout = deleteWorkout;

  // Multi-select deletion functions
  function updateDeleteButton() {
    const checkboxes = document.querySelectorAll('.workout-checkbox:checked');
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    if (deleteBtn) {
      if (checkboxes.length > 0) {
        deleteBtn.classList.remove('hidden');
        deleteBtn.textContent = `Delete Selected (${checkboxes.length})`;
      } else {
        deleteBtn.classList.add('hidden');
      }
    }
  }

  async function deleteSelectedWorkouts() {
    const checkboxes = document.querySelectorAll('.workout-checkbox:checked');
    const sessionIds = [...new Set([...checkboxes].map(cb => cb.dataset.sessionId))];

    if (sessionIds.length === 0) {
      showToast('No workouts selected', 'warning');
      return;
    }

    const confirmed = await showConfirm({
      title: 'Delete Selected Workouts?',
      message: `This will permanently delete ${sessionIds.length} workout session${sessionIds.length !== 1 ? 's' : ''}. This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
      icon: '🗑️'
    });

    if (!confirmed) return;

    // Store elements and their HTML for rollback
    const elementsToDelete = [];
    sessionIds.forEach(sessionId => {
      const elements = document.querySelectorAll(`[data-log-id]`);
      elements.forEach(el => {
        const checkbox = el.querySelector(`.workout-checkbox[data-session-id="${sessionId}"]`);
        if (checkbox) {
          elementsToDelete.push({
            element: el,
            parent: el.parentElement,
            html: el.outerHTML,
            nextSibling: el.nextSibling
          });
        }
      });
    });

    try {
      // Optimistic delete - remove from UI immediately
      elementsToDelete.forEach(({ element }) => {
        element.style.opacity = '0.5';
        element.style.pointerEvents = 'none';
        const overlay = document.createElement('div');
        overlay.className = 'absolute inset-0 flex items-center justify-center bg-neutral-900 bg-opacity-50 rounded-lg';
        overlay.innerHTML = '<span class="text-white text-xs">⏳ Deleting...</span>';
        element.style.position = 'relative';
        element.appendChild(overlay);
      });

      showToast('Deleting workouts...', 'info');

      // Delete all selected sessions
      const results = await Promise.all(sessionIds.map(sessionId =>
        fetch(`${apiBase()}/workouts/${sessionId}`, { method: 'DELETE' })
          .then(res => ({ sessionId, success: res.ok, res }))
      ));

      // Check if any failed
      const failures = results.filter(r => !r.success);
      if (failures.length > 0) {
        throw new Error(`Failed to delete ${failures.length} workout(s)`);
      }

      // Success - permanently remove elements
      elementsToDelete.forEach(({ element }) => {
        element.remove();
      });

      showToast('Workouts deleted successfully!', 'success');
      loadTodaysWorkouts();
      await loadWorkoutsByDate();
    } catch (e) {
      console.error('Failed to delete workouts:', e);

      // Rollback - restore elements
      elementsToDelete.forEach(({ element, parent, html, nextSibling }) => {
        // Remove the modified element
        if (element.parentElement) {
          element.remove();
        }

        // Re-insert the original HTML
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const restoredElement = temp.firstElementChild;

        if (nextSibling) {
          parent.insertBefore(restoredElement, nextSibling);
        } else {
          parent.appendChild(restoredElement);
        }
      });

      showToast('Failed to delete workouts. Changes reverted.', 'error');
      // Reload to ensure consistency
      loadTodaysWorkouts();
    }
  }

  // Make functions available globally
  window.updateDeleteButton = updateDeleteButton;
  window.deleteSelectedWorkouts = deleteSelectedWorkouts;

  // History tab multi-select functions
  function updateHistoryDeleteButton() {
    const checkboxes = document.querySelectorAll('.history-checkbox:checked');
    const deleteBtn = document.getElementById('deleteSelectedHistoryBtn');
    if (deleteBtn) {
      if (checkboxes.length > 0) {
        deleteBtn.classList.remove('hidden');
        deleteBtn.textContent = `Delete Selected (${checkboxes.length})`;
      } else {
        deleteBtn.classList.add('hidden');
      }
    }
  }

  async function deleteSelectedHistory() {
    const checkboxes = document.querySelectorAll('.history-checkbox:checked');
    const sessionIds = [...new Set([...checkboxes].map(cb => cb.dataset.sessionId))];

    if (sessionIds.length === 0) {
      showToast('No workouts selected', 'warning');
      return;
    }

    const confirmed = await showConfirm({
      title: 'Delete Selected Workouts?',
      message: `This will permanently delete ${sessionIds.length} workout session${sessionIds.length !== 1 ? 's' : ''}. This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
      icon: '🗑️'
    });

    if (!confirmed) return;

    // Store elements and their HTML for rollback
    const elementsToDelete = [];
    sessionIds.forEach(sessionId => {
      const elements = document.querySelectorAll(`[data-log-id]`);
      elements.forEach(el => {
        const checkbox = el.querySelector(`.history-checkbox[data-session-id="${sessionId}"]`);
        if (checkbox) {
          elementsToDelete.push({
            element: el,
            parent: el.parentElement,
            html: el.outerHTML,
            nextSibling: el.nextSibling
          });
        }
      });
    });

    try {
      // Optimistic delete - remove from UI immediately
      elementsToDelete.forEach(({ element }) => {
        element.style.opacity = '0.5';
        element.style.pointerEvents = 'none';
        const overlay = document.createElement('div');
        overlay.className = 'absolute inset-0 flex items-center justify-center bg-neutral-900 bg-opacity-50 rounded-lg';
        overlay.innerHTML = '<span class="text-white text-xs">⏳ Deleting...</span>';
        element.style.position = 'relative';
        element.appendChild(overlay);
      });

      showToast('Deleting workouts...', 'info');

      // Delete all selected sessions
      const results = await Promise.all(sessionIds.map(sessionId =>
        fetch(`${apiBase()}/workouts/${sessionId}`, { method: 'DELETE' })
          .then(res => ({ sessionId, success: res.ok, res }))
      ));

      // Check if any failed
      const failures = results.filter(r => !r.success);
      if (failures.length > 0) {
        throw new Error(`Failed to delete ${failures.length} workout(s)`);
      }

      // Success - permanently remove elements
      elementsToDelete.forEach(({ element }) => {
        element.remove();
      });

      showToast('Workouts deleted successfully!', 'success');
      await loadWorkoutsByDate();
      loadTodaysWorkouts();
    } catch (e) {
      console.error('Failed to delete workouts:', e);

      // Rollback - restore elements
      elementsToDelete.forEach(({ element, parent, html, nextSibling }) => {
        // Remove the modified element
        if (element.parentElement) {
          element.remove();
        }

        // Re-insert the original HTML
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const restoredElement = temp.firstElementChild;

        if (nextSibling) {
          parent.insertBefore(restoredElement, nextSibling);
        } else {
          parent.appendChild(restoredElement);
        }
      });

      showToast('Failed to delete workouts. Changes reverted.', 'error');
      // Reload to ensure consistency
      await loadWorkoutsByDate();
    }
  }

  // Make functions available globally
  window.updateHistoryDeleteButton = updateHistoryDeleteButton;
  window.deleteSelectedHistory = deleteSelectedHistory;

  // ======= Workout Calendar =======
  let currentCalendarMonth = new Date();
  let workoutDatesCache = new Set();
  let calendarInitialized = false;

  async function loadWorkoutDatesForMonth(year, month) {
    try {
      // Get first and last day of the month
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);

      const fromDate = toLocalDateString(firstDay);
      const toDate = toLocalDateString(lastDay);

      // Fetch all sessions for this month
      const res = await fetch(`${apiBase()}/progress/summary?from=${fromDate}&to=${toDate}`);
      if (!res.ok) throw new Error('Failed to load workout dates');

      const data = await res.json();

      // Extract unique workout dates
      workoutDatesCache.clear();
      (data.sessions || []).forEach(session => {
        workoutDatesCache.add(session.session_date);
      });

      return workoutDatesCache;
    } catch (e) {
      console.error('Failed to load workout dates:', e);
      return new Set();
    }
  }

  function renderCalendar() {
    const year = currentCalendarMonth.getFullYear();
    const month = currentCalendarMonth.getMonth();

    // Update month label
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    $("calendarMonthLabel").textContent = `${monthNames[month]} ${year}`;

    // Get calendar grid
    const calendarGrid = $("workoutCalendar");

    // First day of the month (0 = Sunday, 1 = Monday, etc.)
    const firstDayOfMonth = new Date(year, month, 1).getDay();

    // Number of days in the month
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Build calendar HTML
    let calendarHTML = '';

    // Day headers (single letter)
    const dayHeaders = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    dayHeaders.forEach(day => {
      calendarHTML += `<div class="text-center text-[10px] font-medium text-neutral-500 dark:text-neutral-500 pb-1">${day}</div>`;
    });

    // Empty cells before the first day
    for (let i = 0; i < firstDayOfMonth; i++) {
      calendarHTML += '<div class="aspect-square"></div>';
    }

    // Today's date for highlighting
    const today = new Date();
    const todayStr = toLocalDateString(today);

    // Calendar days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = toLocalDateString(date);
      const hasWorkout = workoutDatesCache.has(dateStr);
      const isToday = dateStr === todayStr;

      let bgClass = 'bg-neutral-100 dark:bg-neutral-900 hover:bg-neutral-200 dark:hover:bg-neutral-800';
      let dotClass = 'bg-neutral-300 dark:bg-neutral-700';
      let textClass = 'text-neutral-700 dark:text-neutral-300';
      let borderClass = '';

      if (isToday) {
        borderClass = 'ring-1 ring-indigo-500';
        dotClass = 'bg-indigo-500';
      }

      if (hasWorkout) {
        dotClass = 'bg-emerald-500';
        bgClass = 'bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50';
      }

      calendarHTML += `
        <button
          onclick="loadCalendarDay('${dateStr}')"
          class="aspect-square rounded ${bgClass} ${borderClass} transition-all flex flex-col items-center justify-center cursor-pointer text-xs"
          title="${dateStr}${hasWorkout ? ' - Has workout' : ''}"
        >
          <span class="font-medium ${textClass}">${day}</span>
          <span class="w-1.5 h-1.5 rounded-full ${dotClass} mt-0.5"></span>
        </button>
      `;
    }

    calendarGrid.innerHTML = calendarHTML;
  }

  async function loadCalendarDay(dateStr) {
    // Load workouts for the selected day
    $("mgmtDateInput").value = dateStr;
    await loadWorkoutsByDate();

    // No scrolling needed - sections are side by side
    showToast(`Loaded workouts for ${dateStr}`, 'info');
  }

  async function changeCalendarMonth(offset) {
    currentCalendarMonth = new Date(
      currentCalendarMonth.getFullYear(),
      currentCalendarMonth.getMonth() + offset,
      1
    );

    await loadWorkoutDatesForMonth(
      currentCalendarMonth.getFullYear(),
      currentCalendarMonth.getMonth()
    );

    renderCalendar();
  }

  async function goToTodayMonth() {
    currentCalendarMonth = new Date();

    await loadWorkoutDatesForMonth(
      currentCalendarMonth.getFullYear(),
      currentCalendarMonth.getMonth()
    );

    renderCalendar();
  }

  // Initialize calendar
  async function initCalendar() {
    await loadWorkoutDatesForMonth(
      currentCalendarMonth.getFullYear(),
      currentCalendarMonth.getMonth()
    );
    renderCalendar();
  }

  // Event listeners for calendar navigation
  $("prevMonthBtn").addEventListener('click', () => changeCalendarMonth(-1));
  $("nextMonthBtn").addEventListener('click', () => changeCalendarMonth(1));
  $("todayMonthBtn").addEventListener('click', goToTodayMonth);

  // Make functions globally available
  window.loadCalendarDay = loadCalendarDay;

  // ======= Exercise Tracking =======
  let exerciseTrackVisible = false;
  let allExercises = [];

  async function loadAllExercises() {
    try {
      const res = await fetch(`${apiBase()}/exercises?planId=thor`);
      if (!res.ok) throw new Error('Failed to load exercises');

      const data = await res.json();
      allExercises = data.exercises || [];

      const select = $("exerciseSelect");
      select.innerHTML = '<option value="">Choose an exercise...</option>' +
        allExercises.map(ex => `<option value="${ex.id}">${ex.name}</option>`).join('');
    } catch (e) {
      console.error('Failed to load exercises:', e);
    }
  }

  async function loadExerciseHistory(exerciseId) {
    if (!exerciseId) {
      $("exerciseStats").classList.add('hidden');
      $("exerciseHistory").innerHTML = '';
      return;
    }

    try {
      const res = await fetch(`${apiBase()}/exercises/${exerciseId}/history`);
      if (!res.ok) throw new Error('Failed to load history');

      const data = await res.json();
      renderExerciseStats(data.exercise, data.stats);
      renderExerciseHistory(data.history || []);
    } catch (e) {
      console.error('Failed to load exercise history:', e);
      $("exerciseHistory").innerHTML = '<p class="text-sm text-red-600">Failed to load history</p>';
    }
  }

  async function loadExerciseByName(exerciseName) {
    // Switch to History tab if not already there
    const historyTab = document.getElementById('tab-history');
    if (historyTab && historyTab.classList.contains('hidden')) {
      switchTab('history');
      // Wait for tab switch animation
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Load all exercises if not already loaded
    if (allExercises.length === 0) {
      await loadAllExercises();
    }

    // Find exercise by name (case-insensitive)
    const exercise = allExercises.find(ex =>
      ex.name.toLowerCase() === exerciseName.toLowerCase()
    );

    if (!exercise) {
      showToast(`Exercise "${exerciseName}" not found`, 'warning');
      return;
    }

    // Set the dropdown value
    $("exerciseSelect").value = exercise.id;

    // Load the exercise history
    await loadExerciseHistory(exercise.id);

    // Scroll to the Track Single Exercise section
    const exerciseSection = $("exerciseSelect").closest('section');
    if (exerciseSection) {
      exerciseSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    showToast(`Loaded history for ${exercise.name}`, 'success');
  }

  // Make function globally available
  window.loadExerciseByName = loadExerciseByName;

  function renderExerciseStats(exercise, stats) {
    $("exerciseStats").classList.remove('hidden');
    $("exerciseStats").innerHTML = `
      <div class="bg-indigo-50 dark:bg-indigo-950/30 rounded-lg p-4">
        <h4 class="font-semibold text-indigo-900 dark:text-indigo-100 mb-3">${exercise.name}</h4>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <div class="text-xs text-indigo-700 dark:text-indigo-300">Sessions</div>
            <div class="text-lg font-bold text-indigo-900 dark:text-indigo-100">${stats.total_sessions || 0}</div>
          </div>
          <div>
            <div class="text-xs text-indigo-700 dark:text-indigo-300">Total Sets</div>
            <div class="text-lg font-bold text-indigo-900 dark:text-indigo-100">${stats.total_sets || 0}</div>
          </div>
          <div>
            <div class="text-xs text-indigo-700 dark:text-indigo-300">Max Weight</div>
            <div class="text-lg font-bold text-indigo-900 dark:text-indigo-100">${stats.max_weight ? stats.max_weight.toFixed(1) : 0} lbs</div>
          </div>
          <div>
            <div class="text-xs text-indigo-700 dark:text-indigo-300">Total Volume</div>
            <div class="text-lg font-bold text-indigo-900 dark:text-indigo-100">${stats.total_volume ? stats.total_volume.toFixed(0) : 0} lbs</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderExerciseHistory(history) {
    if (history.length === 0) {
      $("exerciseHistory").innerHTML = '<p class="text-sm text-neutral-500">No history found for this exercise</p>';
      return;
    }

    $("exerciseHistory").innerHTML = `
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="text-left text-neutral-600 dark:text-neutral-400">
            <tr>
              <th class="py-2 pr-4">Date</th>
              <th class="py-2 pr-4">Sets</th>
              <th class="py-2 pr-4">Reps</th>
              <th class="py-2 pr-4">Weight</th>
              <th class="py-2 pr-4">Volume</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-200 dark:divide-neutral-700">
            ${history.map(h => `
              <tr>
                <td class="py-1 pr-4">${h.session_date}</td>
                <td class="py-1 pr-4">${h.sets || '-'}</td>
                <td class="py-1 pr-4">${h.reps_per_set || '-'}</td>
                <td class="py-1 pr-4">${h.weight_lbs ? h.weight_lbs + ' lbs' : '-'}</td>
                <td class="py-1 pr-4">${h.sets && h.reps_per_set && h.weight_lbs ? (h.sets * h.reps_per_set * h.weight_lbs).toFixed(0) : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ======= Data Export =======
  async function exportData() {
    const format = await showConfirm({
      title: 'Export Data',
      message: 'Choose export format:',
      confirmText: 'CSV',
      cancelText: 'JSON',
      type: 'warning',
      icon: '📥'
    });

    try {
      showToast('Exporting data...', 'info');

      // Fetch all workouts from the last year
      const to = todayISO();
      const from = new Date(Date.now() - 365*24*60*60*1000).toISOString().slice(0,10);
      const res = await fetch(`${apiBase()}/progress/summary?from=${from}&to=${to}`);
      if (!res.ok) throw new Error('Failed to fetch data');

      const data = await res.json();
      const filename = `thor-logger-export-${todayISO()}`;

      if (format) {
        // CSV format
        const csvRows = [
          ['Date', 'Exercise', 'Sets', 'Reps', 'Weight (lbs)']
        ];
        data.recent.forEach(row => {
          csvRows.push([
            row.session_date,
            row.name,
            row.sets,
            row.reps_per_set,
            row.weight_lbs || ''
          ]);
        });
        const csvContent = csvRows.map(row => row.join(',')).join('\\n');
        downloadFile(csvContent, `${filename}.csv`, 'text/csv');
        showToast('Data exported as CSV!', 'success');
      } else {
        // JSON format
        const jsonContent = JSON.stringify(data, null, 2);
        downloadFile(jsonContent, `${filename}.json`, 'application/json');
        showToast('Data exported as JSON!', 'success');
      }
    } catch (e) {
      console.error('Failed to export data:', e);
      showToast('Failed to export data', 'error');
    }
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ======= Date Navigation =======
  function changeDate(days) {
    // Parse date string in local timezone to avoid UTC offset issues
    const dateStr = $("dateInput").value;
    const [year, month, day] = dateStr.split('-').map(Number);
    const currentDate = new Date(year, month - 1, day); // month is 0-indexed

    currentDate.setDate(currentDate.getDate() + days);
    const newValue = toLocalDateString(currentDate);
    $("dateInput").value = newValue;
    // Manually trigger change event (programmatic value changes don't auto-trigger)
    $("dateInput").dispatchEvent(new Event('change'));
  }

  function setToday() {
    $("dateInput").value = todayISO();
    loadWorkoutsByDate();
    fetchDay();  // Update Today's Plan list
    loadTodaysWorkouts();  // Update today's workouts
  }

  // ======= Tab Switching =======
  function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      const isActive = btn.dataset.tab === tabName;
      if (isActive) {
        btn.className = 'tab-btn px-4 py-3 text-sm font-medium border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 transition-colors';
      } else {
        btn.className = 'tab-btn px-4 py-3 text-sm font-medium border-b-2 border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors';
      }
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.add('hidden');
    });
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');

    // Refresh data when switching tabs
    if (tabName === 'progress') {
      refreshProgress();
      fetchWeeklySummaries();
    } else if (tabName === 'history') {
      // Initialize calendar on first visit
      if (!calendarInitialized) {
        initCalendar();
        calendarInitialized = true;
      }

      // Load exercises for the dropdown if not already loaded
      if (allExercises.length === 0) {
        loadAllExercises();
      }
      // Set default date for workout management
      $("mgmtDateInput").value = todayISO();
    } else if (tabName === 'health') {
      // Initialize health dashboard on first visit
      if (!healthCalendarInitialized) {
        loadHealthDashboard();
        healthCalendarInitialized = true;
      }
    }
  }

  // Setup tab click handlers
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // ======= Settings Modal =======
  const settingsModal = document.createElement('div');
  settingsModal.id = 'settingsModal';
  settingsModal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 hidden items-center justify-center';
  settingsModal.innerHTML = `
    <div class="bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-xl font-semibold">⚙️ Settings</h3>
        <button id="closeSettingsBtn" class="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors">✕</button>
      </div>

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-2">API URL</label>
          <input id="apiUrl" type="url" class="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" value="${defaultApi}" />
          <p class="text-xs text-neutral-500 mt-1">Server endpoint for API calls</p>
        </div>

        <div>
          <label class="block text-sm font-medium mb-2">Workout Plan</label>
          <select id="planId" class="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="thor" selected>Thor (Dumbbell-only)</option>
          </select>
        </div>

        <div class="pt-4 border-t border-neutral-200 dark:border-neutral-700">
          <label class="block text-sm font-medium mb-3">AI Model Configuration</label>
          <div id="llmConfigDisplay" class="bg-neutral-50 dark:bg-neutral-900 rounded-lg p-4 space-y-2">
            <p class="text-xs text-neutral-500 mb-3">⚙️ Backend configuration (read-only)</p>
            <div class="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span class="text-neutral-500">Provider:</span>
                <span id="configLlmProvider" class="ml-2 font-medium text-neutral-700 dark:text-neutral-300">Loading...</span>
              </div>
              <div>
                <span class="text-neutral-500">Model:</span>
                <span id="configLlmModel" class="ml-2 font-medium text-neutral-700 dark:text-neutral-300">Loading...</span>
              </div>
            </div>
            <div class="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700">
              <p class="text-xs text-neutral-600 dark:text-neutral-400">
                💡 To change LLM settings, edit the <code class="bg-neutral-200 dark:bg-neutral-800 px-1 rounded">.env</code> file in your project root and restart the server.
              </p>
              <details class="mt-2">
                <summary class="text-xs text-indigo-600 dark:text-indigo-400 cursor-pointer hover:underline">Show .env example</summary>
                <pre class="text-xs bg-neutral-800 text-neutral-200 p-2 rounded mt-2 overflow-x-auto">USE_OLLAMA=true
OLLAMA_MODEL=llama3.1:8b
# Or for OpenAI:
# USE_OLLAMA=false
# OPENAI_API_KEY=sk-...</pre>
              </details>
            </div>
          </div>
        </div>

        <div class="pt-4 border-t border-neutral-200 dark:border-neutral-700">
          <button id="closeSettingsBtn2" class="w-full px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(settingsModal);

  function toggleSettings() {
    settingsModal.classList.toggle('hidden');
    settingsModal.classList.toggle('flex');
  }

  document.getElementById('settingsBtn').addEventListener('click', toggleSettings);
  document.getElementById('closeSettingsBtn').addEventListener('click', toggleSettings);
  document.getElementById('closeSettingsBtn2').addEventListener('click', toggleSettings);
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) toggleSettings();
  });

  // Re-probe when API URL changes
  $("apiUrl").addEventListener("change", () => {
    saveStoredCfg({ apiBase: apiBase() });
    probeBackend();
  });

  // Load backend LLM config and display
  async function loadBackendLLMConfig() {
    try {
      const res = await fetch(`${apiBase()}/config`);
      if (!res.ok) throw new Error('Failed to fetch config');

      const data = await res.json();

      // Display provider
      const provider = data.llm || 'unknown';
      $("configLlmProvider").textContent = provider.charAt(0).toUpperCase() + provider.slice(1);

      // Display model
      let model = 'N/A';
      if (provider === 'ollama' && data.ollama?.model) {
        model = data.ollama.model;
      } else if (provider === 'openai') {
        model = 'gpt-4o-mini'; // Backend uses this model
      }
      $("configLlmModel").textContent = model;
    } catch (e) {
      console.error('Failed to load backend config:', e);
      $("configLlmProvider").textContent = 'Error loading';
      $("configLlmModel").textContent = 'Error loading';
    }
  }

  // Load config when modal opens
  $("settingsBtn").addEventListener('click', () => {
    loadBackendLLMConfig();
  });

  // ======= Keyboard Shortcuts =======
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter: Submit workout
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      postIngest();
    }

    // Escape: Close modal or cancel editing
    if (e.key === 'Escape') {
      // Close any open edit modes
      const editModes = document.querySelectorAll('[class*="edit-mode-"]:not(.hidden)');
      editModes.forEach(editMode => {
        const logId = editMode.className.match(/edit-mode-([a-f0-9-]+)/)?.[1];
        if (logId) toggleEditMode(logId);
      });
    }

    // Arrow keys for date navigation (when not in input field)
    if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
      if (e.key === 'ArrowLeft' && !e.shiftKey) {
        e.preventDefault();
        changeDate(-1);
      } else if (e.key === 'ArrowRight' && !e.shiftKey) {
        e.preventDefault();
        changeDate(1);
      }
    }
  });

  // ======= Wire up =======
  $("submitBtn").addEventListener('click', postIngest);
  $("refreshProgressBtn").addEventListener('click', refreshProgress);
  $("generateSummaryBtn").addEventListener('click', generateNewSummary);
  $("toggleHistoryBtn").addEventListener('click', toggleHistory);
  $("loadWorkoutsBtn").addEventListener('click', loadWorkoutsByDate);
  $("exerciseSelect").addEventListener('change', (e) => loadExerciseHistory(e.target.value));

  // Date navigation buttons
  $("todayBtn").addEventListener('click', setToday);
  $("prevDayBtn").addEventListener('click', () => changeDate(-1));
  $("nextDayBtn").addEventListener('click', () => changeDate(1));
  $("dateInput").addEventListener('change', () => {
    fetchDay();  // Update Today's Plan list
    loadTodaysWorkouts();  // Update selected date's workouts
  });

  // Export button
  $("exportDataBtn").addEventListener('click', exportData);

  // ======= Health Dashboard =======
  let sleepChartInstance = null;
  let migraineChartInstance = null;
  let activityChartInstance = null;
  let currentHealthMonth = new Date();
  let currentHealthWeek = new Date();
  let healthEventsCache = [];
  let healthCalendarInitialized = false;

  // Feature 1: Submit Health Event
  async function submitHealthEvent(e) {
    if (e) e.preventDefault();

    const date = $("healthDate").value;
    const category = $("healthCategory").value;
    const intensity = parseInt($("healthIntensity").value);
    const duration = $("healthDuration").value ? parseInt($("healthDuration").value) : null;
    const notes = $("healthNotes").value.trim();

    if (!date || !category) {
      showToast('Please fill in all required fields', 'warning');
      return;
    }

    try {
      const res = await fetch(`${apiBase()}/health-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, category, intensity, duration, notes })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to log health event');
      }

      const data = await res.json();
      showToast('Health event logged successfully!', 'success');

      // Clear form
      $("healthEventForm").reset();
      $("healthDate").value = todayISO();
      $("intensityValue").textContent = '5';

      // Refresh dashboard
      loadHealthDashboard();
    } catch (e) {
      console.error('Failed to submit health event:', e);
      showToast('Failed to log health event: ' + e.message, 'error');
    }
  }

  // Feature 2: Load Health Charts
  async function loadHealthCharts(days = 30) {
    const to = todayISO();
    const fromDate = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
    const from = toLocalDateString(fromDate);

    try {
      const res = await fetch(`${apiBase()}/health-events?from=${from}&to=${to}`);
      if (!res.ok) throw new Error('Failed to load health events');

      const data = await res.json();
      const events = data.events || [];

      // Group events by date and category
      const dateMap = {};
      for (let i = 0; i < days; i++) {
        const d = new Date(fromDate);
        d.setDate(d.getDate() + i);
        const dateStr = toLocalDateString(d);
        dateMap[dateStr] = { sleep: 0, migraine: 0, activity: 0 };
      }

      events.forEach(event => {
        if (dateMap[event.date]) {
          if (event.category === 'sleep' && event.duration) {
            dateMap[event.date].sleep = event.duration / 60; // Convert to hours
          } else if (event.category === 'migraine') {
            dateMap[event.date].migraine += 1;
          } else if (['yardwork', 'run'].includes(event.category) && event.duration) {
            dateMap[event.date].activity += event.duration;
          }
        }
      });

      const dates = Object.keys(dateMap).sort();
      const sleepData = dates.map(d => dateMap[d].sleep);
      const migraineData = dates.map(d => dateMap[d].migraine);
      const activityData = dates.map(d => dateMap[d].activity);

      // Sleep Chart
      const sleepCtx = $("sleepChart");
      if (sleepChartInstance) sleepChartInstance.destroy();
      sleepChartInstance = new Chart(sleepCtx, {
        type: 'line',
        data: {
          labels: dates.map(d => d.slice(5)), // MM-DD format
          datasets: [{
            label: 'Hours',
            data: sleepData,
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 1 } } }
        }
      });

      // Migraine Chart (weekly bars)
      const weeks = {};
      dates.forEach((date, idx) => {
        const weekStart = getWeekStart(new Date(date));
        const weekKey = toLocalDateString(weekStart);
        if (!weeks[weekKey]) weeks[weekKey] = 0;
        weeks[weekKey] += migraineData[idx];
      });

      const weekLabels = Object.keys(weeks).sort();
      const weekValues = weekLabels.map(w => weeks[w]);

      const migraineCtx = $("migraineChart");
      if (migraineChartInstance) migraineChartInstance.destroy();
      migraineChartInstance = new Chart(migraineCtx, {
        type: 'bar',
        data: {
          labels: weekLabels.map(w => w.slice(5)), // MM-DD format
          datasets: [{
            label: 'Count',
            data: weekValues,
            backgroundColor: 'rgba(239, 68, 68, 0.6)',
            borderColor: 'rgb(239, 68, 68)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
      });

      // Activity Chart (stacked bar)
      const activityCtx = $("activityChart");
      if (activityChartInstance) activityChartInstance.destroy();
      activityChartInstance = new Chart(activityCtx, {
        type: 'bar',
        data: {
          labels: dates.map(d => d.slice(5)), // MM-DD format
          datasets: [{
            label: 'Minutes',
            data: activityData,
            backgroundColor: 'rgba(34, 197, 94, 0.6)',
            borderColor: 'rgb(34, 197, 94)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, stacked: true } }
        }
      });

    } catch (e) {
      console.error('Failed to load health charts:', e);
      showToast('Failed to load health charts', 'error');
    }
  }

  // Feature 3: Health Calendar
  function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day; // Sunday as start of week
    return new Date(d.setDate(diff));
  }

  async function loadHealthCalendar(month, year) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const fromDate = toLocalDateString(firstDay);
    const toDate = toLocalDateString(lastDay);

    try {
      const res = await fetch(`${apiBase()}/health-events?from=${fromDate}&to=${toDate}`);
      if (!res.ok) throw new Error('Failed to load health events');

      const data = await res.json();
      healthEventsCache = data.events || [];

      renderHealthCalendar(month, year);
    } catch (e) {
      console.error('Failed to load health calendar:', e);
    }
  }

  function renderHealthCalendar(month, year) {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    $("healthCalendarMonthLabel").textContent = `${monthNames[month]} ${year}`;

    const calendarGrid = $("healthCalendar");
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let calendarHTML = '';

    // Day headers
    const dayHeaders = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    dayHeaders.forEach(day => {
      calendarHTML += `<div class="text-center text-xs font-medium text-neutral-500 dark:text-neutral-400 pb-1">${day}</div>`;
    });

    // Empty cells before first day
    for (let i = 0; i < firstDayOfMonth; i++) {
      calendarHTML += '<div class="h-12 w-full"></div>';
    }

    const today = new Date();
    const todayStr = toLocalDateString(today);

    // Calendar days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = toLocalDateString(date);
      const dayEvents = healthEventsCache.filter(e => e.date === dateStr);
      const isToday = dateStr === todayStr;

      // Determine dot color based on events
      let dotColor = 'bg-neutral-300 dark:bg-neutral-700';
      let bgClass = 'bg-neutral-100 dark:bg-neutral-900 hover:bg-neutral-200 dark:hover:bg-neutral-800';

      if (dayEvents.length > 1) {
        dotColor = 'bg-purple-500';
        bgClass = 'bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-950/50';
      } else if (dayEvents.length === 1) {
        const category = dayEvents[0].category;
        if (category === 'migraine') {
          dotColor = 'bg-red-500';
          bgClass = 'bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50';
        } else if (category === 'sleep') {
          dotColor = 'bg-blue-500';
          bgClass = 'bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50';
        } else if (['yardwork', 'run'].includes(category)) {
          dotColor = 'bg-green-500';
          bgClass = 'bg-green-50 dark:bg-green-950/30 hover:bg-green-100 dark:hover:bg-green-950/50';
        }
      }

      const borderClass = isToday ? 'ring-1 ring-indigo-500' : '';

      calendarHTML += `
        <button
          onclick="showHealthEventsForDate('${dateStr}')"
          class="h-12 w-full rounded ${bgClass} ${borderClass} transition-all flex flex-col items-center justify-center cursor-pointer text-xs"
          title="${dateStr}${dayEvents.length > 0 ? ' - ' + dayEvents.length + ' event(s)' : ''}"
        >
          <span class="font-medium text-neutral-700 dark:text-neutral-300">${day}</span>
          <span class="w-2 h-2 rounded-full ${dotColor} mt-0.5"></span>
        </button>
      `;
    }

    calendarGrid.innerHTML = calendarHTML;
  }

  async function showHealthEventsForDate(dateStr) {
    const events = healthEventsCache.filter(e => e.date === dateStr);

    if (events.length === 0) {
      $("selectedDateEvents").classList.add('hidden');
      showToast(`No health events on ${dateStr}`, 'info');
      return;
    }

    $("selectedDateLabel").textContent = dateStr;
    $("selectedDateEvents").classList.remove('hidden');

    const categoryEmojis = {
      migraine: '🤕',
      sleep: '😴',
      yardwork: '🌱',
      run: '🏃',
      other: '📝'
    };

    $("selectedDateEventsList").innerHTML = events.map(event => `
      <div class="bg-neutral-50 dark:bg-neutral-900 rounded-lg p-3 flex items-start justify-between">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-lg">${categoryEmojis[event.category] || '📝'}</span>
            <span class="font-medium text-sm">${event.category.charAt(0).toUpperCase() + event.category.slice(1)}</span>
          </div>
          <div class="text-xs text-neutral-600 dark:text-neutral-400">
            Intensity: ${event.intensity}/10
            ${event.duration ? ` • Duration: ${event.duration} min` : ''}
          </div>
          ${event.notes ? `<div class="text-xs text-neutral-500 dark:text-neutral-400 italic mt-1">${event.notes}</div>` : ''}
        </div>
        <button onclick="deleteHealthEvent('${event.id}')" class="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-xs">
          Delete
        </button>
      </div>
    `).join('');
  }

  async function deleteHealthEvent(eventId) {
    const confirmed = await showConfirm({
      title: 'Delete Health Event?',
      message: 'This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
      icon: '🗑️'
    });

    if (!confirmed) return;

    try {
      const res = await fetch(`${apiBase()}/health-events/${eventId}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Failed to delete');

      showToast('Health event deleted!', 'success');
      loadHealthDashboard();
    } catch (e) {
      console.error('Failed to delete health event:', e);
      showToast('Failed to delete health event', 'error');
    }
  }

  async function changeHealthMonth(offset) {
    currentHealthMonth = new Date(
      currentHealthMonth.getFullYear(),
      currentHealthMonth.getMonth() + offset,
      1
    );

    await loadHealthCalendar(
      currentHealthMonth.getMonth(),
      currentHealthMonth.getFullYear()
    );
  }

  // Feature 4: Calculate Correlations
  async function calculateCorrelations() {
    const to = todayISO();
    const from = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    try {
      const [healthRes, workoutRes] = await Promise.all([
        fetch(`${apiBase()}/health-events?from=${from}&to=${to}`),
        fetch(`${apiBase()}/progress/summary?from=${from}&to=${to}`)
      ]);

      if (!healthRes.ok || !workoutRes.ok) throw new Error('Failed to load data');

      const healthData = await healthRes.json();
      const workoutData = await workoutRes.json();

      const healthEvents = healthData.events || [];
      const workoutSessions = workoutData.sessions || [];

      // Group by week
      const weeks = {};

      // Process workouts
      workoutSessions.forEach(session => {
        const weekStart = getWeekStart(new Date(session.session_date));
        const weekKey = toLocalDateString(weekStart);
        if (!weeks[weekKey]) weeks[weekKey] = { workouts: 0, migraines: 0, sleepHours: 0, sleepCount: 0 };
        weeks[weekKey].workouts += 1;
      });

      // Process health events
      healthEvents.forEach(event => {
        const weekStart = getWeekStart(new Date(event.date));
        const weekKey = toLocalDateString(weekStart);
        if (!weeks[weekKey]) weeks[weekKey] = { workouts: 0, migraines: 0, sleepHours: 0, sleepCount: 0 };

        if (event.category === 'migraine') {
          weeks[weekKey].migraines += 1;
        } else if (event.category === 'sleep' && event.duration) {
          weeks[weekKey].sleepHours += event.duration / 60;
          weeks[weekKey].sleepCount += 1;
        }
      });

      // Calculate correlations
      const weeksWithWorkouts = Object.values(weeks).filter(w => w.workouts >= 3);
      const weeksWithoutWorkouts = Object.values(weeks).filter(w => w.workouts < 3);

      const avgMigrainesWithWorkouts = weeksWithWorkouts.length > 0
        ? weeksWithWorkouts.reduce((sum, w) => sum + w.migraines, 0) / weeksWithWorkouts.length
        : 0;

      const avgMigrainesWithoutWorkouts = weeksWithoutWorkouts.length > 0
        ? weeksWithoutWorkouts.reduce((sum, w) => sum + w.migraines, 0) / weeksWithoutWorkouts.length
        : 0;

      const migraineReduction = avgMigrainesWithoutWorkouts > 0
        ? ((avgMigrainesWithoutWorkouts - avgMigrainesWithWorkouts) / avgMigrainesWithoutWorkouts * 100)
        : 0;

      // Calculate average sleep on workout days vs rest days
      const workoutDates = new Set(workoutSessions.map(s => s.session_date));
      const sleepOnWorkoutDays = healthEvents.filter(e =>
        e.category === 'sleep' && workoutDates.has(e.date) && e.duration
      );
      const sleepOnRestDays = healthEvents.filter(e =>
        e.category === 'sleep' && !workoutDates.has(e.date) && e.duration
      );

      const avgSleepWorkoutDays = sleepOnWorkoutDays.length > 0
        ? sleepOnWorkoutDays.reduce((sum, e) => sum + e.duration, 0) / sleepOnWorkoutDays.length / 60
        : 0;

      const avgSleepRestDays = sleepOnRestDays.length > 0
        ? sleepOnRestDays.reduce((sum, e) => sum + e.duration, 0) / sleepOnRestDays.length / 60
        : 0;

      // Render correlations
      const correlationsHTML = [];

      if (weeksWithWorkouts.length > 0 && avgMigrainesWithoutWorkouts > 0) {
        correlationsHTML.push(`
          <div class="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30 rounded-lg p-4 border border-emerald-200 dark:border-emerald-800">
            <div class="text-2xl mb-2">📉</div>
            <div class="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Migraine Reduction</div>
            <div class="text-xs text-neutral-600 dark:text-neutral-400">
              Weeks with 3+ workouts: ${migraineReduction.toFixed(0)}% fewer migraines
            </div>
          </div>
        `);
      }

      if (sleepOnWorkoutDays.length > 0 && sleepOnRestDays.length > 0) {
        const sleepDiff = avgSleepWorkoutDays - avgSleepRestDays;
        const sleepColor = sleepDiff > 0 ? 'from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800' : 'from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 border-amber-200 dark:border-amber-800';
        correlationsHTML.push(`
          <div class="bg-gradient-to-br ${sleepColor} rounded-lg p-4 border">
            <div class="text-2xl mb-2">😴</div>
            <div class="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Sleep Quality</div>
            <div class="text-xs text-neutral-600 dark:text-neutral-400">
              Avg sleep on workout days: ${avgSleepWorkoutDays.toFixed(1)}h vs ${avgSleepRestDays.toFixed(1)}h on rest days
            </div>
          </div>
        `);
      }

      if (weeksWithWorkouts.length > 0) {
        const avgWorkoutsPerWeek = weeksWithWorkouts.reduce((sum, w) => sum + w.workouts, 0) / weeksWithWorkouts.length;
        correlationsHTML.push(`
          <div class="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
            <div class="text-2xl mb-2">💪</div>
            <div class="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Consistency</div>
            <div class="text-xs text-neutral-600 dark:text-neutral-400">
              Average ${avgWorkoutsPerWeek.toFixed(1)} workouts per week
            </div>
          </div>
        `);
      }

      if (correlationsHTML.length === 0) {
        correlationsHTML.push(`
          <div class="col-span-full text-center py-6">
            <p class="text-sm text-neutral-500 dark:text-neutral-400">Not enough data yet to calculate correlations</p>
            <p class="text-xs text-neutral-400 dark:text-neutral-500 mt-1">Keep logging workouts and health events!</p>
          </div>
        `);
      }

      $("correlations").innerHTML = correlationsHTML.join('');

    } catch (e) {
      console.error('Failed to calculate correlations:', e);
      $("correlations").innerHTML = '<p class="text-sm text-red-600 dark:text-red-400 col-span-full">Failed to load correlations</p>';
    }
  }

  // Feature 5: Load Health Summary
  async function loadHealthSummary(weekStart) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const from = toLocalDateString(weekStart);
    const to = toLocalDateString(weekEnd);

    try {
      const res = await fetch(`${apiBase()}/health-events?from=${from}&to=${to}`);
      if (!res.ok) throw new Error('Failed to load health events');

      const data = await res.json();
      const events = data.events || [];

      // Calculate weekly stats
      const sleepEvents = events.filter(e => e.category === 'sleep');
      const totalSleepHours = sleepEvents.reduce((sum, e) => sum + (e.duration || 0), 0) / 60;
      const migraineCount = events.filter(e => e.category === 'migraine').length;
      const activityEvents = events.filter(e => ['yardwork', 'run'].includes(e.category));
      const totalActivityMinutes = activityEvents.reduce((sum, e) => sum + (e.duration || 0), 0);

      // Compare with previous week
      const prevWeekStart = new Date(weekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevWeekEnd = new Date(prevWeekStart);
      prevWeekEnd.setDate(prevWeekEnd.getDate() + 6);

      const prevRes = await fetch(`${apiBase()}/health-events?from=${toLocalDateString(prevWeekStart)}&to=${toLocalDateString(prevWeekEnd)}`);
      let prevWeekData = { events: [] };
      if (prevRes.ok) {
        prevWeekData = await prevRes.json();
      }

      const prevSleepHours = prevWeekData.events.filter(e => e.category === 'sleep').reduce((sum, e) => sum + (e.duration || 0), 0) / 60;
      const prevMigraines = prevWeekData.events.filter(e => e.category === 'migraine').length;

      const sleepChange = prevSleepHours > 0 ? ((totalSleepHours - prevSleepHours) / prevSleepHours * 100) : 0;
      const migraineChange = prevMigraines > 0 ? ((migraineCount - prevMigraines) / prevMigraines * 100) : 0;

      const sleepIcon = sleepChange > 0 ? '📈' : sleepChange < 0 ? '📉' : '➡️';
      const migraineIcon = migraineChange < 0 ? '📈' : migraineChange > 0 ? '📉' : '➡️';

      $("healthSummary").innerHTML = `
        <div class="bg-white dark:bg-neutral-800 rounded-xl p-4 shadow-sm border border-neutral-200 dark:border-neutral-700">
          <div class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">
            Week of ${from} → ${to}
          </div>

          <div class="grid grid-cols-3 gap-3 mb-4">
            <div class="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3">
              <div class="text-2xl font-bold text-blue-900 dark:text-blue-100">${totalSleepHours.toFixed(1)}h</div>
              <div class="text-xs text-blue-700 dark:text-blue-300 mt-1">Total Sleep</div>
              <div class="text-xs text-neutral-600 dark:text-neutral-400 mt-1">${sleepIcon} ${sleepChange !== 0 ? (sleepChange > 0 ? '+' : '') + sleepChange.toFixed(1) + '%' : 'No change'}</div>
            </div>
            <div class="bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
              <div class="text-2xl font-bold text-red-900 dark:text-red-100">${migraineCount}</div>
              <div class="text-xs text-red-700 dark:text-red-300 mt-1">Migraines</div>
              <div class="text-xs text-neutral-600 dark:text-neutral-400 mt-1">${migraineIcon} ${migraineChange !== 0 ? (migraineChange > 0 ? '+' : '') + migraineChange.toFixed(0) + '%' : 'No change'}</div>
            </div>
            <div class="bg-green-50 dark:bg-green-950/30 rounded-lg p-3">
              <div class="text-2xl font-bold text-green-900 dark:text-green-100">${totalActivityMinutes}</div>
              <div class="text-xs text-green-700 dark:text-green-300 mt-1">Activity (min)</div>
            </div>
          </div>

          ${events.length > 0 ? `
            <div class="bg-neutral-50 dark:bg-neutral-900/50 rounded-lg p-3">
              <div class="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2">Recent Events:</div>
              <div class="space-y-1">
                ${events.slice(0, 3).map(e => `
                  <div class="text-xs text-neutral-700 dark:text-neutral-300">
                    ${e.date}: ${e.category} (intensity: ${e.intensity}/10)
                  </div>
                `).join('')}
              </div>
            </div>
          ` : '<p class="text-xs text-neutral-500 dark:text-neutral-400">No events logged this week</p>'}
        </div>
      `;

    } catch (e) {
      console.error('Failed to load health summary:', e);
      $("healthSummary").innerHTML = '<p class="text-sm text-red-600 dark:text-red-400">Failed to load health summary</p>';
    }
  }

  function changeHealthWeek(offset) {
    currentHealthWeek = new Date(currentHealthWeek);
    currentHealthWeek.setDate(currentHealthWeek.getDate() + (offset * 7));
    const weekStart = getWeekStart(currentHealthWeek);
    loadHealthSummary(weekStart);
  }

  // Main dashboard loader
  async function loadHealthDashboard() {
    const weekStart = getWeekStart(currentHealthWeek);
    await Promise.all([
      loadHealthSummary(weekStart),
      loadHealthCharts(parseInt($("healthChartRange").value || 30)),
      loadHealthCalendar(currentHealthMonth.getMonth(), currentHealthMonth.getFullYear()),
      calculateCorrelations()
    ]);
  }

  // Make functions globally available
  window.showHealthEventsForDate = showHealthEventsForDate;
  window.deleteHealthEvent = deleteHealthEvent;

  // Event listeners for Health Dashboard
  if ($("healthEventForm")) {
    $("healthEventForm").addEventListener('submit', submitHealthEvent);
  }

  if ($("clearHealthBtn")) {
    $("clearHealthBtn").addEventListener('click', () => {
      $("healthEventForm").reset();
      $("healthDate").value = todayISO();
      $("intensityValue").textContent = '5';
    });
  }

  if ($("healthIntensity")) {
    $("healthIntensity").addEventListener('input', (e) => {
      $("intensityValue").textContent = e.target.value;
    });
  }

  if ($("healthChartRange")) {
    $("healthChartRange").addEventListener('change', (e) => {
      loadHealthCharts(parseInt(e.target.value));
    });
  }

  if ($("prevHealthMonthBtn")) {
    $("prevHealthMonthBtn").addEventListener('click', () => changeHealthMonth(-1));
  }

  if ($("nextHealthMonthBtn")) {
    $("nextHealthMonthBtn").addEventListener('click', () => changeHealthMonth(1));
  }

  if ($("prevWeekBtn")) {
    $("prevWeekBtn").addEventListener('click', () => changeHealthWeek(-1));
  }

  if ($("nextWeekBtn")) {
    $("nextWeekBtn").addEventListener('click', () => changeHealthWeek(1));
  }

  if ($("refreshHealthBtn")) {
    $("refreshHealthBtn").addEventListener('click', loadHealthDashboard);
  }

  // Initialize health date input to today
  if ($("healthDate")) {
    $("healthDate").value = todayISO();
  }

  // Auto-load
  fetchDay();
  refreshProgress();
  fetchWeeklySummaries();
  loadTodaysWorkouts();
