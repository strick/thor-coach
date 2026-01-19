/**
 * Daily Summary Module
 * Handles generating and displaying AI-powered daily summaries
 * Works on both home and history pages
 */

(function() {
  // Check if we're on the history page
  const isHistoryPage = document.getElementById('summaryModal') !== null;

  // Get DOM elements for history modal
  const summaryModal = document.getElementById('summaryModal');
  const summaryModalContent = document.getElementById('summaryModalContent');
  const summaryModalLoading = document.getElementById('summaryModalLoading');
  const summaryModalError = document.getElementById('summaryModalError');
  const summaryModalText = document.getElementById('summaryModalText');
  const summaryModalFooter = document.getElementById('summaryModalFooter');
  const summaryDateLabel = document.getElementById('summaryDateLabel');
  const closeSummaryModalBtn = document.getElementById('closeSummaryModalBtn');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const copySummaryModalBtn = document.getElementById('copySummaryModalBtn');

  // Event listeners for modal
  if (closeSummaryModalBtn) {
    closeSummaryModalBtn.addEventListener('click', closeSummaryModal);
  }
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeSummaryModal);
  }
  if (copySummaryModalBtn) {
    copySummaryModalBtn.addEventListener('click', copyToClipboard);
  }

  /**
   * Generate a daily summary for a specific date (used in history)
   */
  async function generateDailySummaryForDate(date) {
    showLoading();
    hideError();
    openSummaryModal(date);

    try {
      const response = await fetch('http://localhost:3000/api/daily-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ date })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to generate summary (${response.status})`);
      }

      const data = await response.json();
      displaySummary(data);

    } catch (error) {
      console.error('Error generating summary:', error);
      showError(error.message || 'Failed to generate daily summary');
    }
  }

  /**
   * Display the generated summary in modal
   */
  function displaySummary(data) {
    // Convert markdown to HTML
    const htmlContent = markdownToHTML(data.markdown);

    summaryModalText.innerHTML = htmlContent;
    summaryModalText.classList.remove('hidden');
    hideLoading();
    showFooter();

    // Store current summary for copy functionality
    window.currentSummaryMarkdown = data.markdown;
    window.currentSummaryDate = data.date;
  }

  /**
   * Simple markdown to HTML converter
   */
  function markdownToHTML(markdown) {
    let html = markdown
      // Headers
      .replace(/^## (.*?)$/gm, '<h2 class="text-lg font-bold mt-4 mb-2">$1</h2>')
      .replace(/^# (.*?)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>')
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold">$1</strong>')
      // Italics
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      // Horizontal rule
      .replace(/^---$/gm, '<hr class="my-4 border-neutral-300 dark:border-neutral-700">')
      // Line breaks
      .replace(/\n\n/g, '</p><p class="mb-2">')
      .replace(/\n/g, '<br>')
      // Lists - start with proper structure
      .replace(/^- (.*?)$/gm, '<li class="ml-4">$1</li>');

    // Wrap paragraphs
    if (!html.startsWith('<h')) {
      html = `<p class="mb-2">${html}</p>`;
    }

    // Properly wrap list items
    html = html.replace(/(<li class="ml-4">.*?<\/li>)/s, (match) => {
      return `<ul class="list-disc mb-2">${match}</ul>`;
    });

    return html;
  }

  /**
   * Copy summary to clipboard
   */
  async function copyToClipboard() {
    if (!window.currentSummaryMarkdown) return;

    try {
      await navigator.clipboard.writeText(window.currentSummaryMarkdown);
      
      const originalText = copySummaryModalBtn.textContent;
      copySummaryModalBtn.textContent = '✓ Copied!';
      setTimeout(() => {
        copySummaryModalBtn.textContent = originalText;
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }

  /**
   * Modal control functions
   */
  function openSummaryModal(date) {
    const dateObj = new Date(date + 'T00:00:00');
    const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    summaryDateLabel.textContent = dateStr;
    
    summaryModal.classList.remove('hidden');
    summaryModal.classList.add('flex');
  }

  function closeSummaryModal() {
    summaryModal.classList.add('hidden');
    summaryModal.classList.remove('flex');
    resetModal();
  }

  function resetModal() {
    summaryModalText.classList.add('hidden');
    summaryModalFooter.classList.add('hidden');
    summaryModalError.classList.add('hidden');
    summaryModalLoading.classList.add('hidden');
  }

  function showLoading() {
    summaryModalLoading.classList.remove('hidden');
  }

  function hideLoading() {
    summaryModalLoading.classList.add('hidden');
  }

  function showFooter() {
    summaryModalFooter.classList.remove('hidden');
  }

  function showError(message) {
    summaryModalError.textContent = message;
    summaryModalError.classList.remove('hidden');
    summaryModalLoading.classList.add('hidden');
  }

  function hideError() {
    summaryModalError.classList.add('hidden');
  }

  // Export for global use
  window.generateDailySummaryForDate = generateDailySummaryForDate;
})();
