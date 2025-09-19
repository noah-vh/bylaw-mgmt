const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('1. Navigating to municipalities page...');
  await page.goto('http://localhost:3001/municipalities');
  await page.waitForLoadState('networkidle');

  // Find a municipality to edit - using the first edit button
  console.log('2. Opening edit dialog for first municipality...');
  const editButton = page.locator('button:has-text("Edit")').first();
  await editButton.click();

  // Wait for dialog to open
  await page.waitForSelector('[role="dialog"]', { state: 'visible' });

  // Switch to Bylaw Data tab
  console.log('3. Switching to Bylaw Data tab...');
  await page.click('button[role="tab"]:has-text("Bylaw Data")');
  await page.waitForTimeout(1000);

  // Fill in some test data including the enum fields that were causing errors
  console.log('4. Looking for bylaw form fields...');

  // Debug: Let's see what inputs are available
  const inputs = await page.locator('input').all();
  console.log(`   Found ${inputs.length} input fields`);

  // Try to find bylaw number field by different selectors
  const bylawInput = page.locator('input').filter({ hasText: '' }).first();

  try {
    // Fill the first text input we find (should be bylaw number)
    const firstTextInput = page.locator('[role="dialog"] input[type="text"]').first();
    await firstTextInput.fill('TEST-2024-001', { timeout: 5000 });
    console.log('   ✓ Filled bylaw number');
  } catch (e) {
    console.log('   ⚠️ Could not find bylaw number field, continuing...');
  }

  // Now look for the enum select fields
  console.log('5. Testing enum field selections...');

  // Find all select/combobox buttons in the dialog
  const selectButtons = await page.locator('[role="dialog"] button[role="combobox"]').all();
  console.log(`   Found ${selectButtons.length} dropdown fields`);

  // Look for permit type select
  let foundPermitType = false;
  for (let i = 0; i < selectButtons.length; i++) {
    const text = await selectButtons[i].textContent();
    if (text.toLowerCase().includes('permit')) {
      console.log('   - Found permit type dropdown, selecting "By Right"');
      await selectButtons[i].click();
      await page.waitForTimeout(500);

      // Try to click the "By Right" option
      const byRightOption = page.locator('[role="option"]').filter({ hasText: /By Right/i }).first();
      if (await byRightOption.count() > 0) {
        await byRightOption.click();
        foundPermitType = true;
        console.log('   ✓ Selected "By Right" for permit type');
      } else {
        // Try clicking first option
        await page.locator('[role="option"]').first().click();
        console.log('   ✓ Selected first option for permit type');
      }
      break;
    }
  }

  await page.waitForTimeout(500);

  // Look for owner occupancy select
  let foundOwnerOccupancy = false;
  const updatedSelectButtons = await page.locator('[role="dialog"] button[role="combobox"]').all();
  for (let i = 0; i < updatedSelectButtons.length; i++) {
    const text = await updatedSelectButtons[i].textContent();
    if (text.toLowerCase().includes('owner') || text.toLowerCase().includes('occupancy')) {
      console.log('   - Found owner occupancy dropdown, selecting option');
      await updatedSelectButtons[i].click();
      await page.waitForTimeout(500);

      // Try to click "No Requirement" or first option
      const noReqOption = page.locator('[role="option"]').filter({ hasText: /No Requirement/i }).first();
      if (await noReqOption.count() > 0) {
        await noReqOption.click();
        foundOwnerOccupancy = true;
        console.log('   ✓ Selected "No Requirement" for owner occupancy');
      } else {
        // Try clicking first option
        await page.locator('[role="option"]').first().click();
        console.log('   ✓ Selected first option for owner occupancy');
      }
      break;
    }
  }

  // Try to save the form
  console.log('6. Attempting to save bylaw data...');

  // Look for save button
  const saveButton = page.locator('[role="dialog"] button').filter({ hasText: /Save/i }).first();
  if (await saveButton.count() > 0) {
    await saveButton.click();
    console.log('   Clicked save button');
  } else {
    console.log('   ⚠️ Could not find save button');
  }

  // Wait for response and check for errors
  console.log('7. Checking for validation errors...');

  // Wait a bit to see if error appears
  await page.waitForTimeout(3000);

  // Check if the error alert that was in the screenshots is visible
  const errorAlert = page.locator('[role="alert"], .text-destructive, .text-red-500').filter({ hasText: /Failed to save|Invalid enum|permit_type/i });
  const hasError = await errorAlert.count() > 0;

  if (hasError) {
    const errorText = await errorAlert.first().textContent();
    console.log('\n❌ VALIDATION ERROR STILL EXISTS:');
    console.log(errorText);
    console.log('\nThe enum validation errors are still occurring.');
  } else {
    console.log('\n✅ NO VALIDATION ERRORS DETECTED');
    console.log('The dialog remains open for inspection.');
    console.log('Check if a success message appeared or if the data was saved.');
  }

  // DO NOT check if dialog closed - keep it open for manual inspection
  const dialogStillOpen = await page.locator('[role="dialog"]').count() > 0;
  console.log(`\nDialog status: ${dialogStillOpen ? 'Still open' : 'Closed'}`)

  // Keep browser open for manual inspection
  console.log('\n⏸️  Browser window will stay open for manual inspection.');
  console.log('Press Ctrl+C to close the browser and exit.');

  // Keep the script running indefinitely
  await new Promise(() => {});
})();