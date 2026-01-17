/**
 * Running Dashboard Frontend
 */

const API_BASE = `http://${window.location.hostname}:3000/api/running`;
let sessions = [];
let weeklyChart = null;
let editingSessionId = null;

/**
 * Initialize the dashboard
 */
async function initDashboard() {
  console.log("[Running] Initializing dashboard");
  await loadSessions();
  await loadStats();
  await loadWeeklyStats();
  attachDurationChangeListeners();
}

/**
 * Attach listeners to auto-calculate pace when distance or duration changes
 */
function attachDurationChangeListeners() {
  const distanceInput = document.getElementById("distance");
  const durationMinInput = document.getElementById("durationMinutes");
  const durationSecInput = document.getElementById("durationSeconds");
  
  [distanceInput, durationMinInput, durationSecInput].forEach((input) => {
    if (input) {
      input.addEventListener("change", updatePaceDisplay);
      input.addEventListener("input", updatePaceDisplay);
    }
  });
}

/**
 * Update pace display based on distance and duration
 */
function updatePaceDisplay() {
  const distance = parseFloat(document.getElementById("distance").value) || 0;
  const minutes = parseInt(document.getElementById("durationMinutes").value) || 0;
  const seconds = parseInt(document.getElementById("durationSeconds").value) || 0;
  
  if (distance > 0 && (minutes > 0 || seconds > 0)) {
    const totalMinutes = minutes + seconds / 60;
    const paceMinutes = totalMinutes / distance;
    const paceMM = Math.floor(paceMinutes);
    const paceSS = Math.round((paceMinutes - paceMM) * 60);
    document.getElementById("pace").value = `${paceMM}:${String(paceSS).padStart(2, "0")}`;
  } else {
    document.getElementById("pace").value = "";
  }
}

/**
 * Load all running sessions
 */
async function loadSessions() {
  try {
    const response = await fetch(`${API_BASE}/sessions`);
    const data = await response.json();
    sessions = data.sessions || [];
    console.log("[Running] Loaded sessions:", sessions.length);
    displaySessions();
  } catch (error) {
    console.error("[Running] Error loading sessions:", error);
    showError("Failed to load sessions");
  }
}

/**
 * Display sessions in the UI
 */
function displaySessions() {
  const container = document.getElementById("sessionsList");
  
  if (sessions.length === 0) {
    container.innerHTML = '<p class="text-gray-400 text-center py-8">No runs logged yet. Start tracking your runs!</p>';
    return;
  }

  container.innerHTML = sessions.map((session) => {
    const pace = formatPace(session.pace_min_per_mile || calculatePaceDecimal(session.distance_miles, session.duration_minutes));
    const duration = formatDuration(session.duration_minutes);
    const date = new Date(session.session_date).toLocaleDateString();
    
    return `
      <div class="bg-gray-700 rounded-lg p-4 flex justify-between items-center">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-lg font-bold">${session.distance_miles} mi</span>
            <span class="text-gray-400">•</span>
            <span class="text-gray-300">${duration}</span>
            <span class="text-gray-400">•</span>
            <span class="text-indigo-300">${pace} /mi</span>
          </div>
          <div class="text-sm text-gray-400">
            ${date} 
            ${session.surface ? `• ${capitalizeFirst(session.surface)}` : ""}
            ${session.effort_level ? `• ${capitalizeFirst(session.effort_level)}` : ""}
          </div>
          ${session.notes ? `<div class="text-sm text-gray-500 mt-1">${escapeHtml(session.notes)}</div>` : ""}
        </div>
        <div class="flex gap-2">
          <button
            onclick="editSession('${session.id}')"
            class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
          >
            ✏️
          </button>
          <button
            onclick="deleteSession('${session.id}')"
            class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
          >
            🗑️
          </button>
        </div>
      </div>
    `;
  }).join("");
}

/**
 * Load overall statistics
 */
async function loadStats() {
  try {
    const response = await fetch(`${API_BASE}/stats`);
    const data = await response.json();
    const stats = data.stats;

    document.getElementById("totalSessions").textContent = stats.total_sessions || 0;
    document.getElementById("totalDistance").textContent = 
      stats.total_distance ? parseFloat(stats.total_distance).toFixed(1) : "0";
    document.getElementById("totalDuration").textContent = 
      stats.total_duration ? (stats.total_duration / 60).toFixed(1) : "0";
    document.getElementById("avgPace").textContent = 
      stats.avg_pace ? parseFloat(stats.avg_pace).toFixed(2) : "--";

    console.log("[Running] Loaded stats:", stats);
  } catch (error) {
    console.error("[Running] Error loading stats:", error);
  }
}

/**
 * Load weekly statistics and update chart
 */
async function loadWeeklyStats() {
  try {
    const response = await fetch(`${API_BASE}/stats/weekly`);
    const data = await response.json();
    const weeklyStats = data.weeklyStats || [];

    console.log("[Running] Loaded weekly stats:", weeklyStats);

    // Sort by week (ascending for chart display)
    const sorted = [...weeklyStats].reverse();

    // Update chart
    const ctx = document.getElementById("weeklyChart").getContext("2d");
    
    if (weeklyChart) {
      weeklyChart.destroy();
    }

    weeklyChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: sorted.map((w) => `Week ${w.week.split("-W")[1]}`),
        datasets: [
          {
            label: "Distance (miles)",
            data: sorted.map((w) => parseFloat(w.distance) || 0),
            backgroundColor: "rgba(99, 102, 241, 0.6)",
            borderColor: "rgba(99, 102, 241, 1)",
            borderWidth: 1,
            yAxisID: "y",
          },
          {
            label: "Sessions",
            data: sorted.map((w) => w.sessions),
            backgroundColor: "rgba(34, 197, 94, 0.6)",
            borderColor: "rgba(34, 197, 94, 1)",
            borderWidth: 1,
            yAxisID: "y1",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: { mode: "index", intersect: false },
        scales: {
          y: {
            type: "linear",
            display: true,
            position: "left",
            title: { display: true, text: "Distance (mi)" },
            ticks: { color: "rgba(209, 213, 219, 1)" },
            grid: { color: "rgba(55, 65, 81, 0.5)" },
          },
          y1: {
            type: "linear",
            display: true,
            position: "right",
            title: { display: true, text: "Sessions" },
            ticks: { color: "rgba(209, 213, 219, 1)" },
            grid: { drawOnChartArea: false },
          },
        },
        plugins: {
          legend: { labels: { color: "rgba(209, 213, 219, 1)" } },
        },
      },
    });
  } catch (error) {
    console.error("[Running] Error loading weekly stats:", error);
  }
}

/**
 * Open add session modal
 */
function openAddSessionModal() {
  editingSessionId = null;
  document.getElementById("modalTitle").textContent = "Log New Run";
  document.getElementById("sessionForm").reset();
  document.getElementById("sessionDate").valueAsDate = new Date();
  document.getElementById("sessionModal").classList.remove("hidden");
}

/**
 * Close modal
 */
function closeSessionModal() {
  document.getElementById("sessionModal").classList.add("hidden");
  editingSessionId = null;
}

/**
 * Edit a session
 */
function editSession(sessionId) {
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return;

  editingSessionId = sessionId;
  document.getElementById("modalTitle").textContent = "Edit Run";

  document.getElementById("sessionDate").value = session.session_date;
  document.getElementById("distance").value = session.distance_miles;
  
  // Parse duration_minutes into minutes and seconds
  const totalSeconds = session.duration_minutes * 60;
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  document.getElementById("durationMinutes").value = mins;
  document.getElementById("durationSeconds").value = secs;
  
  // Set pace if available
  if (session.pace_min_per_mile) {
    document.getElementById("pace").value = formatPace(session.pace_min_per_mile);
  } else {
    document.getElementById("pace").value = "";
  }
  
  document.getElementById("startTime").value = session.start_time || "";
  document.getElementById("endTime").value = session.end_time || "";
  document.getElementById("surface").value = session.surface || "";
  document.getElementById("effortLevel").value = session.effort_level || "";
  document.getElementById("elevationGain").value = session.elevation_gain_ft || "";
  document.getElementById("elevationLoss").value = session.elevation_loss_ft || "";
  document.getElementById("avgHeartRate").value = session.avg_heart_rate || "";
  document.getElementById("maxHeartRate").value = session.max_heart_rate || "";
  document.getElementById("caloriesBurned").value = session.calories_burned || "";
  document.getElementById("weather").value = session.weather || "";
  document.getElementById("location").value = session.location || "";
  document.getElementById("notes").value = session.notes || "";

  document.getElementById("sessionModal").classList.remove("hidden");
}

/**
 * Save a session (create or update)
 */
async function saveSession(event) {
  event.preventDefault();

  // Convert minutes and seconds to total minutes for API
  const durationMinutes = parseInt(document.getElementById("durationMinutes").value) || 0;
  const durationSeconds = parseInt(document.getElementById("durationSeconds").value) || 0;
  const totalDurationMinutes = durationMinutes + durationSeconds / 60;

  // Parse pace from "mm:ss" format to decimal minutes per mile
  const paceStr = document.getElementById("pace").value;
  let paceDecimal = null;
  if (paceStr) {
    const [mm, ss] = paceStr.split(":").map(Number);
    paceDecimal = mm + ss / 60;
  }

  const sessionData = {
    session_date: document.getElementById("sessionDate").value,
    distance_miles: parseFloat(document.getElementById("distance").value),
    duration_minutes: totalDurationMinutes,
    pace_min_per_mile: paceDecimal,
    start_time: document.getElementById("startTime").value || null,
    end_time: document.getElementById("endTime").value || null,
    surface: document.getElementById("surface").value || null,
    effort_level: document.getElementById("effortLevel").value || null,
    elevation_gain_ft: document.getElementById("elevationGain").value
      ? parseInt(document.getElementById("elevationGain").value)
      : null,
    elevation_loss_ft: document.getElementById("elevationLoss").value
      ? parseInt(document.getElementById("elevationLoss").value)
      : null,
    avg_heart_rate: document.getElementById("avgHeartRate").value
      ? parseInt(document.getElementById("avgHeartRate").value)
      : null,
    max_heart_rate: document.getElementById("maxHeartRate").value
      ? parseInt(document.getElementById("maxHeartRate").value)
      : null,
    calories_burned: document.getElementById("caloriesBurned").value
      ? parseInt(document.getElementById("caloriesBurned").value)
      : null,
    weather: document.getElementById("weather").value || null,
    location: document.getElementById("location").value || null,
    notes: document.getElementById("notes").value || null,
  };

  try {
    const method = editingSessionId ? "PUT" : "POST";
    const url = editingSessionId
      ? `${API_BASE}/sessions/${editingSessionId}`
      : `${API_BASE}/sessions`;

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sessionData),
    });

    if (response.ok) {
      showSuccess(editingSessionId ? "Run updated!" : "Run logged!");
      closeSessionModal();
      await loadSessions();
      await loadStats();
      await loadWeeklyStats();
    } else {
      showError("Failed to save run");
    }
  } catch (error) {
    console.error("[Running] Error saving session:", error);
    showError("Failed to save run");
  }
}

/**
 * Delete a session
 */
async function deleteSession(sessionId) {
  if (!confirm("Delete this run?")) return;

  try {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      showSuccess("Run deleted!");
      await loadSessions();
      await loadStats();
      await loadWeeklyStats();
    } else {
      showError("Failed to delete run");
    }
  } catch (error) {
    console.error("[Running] Error deleting session:", error);
    showError("Failed to delete run");
  }
}

/**
 * Calculate pace (decimal minutes per mile) from distance and duration
 */
function calculatePaceDecimal(distance, duration) {
  if (!distance || !duration) return 0;
  return duration / distance;
}

/**
 * Format pace from decimal (min/mi) to "mm:ss" format
 */
function formatPace(decimalMinutes) {
  if (!decimalMinutes || decimalMinutes === 0) return "--";
  const mm = Math.floor(decimalMinutes);
  const ss = Math.round((decimalMinutes - mm) * 60);
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

/**
 * Format duration from minutes (decimal) to "31m 9s" format
 */
function formatDuration(totalMinutes) {
  if (!totalMinutes) return "0m";
  const mins = Math.floor(totalMinutes);
  const secs = Math.round((totalMinutes - mins) * 60);
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

/**
 * Capitalize first letter
 */
function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Show success message
 */
function showSuccess(message) {
  console.log("[Running]", message);
  // Could be replaced with a toast notification
  alert(message);
}

/**
 * Show error message
 */
function showError(message) {
  console.error("[Running]", message);
  // Could be replaced with a toast notification
  alert(message);
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", initDashboard);