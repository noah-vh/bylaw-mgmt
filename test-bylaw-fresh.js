const { chromium } = require('playwright');

(async () => {
  // Launch browser with fresh context (no cache)
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500
  });

  // Create a new context with cache disabled
  const context = await browser.newContext({
    bypassCSP: true,
    ignoreHTTPSErrors: true,
    // Disable cache
    offline: false
  });

  const page = await context.newPage();

  // Clear any service workers or storage
  await context.clearCookies();

  console.log('1. Navigating to municipalities page with fresh context (no cache)...');
  await page.goto('http://localhost:3001/municipalities', {
    waitUntil: 'networkidle'
  });

  // Force reload to ensure fresh data
  await page.reload({ waitUntil: 'networkidle' });

  console.log('2. Waiting for page to fully load...');
  await page.waitForTimeout(2000);

  // Find the first municipality with bylaw data (Brampton should be ID 4)
  console.log('3. Looking for Brampton municipality to edit...');

  // Try to find Brampton specifically
  const bramptonRow = page.locator('tr').filter({ hasText: 'Brampton' }).first();

  if (await bramptonRow.count() > 0) {
    console.log('   Found Brampton row, clicking Edit button...');
    const editButton = bramptonRow.locator('button:has-text("Edit")');
    await editButton.click();
  } else {
    console.log('   Brampton not found, using first municipality...');
    const editButton = page.locator('button:has-text("Edit")').first();
    await editButton.click();
  }

  // Wait for dialog to open
  await page.waitForSelector('[role="dialog"]', { state: 'visible' });
  console.log('4. Dialog opened successfully');

  // Switch to Bylaw Data tab
  console.log('5. Switching to Bylaw Data tab...');
  await page.click('button[role="tab"]:has-text("Bylaw Data")');
  await page.waitForTimeout(1500);

  // Check what data is loaded in the form
  console.log('6. Checking loaded data in form...');

  // Try to read the current values of the enum fields
  const selectButtons = await page.locator('[role="dialog"] button[role="combobox"]').all();
  console.log(`   Found ${selectButtons.length} select/dropdown fields`);

  for (let i = 0; i < Math.min(3, selectButtons.length); i++) {
    const text = await selectButtons[i].textContent();
    console.log(`   Select ${i + 1}: "${text}"`);
  }

  // Don't make any changes, just try to save to see if existing data causes errors
  console.log('\n7. Attempting to save WITHOUT making changes (testing existing data)...');
  const saveButton = page.locator('[role="dialog"] button').filter({ hasText: /Save/i }).first();

  if (await saveButton.count() > 0) {
    await saveButton.click();
    console.log('   Clicked save button');
  } else {
    console.log('   ⚠️ Could not find save button');
  }

  // Wait for response
  console.log('8. Waiting for server response...');
  await page.waitForTimeout(3000);

  // Check for any error messages
  console.log('9. Checking for validation errors...');

  // Look for error alerts with more specific selectors
  const errorSelectors = [
    '[role="alert"]',
    '.text-destructive',
    '.text-red-500',
    '.bg-red-50',
    'div:has-text("Failed to save")',
    'div:has-text("Invalid enum")'
  ];

  let foundError = false;
  for (const selector of errorSelectors) {
    const errorElement = page.locator(selector).first();
    if (await errorElement.count() > 0) {
      const errorText = await errorElement.textContent();
      if (errorText && errorText.length > 0) {
        console.log(`\n❌ ERROR FOUND (${selector}):`);
        console.log(errorText);
        foundError = true;
        break;
      }
    }
  }

  if (!foundError) {
    // Check if success message appeared
    const successMessage = page.locator('div:has-text("saved successfully")').first();
    if (await successMessage.count() > 0) {
      console.log('\n✅ SUCCESS: Data saved successfully!');
      console.log('No validation errors occurred.');
    } else {
      console.log('\n⚠️ No error detected, but also no success message');
      console.log('The save may have completed silently or is still processing');
    }
  }

  // Check dialog status
  const dialogStillOpen = await page.locator('[role="dialog"]').count() > 0;
  console.log(`\nDialog status: ${dialogStillOpen ? 'Still open' : 'Closed'}`);

  console.log('\n⏸️  Browser window will stay open for manual inspection.');
  console.log('Press Ctrl+C to close the browser and exit.');

  // Keep running indefinitely
  await new Promise(() => {});
})();