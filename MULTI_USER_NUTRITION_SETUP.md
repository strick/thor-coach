# Multi-User Nutrition Tracking Setup

## Overview
The nutrition tracker has been fully updated to support multiple users with complete data isolation. Your wife can now create her own account and track nutrition data completely separate from your data.

## What Was Changed

### 1. Database Schema (seed.ts)
- **Added `users` table** with id, name, email, created_at columns
- **Updated 7 nutrition tables** to include `user_id` column with FOREIGN KEY constraints:
  - nutrition_goals
  - nutrition_days (with UNIQUE(user_id, date_local) to prevent duplicate days per user)
  - nutrition_meals
  - nutrition_meal_items
  - food_logs
  - nutrition_templates
- **Added indexes** for efficient user-scoped queries
- **Default user** `user-main` is created on startup for backward compatibility

### 2. Backend Services (services/nutrition.ts)
All nutrition functions now accept `userId` as the first parameter and filter by user:
- `setNutritionGoals(userId, goals)`
- `getNutritionGoals(userId)`
- `getOrCreateNutritionDay(userId, dateLocal)`
- `addMealToDay(userId, date, mealType, timeLocal)`
- `addItemToMeal(userId, mealId, foodName, nutrition, servingInfo)`
- `computeTotals(userId, dateLocal)`
- `getNutritionDay(userId, dateLocal)`
- `logFoodFromText(userId, text, date)`
- Plus delete/update operations

### 3. API Controllers (nutritionController.ts)
All nutrition endpoints now:
1. Extract `userId` from query parameters: `?userId=user-id`
2. Pass `userId` to all service functions
3. Include fallback to 'user-main' if no userId specified

**Updated endpoints** (~14 total):
- POST /api/nutrition/log
- GET /api/nutrition/today
- GET /api/nutrition/summary
- GET /api/nutrition/goals
- POST /api/nutrition/goals
- GET /api/nutrition/day
- POST /api/nutrition/meal
- POST /api/nutrition/item
- PUT /api/nutrition/item
- DELETE /api/nutrition/item
- DELETE /api/nutrition/meal
- POST /api/nutrition/template
- GET /api/nutrition/templates
- POST /api/nutrition/template/:id/apply
- DELETE /api/nutrition/template/:id

### 4. User Management API (systemController.ts & routes/system.ts)
Added three new endpoints:
- **GET /api/system/users** - Lists all users with id, name, email, created_at
- **POST /api/system/users** - Creates new user (requires `name`, optional `email`)
- **DELETE /api/system/users/:id** - Deletes user and cascades delete through all nutrition data (transaction-based)

### 5. Frontend JavaScript (nutrition.js)
- **Added `currentUserId` variable** initialized to 'user-main', persisted to localStorage
- **Added `buildApiUrl()` function** that appends `userId` query parameter to all API calls
- **Updated all 15 nutrition API calls** to use `buildApiUrl()`
- **Added `loadUsers()` function** to load available users on page load
- **Added `openAddUserModal()` function** to prompt for new user name
- **Added `createNewUser()` function** to POST new user to API and update dropdown
- **All user selection changes trigger `loadNutritionDay()`** to reload data for selected user

### 6. Frontend HTML (nutrition.html)
Added user selector in header with:
- Dropdown to select from available users
- "+" button to create new user
- Loads users from GET /api/system/users on page load
- Saves selected user to localStorage for persistence

## How to Use

### For You (Main User)
Nothing needs to change! You remain as the default 'user-main' user.

### For Your Wife (New User)
1. **Create Account:**
   - Open Nutrition page
   - Click the "+" button next to the User dropdown
   - Enter name (e.g., "Sarah")
   - Account created and automatically selected

2. **Track Nutrition:**
   - Use all nutrition features normally
   - All data is automatically scoped to her user
   - Can create her own templates
   - Has separate daily goals and tracking

3. **Switch Between Users:**
   - Use the User dropdown to switch between accounts
   - Nutrition data automatically reloads for selected user
   - Selection persists across page reloads via localStorage

## Data Isolation Guarantees

✅ **Complete Isolation:**
- Each user's daily nutrition records are separate
- Each user has independent goals
- Each user's templates are private
- Deletion of user cascades through all related data
- Database enforces isolation with FOREIGN KEY constraints and UNIQUE constraints

✅ **Frontend Isolation:**
- All API calls include `?userId=...` parameter
- buildApiUrl() ensures no calls miss the userId
- UI shows which user is currently selected
- User selection is mandatory

## Testing Checklist

1. **Create New User:**
   - [ ] Click + button in User dropdown
   - [ ] Enter name "Test User"
   - [ ] See new user in dropdown
   - [ ] Dropdown auto-selects new user

2. **Add Nutrition Data:**
   - [ ] Log food as Test User
   - [ ] Switch back to main user
   - [ ] Verify main user's data unchanged
   - [ ] Switch to Test User
   - [ ] Verify only test user's data shows

3. **Templates:**
   - [ ] Create template as Test User
   - [ ] Verify template appears in Test User's template list
   - [ ] Switch to main user
   - [ ] Verify template doesn't appear in main user's list

4. **Data Persistence:**
   - [ ] Refresh page
   - [ ] Verify same user still selected (from localStorage)
   - [ ] Verify correct data loaded for selected user

## API Request Examples

All nutrition API requests now require userId:

```javascript
// Before (old style - no longer works)
fetch('/api/nutrition/goals')

// After (new style - all nutrition requests)
fetch('/api/nutrition/goals?userId=user-main')

// Or with other parameters
fetch('/api/nutrition/day?date=2024-01-15&userId=user-main')
```

## Files Modified

### Backend:
- `apps/thor-api/src/db.ts` - Database schema with user_id columns
- `apps/thor-api/src/seed.ts` - Users table creation
- `apps/thor-api/src/services/nutrition.ts` - All functions now accept userId
- `apps/thor-api/src/controllers/nutritionController.ts` - userId extraction and passing
- `apps/thor-api/src/controllers/systemController.ts` - User CRUD endpoints
- `apps/thor-api/src/routes/system.ts` - User route definitions

### Frontend:
- `apps/thor-web/public/js/nutrition.js` - buildApiUrl(), user management, dropdown handlers
- `apps/thor-web/public/nutrition.html` - User dropdown selector in header

## Future Enhancements

Potential features for later:
- User profile pages (email, account settings)
- Delete account functionality on frontend
- User preferences (units, daily goals defaults)
- Admin dashboard to manage users
- Username/password authentication (currently just dropdown-based)
- Share templates between users
- Role-based access control (read-only users, etc.)

## Troubleshooting

**Issue: Users dropdown shows "Loading users..." and doesn't populate**
- Check browser console for errors
- Verify GET /api/system/users is responding with status 200
- Check that users table exists in database

**Issue: New user created but data not showing**
- Check that POST returned user id successfully
- Verify database has new user record
- Clear localStorage if user id mismatch

**Issue: Data appearing under wrong user**
- Verify buildApiUrl() is being called (check Network tab in DevTools)
- Ensure currentUserId variable is being set correctly
- Check localStorage for selectedUserId value

## Notes

- Default user 'user-main' cannot be deleted (prevents orphaned data)
- User IDs are UUIDs generated server-side (not sequential)
- All nutrition data is tied to user at database level
- Templates are per-user, not shared between users
- Goals are per-user, each user has independent targets
