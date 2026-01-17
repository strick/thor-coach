/**
 * Nutrition Tracker Frontend with Voice Input
 */

const API_BASE = `http://${window.location.hostname}:3000/api`;
let currentDate = new Date().toISOString().slice(0, 10);
let nutritionChart = null;
let currentMealId = null;
let currentMealType = null;
let isListening = false;
let actualTotals = {};
let addMealForm = null;

// Speech recognition setup
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;

if (recognition) {
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isListening = true;
    updateMicButton();
  };

  recognition.onend = () => {
    isListening = false;
    updateMicButton();
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    showError(`Voice error: ${event.error}`);
    isListening = false;
    updateMicButton();
  };

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    if (event.results[event.results.length - 1].isFinal) {
      document.getElementById('foodInput').value = transcript;
      showSuccess(`Heard: "${transcript}"`);
    }
  };
}

// DOM elements
const dateInput = document.getElementById('dateInput');
const settingsBtn = document.getElementById('settingsBtn');
const addMealBtn = document.getElementById('addMealBtn');
const settingsModal = document.getElementById('settingsModal');
const addMealModal = document.getElementById('addMealModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const closeAddMealBtn = document.getElementById('closeAddMealBtn');
const goalsForm = document.getElementById('goalsForm');
const voiceBtn = document.getElementById('voiceBtn');
const foodInput = document.getElementById('foodInput');
const addItemBtn = document.getElementById('addItemBtn');
const mealsContainer = document.getElementById('mealsContainer');
const processingIndicator = document.getElementById('processingIndicator');

/**
 * Toggle voice input
 */
function toggleVoiceInput() {
  if (!recognition) {
    showError('Voice input not supported in your browser');
    return;
  }

  if (isListening) {
    recognition.stop();
  } else {
    foodInput.value = '';
    recognition.start();
  }
}

/**
 * Update microphone button appearance
 */
function updateMicButton() {
  if (!voiceBtn) return;
  if (isListening) {
    voiceBtn.classList.add('bg-red-500', 'animate-pulse');
    voiceBtn.textContent = '⏹️';
  } else {
    voiceBtn.classList.remove('bg-red-500', 'animate-pulse');
    voiceBtn.textContent = '🎤';
  }
}

/**
 * Handle adding item to meal
 */
async function handleAddItem() {
  if (!currentMealType) {
    showError('Please select a meal type first');
    return;
  }

  if (!foodInput.value.trim()) {
    showError('Please describe what you ate');
    return;
  }

  // Create meal if not exists
  if (!currentMealId) {
    try {
      const mealResponse = await fetch(`${API_BASE}/nutrition/meal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: currentDate,
          mealType: currentMealType,
          timeLocal: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        })
      });

      if (!mealResponse.ok) {
        throw new Error('Failed to create meal');
      }

      const mealResult = await mealResponse.json();
      currentMealId = mealResult.meal.id;
    } catch (error) {
      console.error('Error creating meal:', error);
      showError('Failed to create meal');
      return;
    }
  }

  // Parse the food description and add item(s)
  showProcessing(true);
  try {
    // Parse nutrition from text using LLM
    console.log('[Nutrition] Parsing food:', foodInput.value);
    const parseResponse = await fetch(`${API_BASE}/nutrition/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: foodInput.value })
    });

    if (!parseResponse.ok) {
      throw new Error('Failed to parse nutrition');
    }

    const parsed = await parseResponse.json();
    console.log('[Nutrition] Parsed result:', parsed);

    // Add each item to the meal
    const { items } = parsed;
    for (const item of items) {
      const itemResponse = await fetch(`${API_BASE}/nutrition/item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealId: currentMealId,
          foodName: item.description || foodInput.value,
          nutrition: {
            calories_kcal: item.calories || 0,
            protein_g: item.protein_g || 0,
            carbs_g: item.carbs_g || 0,
            fat_g: item.fat_g || 0,
            fiber_g: item.fiber_g || 0,
            sugar_g: item.sugar_g || 0,
            added_sugar_g: item.added_sugar_g || 0,
            sodium_mg: item.sodium_mg || 0,
            sat_fat_g: item.saturated_fat_g || 0,
            cholesterol_mg: item.cholesterol_mg || 0,
            potassium_mg: item.potassium_mg || 0,
            calcium_mg: item.calcium_mg || 0
          },
          serving: {
            serving_quantity: item.serving_quantity,
            serving_unit: item.serving_unit,
            serving_display: item.serving_display
          }
        })
      });

      if (!itemResponse.ok) {
        throw new Error('Failed to add item');
      }
    }

    const itemCount = items.length;
    showSuccess(`Added ${itemCount} item${itemCount > 1 ? 's' : ''} to ${currentMealType}!`);
    foodInput.value = '';
    
    // Reset state for next meal
    currentMealId = null;
    currentMealType = null;
    
    // Close modal and reload data
    addMealModal.classList.add('hidden');
    await loadNutritionDay();
  } catch (error) {
    console.error('Error adding item:', error);
    showError('Failed to add item. Try being more specific.');
  } finally {
    showProcessing(false);
  }
}

/**
 * Handle adding meal form submission
 */
async function handleAddMeal(event) {
  event.preventDefault();
  await handleAddItem();
}

/**
 * Select meal type
 */
function selectMealType(type) {
  currentMealType = type;
  
  // Update button styles
  document.querySelectorAll('#addMealModal button[data-meal]').forEach(btn => {
    btn.classList.remove('ring-2', 'ring-indigo-500');
  });
  event.target.classList.add('ring-2', 'ring-indigo-500');
}

/**
 * Save nutrition goals
 */
async function saveGoals(event) {
  event.preventDefault();
  
  try {
    const response = await fetch(`${API_BASE}/nutrition/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        daily_protein_target_g: parseInt(document.getElementById('proteinTargetInput').value) || 200,
        max_daily_sodium_mg: parseInt(document.getElementById('sodiumTargetInput').value) || 2300,
        min_daily_fiber_g: parseInt(document.getElementById('fiberTargetInput').value) || 30,
        max_daily_saturated_fat_g: parseInt(document.getElementById('satFatTargetInput').value) || 20,
        max_daily_cholesterol_mg: parseInt(document.getElementById('cholesterolTargetInput').value) || 200,
        max_daily_added_sugar_g: parseInt(document.getElementById('sugarTargetInput').value) || 25,
        diet_style: 'DASH'
      })
    });

    if (response.ok) {
      showSuccess('Goals saved!');
      updateTargetDisplays();
    } else {
      showError('Failed to save goals');
    }
  } catch (error) {
    console.error('Error saving goals:', error);
    showError('Failed to save goals');
  }
}

/**
 * Delete a nutrition item
 */
async function deleteNutritionItem(itemId) {
  try {
    const response = await fetch(`${API_BASE}/nutrition/item`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId })
    });

    if (response.ok) {
      showSuccess('Item deleted!');
      // Reload the nutrition day to refresh totals
      loadNutritionDay();
    } else {
      showError('Failed to delete item');
    }
  } catch (error) {
    console.error('Error deleting item:', error);
    showError('Failed to delete item');
  }
}

/**
 * Delete a meal
 */
async function deleteMeal(mealId) {
  try {
    const response = await fetch(`${API_BASE}/nutrition/meal`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mealId })
    });

    if (response.ok) {
      showSuccess('Meal deleted!');
      // Reload the nutrition day to refresh totals
      loadNutritionDay();
    } else {
      showError('Failed to delete meal');
    }
  } catch (error) {
    console.error('Error deleting meal:', error);
    showError('Failed to delete meal');
  }
}

/**
 * Auto-scale macros when serving quantity changes
 */
function handleServingQuantityChange() {
  const editModal = document.getElementById('editItemModal');
  const newQuantity = parseFloat(document.getElementById('editServingQuantity').value) || 0;
  const originalQuantity = parseFloat(editModal.dataset.originalServingQuantity) || 0;

  if (originalQuantity === 0 || newQuantity === 0) {
    return;
  }

  // Calculate the scaling ratio
  const ratio = newQuantity / originalQuantity;
  console.log(`[Nutrition] Scaling macros by ratio: ${ratio} (${originalQuantity}g → ${newQuantity}g)`);

  // Scale all macro values
  const fields = {
    'editCalories': 'originalCalories',
    'editProtein': 'originalProtein',
    'editCarbs': 'originalCarbs',
    'editFat': 'originalFat',
    'editFiber': 'originalFiber',
    'editSodium': 'originalSodium'
  };

  for (const [fieldId, dataAttr] of Object.entries(fields)) {
    const originalValue = parseFloat(editModal.dataset[dataAttr]) || 0;
    const scaledValue = originalValue * ratio;
    document.getElementById(fieldId).value = scaledValue.toFixed(1);
    console.log(`[Nutrition] ${fieldId}: ${originalValue} → ${scaledValue.toFixed(1)}`);
  }
}

/**
 * Open edit item modal
 */
function openEditItemModal(itemId, day) {
  // Find the item in the day's meals
  let item = null;
  for (const meal of day.meals) {
    for (const mealItem of meal.items) {
      if (mealItem.id === itemId) {
        item = mealItem;
        break;
      }
    }
    if (item) break;
  }

  if (!item) {
    showError('Item not found');
    return;
  }

  // Store item ID in a data attribute for saving later
  const editModal = document.getElementById('editItemModal');
  editModal.dataset.itemId = itemId;

  // Store original values for macro scaling calculations
  editModal.dataset.originalServingQuantity = item.serving_quantity || '';
  editModal.dataset.originalCalories = item.calories_kcal || '';
  editModal.dataset.originalProtein = item.protein_g || '';
  editModal.dataset.originalCarbs = item.carbs_g || '';
  editModal.dataset.originalFat = item.fat_g || '';
  editModal.dataset.originalFiber = item.fiber_g || '';
  editModal.dataset.originalSodium = item.sodium_mg || '';

  // Populate form with current values
  document.getElementById('editFoodName').value = item.food_name || '';
  document.getElementById('editServingQuantity').value = item.serving_quantity || '';
  document.getElementById('editServingUnit').value = item.serving_unit || '';
  document.getElementById('editCalories').value = item.calories_kcal || '';
  document.getElementById('editProtein').value = item.protein_g || '';
  document.getElementById('editCarbs').value = item.carbs_g || '';
  document.getElementById('editFat').value = item.fat_g || '';
  document.getElementById('editFiber').value = item.fiber_g || '';
  document.getElementById('editSodium').value = item.sodium_mg || '';

  // Show modal
  editModal.classList.remove('hidden');
}

/**
 * Save edited item
 */
async function saveEditedItem(event) {
  event.preventDefault();

  const editModal = document.getElementById('editItemModal');
  const itemId = editModal.dataset.itemId;

  if (!itemId) {
    showError('Item ID not found');
    return;
  }

  // Collect form data
  const updates = {
    itemId,
    food_name: document.getElementById('editFoodName').value,
    serving_quantity: parseFloat(document.getElementById('editServingQuantity').value) || 0,
    serving_unit: document.getElementById('editServingUnit').value,
    serving_display: `${parseFloat(document.getElementById('editServingQuantity').value) || 0} ${document.getElementById('editServingUnit').value}`,
    calories_kcal: parseFloat(document.getElementById('editCalories').value) || 0,
    protein_g: parseFloat(document.getElementById('editProtein').value) || 0,
    carbs_g: parseFloat(document.getElementById('editCarbs').value) || 0,
    fat_g: parseFloat(document.getElementById('editFat').value) || 0,
    fiber_g: parseFloat(document.getElementById('editFiber').value) || 0,
    sodium_mg: parseFloat(document.getElementById('editSodium').value) || 0
  };

  console.log('[Nutrition] Saving item edits:', updates);

  try {
    const response = await fetch(`${API_BASE}/nutrition/item`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });

    console.log('[Nutrition] Response status:', response.status);
    const responseData = await response.json();
    console.log('[Nutrition] Response data:', responseData);

    if (response.ok) {
      showSuccess('Item updated!');
      editModal.classList.add('hidden');
      await loadNutritionDay();
    } else {
      showError('Failed to update item');
    }
  } catch (error) {
    console.error('Error updating item:', error);
    showError('Failed to update item');
  }
}

/**
 * Load nutrition day
 */
async function loadNutritionDay() {
  try {
    console.log('[Nutrition] Loading nutrition day for date:', currentDate);
    const response = await fetch(`${API_BASE}/nutrition/day?date=${currentDate}`);
    const day = await response.json();
    console.log('[Nutrition] Received day data:', day);
    displayNutritionDay(day);
  } catch (error) {
    console.error('Error loading nutrition day:', error);
    showError('Failed to load nutrition data');
  }
}

/**
 * Load nutrition goals
 */
async function loadGoals() {
  try {
    const response = await fetch(`${API_BASE}/nutrition/goals`);
    const goals = await response.json();
    
    if (goals && goals.id) {
      document.getElementById('proteinTargetInput').value = goals.daily_protein_target_g || 200;
      document.getElementById('sodiumTargetInput').value = goals.max_daily_sodium_mg || 2300;
      document.getElementById('fiberTargetInput').value = goals.min_daily_fiber_g || 30;
      document.getElementById('satFatTargetInput').value = goals.max_daily_saturated_fat_g || 20;
      document.getElementById('cholesterolTargetInput').value = goals.max_daily_cholesterol_mg || 200;
      document.getElementById('sugarTargetInput').value = goals.max_daily_added_sugar_g || 25;

      updateTargetDisplays();
    }
  } catch (error) {
    console.error('Error loading goals:', error);
  }
}

/**
 * Update nutrient target displays
 */
function updateTargetDisplays() {
  updateNutrientCard('protein', actualTotals.protein_g || 0, 200, 'gte');
  updateNutrientCard('sodium', actualTotals.sodium_mg || 0, 2300, 'lte');
  updateNutrientCard('fiber', actualTotals.fiber_g || 0, 30, 'gte');
  updateNutrientCard('satFat', actualTotals.sat_fat_g || 0, 20, 'lte');
  updateNutrientCard('cholesterol', actualTotals.cholesterol_mg || 0, 200, 'lte');
  updateNutrientCard('sugar', actualTotals.added_sugar_g || 0, 25, 'lte');
}

/**
 * Display nutrition day
 */
function displayNutritionDay(day) {
  console.log('[Nutrition] displayNutritionDay called with:', day);
  console.log('[Nutrition] mealsContainer element:', mealsContainer);
  
  if (!day || !day.meals) {
    console.log('[Nutrition] No meals found');
    mealsContainer.innerHTML = '<div class="text-center py-8 text-neutral-500 dark:text-neutral-400"><p>No meals logged yet. Add a meal to get started!</p></div>';
    updateChart({});
    return;
  }

  console.log('[Nutrition] Found', day.meals.length, 'meals');

  // Get targets and totals
  const targets = day.targets || {
    protein_g: 200,
    sodium_mg_max: 2300,
    fiber_g: 30,
    sat_fat_g_max: 20,
    cholesterol_mg_max: 200,
    added_sugar_g_max: 25
  };

  const totals = day.totals || {
    protein_g: 0,
    sodium_mg: 0,
    fiber_g: 0,
    sat_fat_g: 0,
    cholesterol_mg: 0,
    added_sugar_g: 0,
    calories_kcal: 0,
    carbs_g: 0,
    fat_g: 0
  };

  console.log('[Nutrition] Totals:', totals);
  actualTotals = totals;

  // Calculate cholesterol excluding eggs
  let eggCholesterol = 0;
  let nonEggCholesterol = totals.cholesterol_mg || 0;
  
  if (day.meals && Array.isArray(day.meals)) {
    day.meals.forEach(meal => {
      if (meal.items && Array.isArray(meal.items)) {
        meal.items.forEach(item => {
          if (item.food_name && item.food_name.toLowerCase().includes('egg')) {
            eggCholesterol += item.cholesterol_mg || 0;
          }
        });
      }
    });
    nonEggCholesterol = Math.max(0, (totals.cholesterol_mg || 0) - eggCholesterol);
  }

  // Update progress cards
  updateNutrientCard('protein', totals.protein_g || 0, targets.protein_g, 'gte');
  updateCaloriesCard(totals.calories_kcal || 0);
  updateNutrientCard('sodium', totals.sodium_mg || 0, targets.sodium_mg_max, 'lte');
  updateNutrientCard('fiber', totals.fiber_g || 0, targets.fiber_g, 'gte');
  updateNutrientCard('satFat', totals.sat_fat_g || 0, targets.sat_fat_g_max, 'lte');
  updateCholesterolCard(nonEggCholesterol, eggCholesterol, targets.cholesterol_mg_max || 200);
  updateNutrientCard('sugar', totals.added_sugar_g || 0, targets.added_sugar_g_max, 'lte');

  // Display meals
  const mealsHtml = day.meals.map(meal => {
    console.log('[Nutrition] Rendering meal:', meal.meal_type, 'items:', meal.items?.length || 0);
    return renderMealCard(meal);
  }).join('');
  console.log('[Nutrition] Meals HTML length:', mealsHtml.length);
  console.log('[Nutrition] First 500 chars of HTML:', mealsHtml.substring(0, 500));
  mealsContainer.innerHTML = mealsHtml;
  console.log('[Nutrition] mealsContainer HTML set. Current innerHTML length:', mealsContainer.innerHTML.length);

  // Attach event listeners for delete buttons
  document.querySelectorAll('.delete-item-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const itemId = btn.getAttribute('data-item-id');
      deleteNutritionItem(itemId);
    });
  });

  // Attach event listeners for edit buttons
  document.querySelectorAll('.edit-item-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const itemId = btn.getAttribute('data-item-id');
      openEditItemModal(itemId, day);
    });
  });

  document.querySelectorAll('.delete-meal-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const mealId = btn.getAttribute('data-meal-id');
      deleteMeal(mealId);
    });
  });

  // Update chart
  updateChart(totals);
}

/**
 * Render meal card
 */
function renderMealCard(meal) {
  const emoji = {
    breakfast: '🌅',
    lunch: '🥪',
    dinner: '🍽️',
    snack: '🥜'
  }[meal.meal_type] || '🍽️';

  let itemsHtml = '';
  if (meal.items && meal.items.length > 0) {
    itemsHtml = `
      <div class="mt-3 space-y-2">
        <div class="text-xs font-medium text-neutral-500 dark:text-neutral-400">Items:</div>
        ${meal.items.map(item => `
          <div class="flex items-start justify-between bg-neutral-50 dark:bg-neutral-900 p-2 rounded text-sm">
            <div>
              <div class="font-medium">${item.food_name}</div>
              <div class="text-xs text-neutral-500 dark:text-neutral-400">${item.serving_display || item.serving_quantity + ' ' + item.serving_unit}</div>
            </div>
            <div class="flex items-center gap-2">
              <div class="text-right text-xs">
                <div class="text-neutral-600 dark:text-neutral-300">${Math.round(item.calories_kcal || 0)} cal</div>
                <div class="text-neutral-500 dark:text-neutral-400">${Math.round(item.protein_g || 0)}g protein</div>
              </div>
              <button class="edit-item-btn text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-400 p-1" data-item-id="${item.id}" title="Edit item">
                ✏️
              </button>
              <button class="delete-item-btn text-red-500 hover:text-red-700 dark:hover:text-red-400 p-1" data-item-id="${item.id}" title="Delete item">
                ✕
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  return `
    <div class="border-l-4 border-indigo-500 bg-neutral-50 dark:bg-neutral-900 p-4 rounded">
      <div class="flex items-center justify-between mb-2">
        <h3 class="font-semibold capitalize">${emoji} ${meal.meal_type}</h3>
        <div class="flex items-center gap-2">
          <span class="text-sm text-neutral-500">${meal.time_local || '—'}</span>
          <button class="delete-meal-btn text-red-500 hover:text-red-700 dark:hover:text-red-400 text-lg" data-meal-id="${meal.id}" title="Delete meal">
            🗑️
          </button>
        </div>
      </div>
      <div class="grid grid-cols-4 gap-2 text-sm">
        <div><span class="text-neutral-500">Calories:</span> <span class="font-medium">${Math.round(meal.calories_kcal || 0)}</span></div>
        <div><span class="text-neutral-500">Protein:</span> <span class="font-medium">${Math.round(meal.protein_g || 0)}g</span></div>
        <div><span class="text-neutral-500">Carbs:</span> <span class="font-medium">${Math.round(meal.carbs_g || 0)}g</span></div>
        <div><span class="text-neutral-500">Fat:</span> <span class="font-medium">${Math.round(meal.fat_g || 0)}g</span></div>
      </div>
      ${itemsHtml}
    </div>
  `;
}

/**
 * Update nutrient card
 */
function updateNutrientCard(nutrient, actual, target, comparison) {
  const actualElement = document.getElementById(`${nutrient}Actual`);
  const targetElement = document.getElementById(`${nutrient}Target`);
  const barElement = document.getElementById(`${nutrient}Bar`);
  const statusElement = document.getElementById(`${nutrient}Status`);

  if (!actualElement) return;

  actualElement.textContent = Math.round(actual);
  targetElement.textContent = Math.round(target);

  // Calculate percentage
  let percentage;
  if (comparison === 'gte') {
    percentage = Math.min((actual / target) * 100, 100);
  } else {
    percentage = (actual / target) * 100;
  }

  barElement.style.width = percentage + '%';

  // Update status
  let status;
  if (comparison === 'gte') {
    status = actual >= target ? `✓ Goal met (${Math.round((actual / target) * 100)}%)` : `Below target (${Math.round((actual / target) * 100)}%)`;
  } else {
    status = actual <= target ? '✓ Within limits' : `⚠️ Exceeded (${Math.round((actual / target) * 100)}%)`;
  }

  statusElement.textContent = status;
}

/**
 * Update calories card
 */
function updateCaloriesCard(calories) {
  const actualElement = document.getElementById('caloriesActual');
  const barElement = document.getElementById('caloriesBar');
  const statusElement = document.getElementById('caloriesStatus');

  if (!actualElement) return;

  actualElement.textContent = Math.round(calories);

  // Estimate daily calorie needs (2000 kcal average, 2500 for active people)
  const estimatedDailyNeed = 2000;
  const percentage = Math.min((calories / estimatedDailyNeed) * 100, 100);
  barElement.style.width = percentage + '%';

  // Update status
  if (calories < 1500) {
    statusElement.textContent = 'Low intake';
  } else if (calories < 2000) {
    statusElement.textContent = 'Good pace';
  } else if (calories < 2500) {
    statusElement.textContent = '✓ Meeting needs';
  } else {
    statusElement.textContent = '⚠️ High intake';
  }
}

/**
 * Update cholesterol card (excluding eggs)
 */
function updateCholesterolCard(nonEggCholesterol, eggCholesterol, target) {
  const actualElement = document.getElementById('cholesterolActual');
  const targetElement = document.getElementById('cholesterolTarget');
  const barElement = document.getElementById('cholesterolBar');
  const statusElement = document.getElementById('cholesterolStatus');
  const eggActualElement = document.getElementById('eggCholesterolActual');
  const eggBarElement = document.getElementById('eggCholesterolBar');

  if (!actualElement) return;

  actualElement.textContent = Math.round(nonEggCholesterol);
  targetElement.textContent = Math.round(target);
  eggActualElement.textContent = Math.round(eggCholesterol);

  // Calculate percentage for non-egg cholesterol
  const percentage = (nonEggCholesterol / target) * 100;
  barElement.style.width = Math.min(percentage, 100) + '%';

  // Calculate percentage for egg cholesterol (max 100% for display)
  const eggPercentage = Math.min((eggCholesterol / target) * 100, 100);
  eggBarElement.style.width = eggPercentage + '%';

  // Update status (only considers non-egg cholesterol)
  let status;
  if (nonEggCholesterol <= target) {
    status = '✓ Within limits (eggs not counted)';
  } else {
    status = `⚠️ Exceeded (${Math.round((nonEggCholesterol / target) * 100)}%, eggs not counted)`;
  }

  statusElement.textContent = status;
}

/**
 * Update nutrition chart
 */
function updateChart(totals) {
  const ctx = document.getElementById('nutritionChart');
  if (!ctx) return;

  // Destroy existing chart if it exists
  if (window.nutritionChart && typeof window.nutritionChart.destroy === 'function') {
    window.nutritionChart.destroy();
  }

  window.nutritionChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Protein', 'Carbs', 'Fat'],
      datasets: [{
        data: [
          totals.protein_g || 0,
          totals.carbs_g || 0,
          totals.fat_g || 0
        ],
        backgroundColor: ['#6366f1', '#14b8a6', '#f59e0b'],
        borderColor: '#ffffff',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

/**
 * Show processing indicator
 */
function showProcessing(show) {
  if (processingIndicator) {
    processingIndicator.style.display = show ? 'block' : 'none';
  }
}

/**
 * Show success message
 */
function showSuccess(message) {
  const pill = document.getElementById('cfgPill');
  const originalText = pill.textContent;
  const originalClass = pill.className;

  pill.textContent = message;
  pill.className = 'text-xs px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400';

  setTimeout(() => {
    pill.textContent = originalText;
    pill.className = originalClass;
  }, 3000);
}

/**
 * Show error message
 */
function showError(message) {
  const pill = document.getElementById('cfgPill');
  const originalText = pill.textContent;
  const originalClass = pill.className;

  pill.textContent = message;
  pill.className = 'text-xs px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';

  setTimeout(() => {
    pill.textContent = originalText;
    pill.className = originalClass;
  }, 3000);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  dateInput.valueAsDate = new Date();
  loadNutritionDay();
  loadGoals();

  dateInput.addEventListener('change', (e) => {
    currentDate = e.target.value;
    loadNutritionDay();
  });

  settingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
  });

  addMealBtn.addEventListener('click', () => {
    currentMealId = null;
    currentMealType = null;
    foodInput.value = '';
    addMealModal.classList.remove('hidden');
  });

  closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  closeAddMealBtn.addEventListener('click', () => {
    addMealModal.classList.add('hidden');
  });

  // Edit item modal
  const editItemModal = document.getElementById('editItemModal');
  const editItemForm = document.getElementById('editItemForm');
  const closeEditItemBtn = document.getElementById('closeEditItemBtn');
  const editServingQuantity = document.getElementById('editServingQuantity');

  if (!editItemForm) {
    console.error('[Nutrition] Edit item form not found!');
  } else {
    console.log('[Nutrition] Attaching edit form submit listener');
    editItemForm.addEventListener('submit', saveEditedItem);
  }

  // Attach serving quantity change listener for macro auto-scaling
  if (editServingQuantity) {
    editServingQuantity.addEventListener('change', handleServingQuantityChange);
    editServingQuantity.addEventListener('input', handleServingQuantityChange);
    console.log('[Nutrition] Attached serving quantity change listener');
  }

  closeEditItemBtn.addEventListener('click', () => {
    editItemModal.classList.add('hidden');
  });

  // Close edit modal when clicking outside
  editItemModal.addEventListener('click', (e) => {
    if (e.target === editItemModal) {
      editItemModal.classList.add('hidden');
    }
  });

  goalsForm.addEventListener('submit', saveGoals);

  // Meal type buttons
  document.querySelectorAll('.meal-type-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      selectMealType(e.target.dataset.type);
    });
  });

  // Voice button
  if (voiceBtn && recognition) {
    voiceBtn.addEventListener('click', toggleVoiceInput);
  } else if (voiceBtn) {
    voiceBtn.disabled = true;
    voiceBtn.title = 'Voice input not supported';
  }

  // Add item button
  if (addItemBtn) {
    addItemBtn.addEventListener('click', handleAddItem);
  }

  // Form submission
  addMealForm = document.getElementById('addMealForm');
  if (addMealForm) {
    addMealForm.addEventListener('submit', handleAddMeal);
  }

  // Close modals when clicking outside
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.add('hidden');
    }
  });

  addMealModal.addEventListener('click', (e) => {
    if (e.target === addMealModal) {
      addMealModal.classList.add('hidden');
    }
  });
});
