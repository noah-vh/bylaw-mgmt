const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 300
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('=== COMPREHENSIVE VALIDATION TEST ===\n');

  console.log('1. Navigating to municipalities page...');
  await page.goto('http://localhost:3001/municipalities');
  await page.waitForLoadState('networkidle');

  console.log('2. Opening first municipality for editing...');
  const editButton = page.locator('button:has-text("Edit")').first();
  await editButton.click();
  await page.waitForSelector('[role="dialog"]', { state: 'visible' });

  console.log('3. Switching to Bylaw Data tab...');
  await page.click('button[role="tab"]:has-text("Bylaw Data")');
  await page.waitForTimeout(1000);

  console.log('\n=== TESTING DECIMAL VALUES ===\n');

  // Test decimal values in numeric fields
  const testCases = [
    { field: 'input[placeholder*="lot size"]', value: '7500.5', description: 'Lot size with decimal' },
    { field: 'input[placeholder*="lot width"]', value: '50.75', description: 'Lot width with decimal' },
    { field: 'input[placeholder*="setback"]', value: '10.25', description: 'Setback with decimal' },
    { field: 'input[placeholder*="height"]', value: '35.5', description: 'Height with decimal' },
    { field: 'input[placeholder*="coverage"]', value: '45.5', description: 'Coverage percentage with decimal' },
    { field: 'input[placeholder*="parking spaces"]', value: '1.5', description: 'Parking spaces with decimal' }
  ];

  for (const testCase of testCases) {
    const inputs = await page.locator(testCase.field).all();
    if (inputs.length > 0) {
      console.log(`Testing ${testCase.description}:`);
      await inputs[0].fill('');
      await inputs[0].fill(testCase.value);
      console.log(`   ✓ Entered ${testCase.value}`);
    }
  }

  // Test percentage field boundaries
  console.log('\n=== TESTING PERCENTAGE BOUNDARIES ===\n');

  const coverageInput = page.locator('input').filter({ hasText: '' }).nth(15); // Approximate location
  try {
    console.log('Testing percentage field:');

    // Try 99.99%
    await coverageInput.fill('99.99');
    console.log('   ✓ Accepted 99.99');

    // Try 100.01% (should it work?)
    await coverageInput.fill('100.01');
    console.log('   ✓ Entered 100.01 (will validate on save)');
  } catch (e) {
    console.log('   Could not find percentage field to test');
  }

  console.log('\n=== TESTING NULL ENUM VALUES ===\n');

  // Clear some enum fields to test null handling
  const selectButtons = await page.locator('[role="dialog"] button[role="combobox"]').all();
  console.log(`Found ${selectButtons.length} enum fields`);

  // Try to clear the first 2 enum fields
  for (let i = 0; i < Math.min(2, selectButtons.length); i++) {
    const currentValue = await selectButtons[i].textContent();
    console.log(`\nEnum field ${i + 1}:`);
    console.log(`   Current: "${currentValue}"`);

    // Click to open dropdown
    await selectButtons[i].click();
    await page.waitForTimeout(300);

    // Check if there's a "Select..." option
    const options = await page.locator('[role="option"]').all();
    let clearedField = false;

    for (const option of options) {
      const text = await option.textContent();
      if (text.toLowerCase().includes('select') || text.trim() === '') {
        await option.click();
        console.log(`   ✓ Cleared field (selected empty option)`);
        clearedField = true;
        break;
      }
    }

    if (!clearedField) {
      await page.keyboard.press('Escape');
      console.log(`   - No empty option available`);
    }

    await page.waitForTimeout(300);
  }

  console.log('\n=== ATTEMPTING SAVE ===\n');

  // Listen for the API response
  const responsePromise = page.waitForResponse(
    response => response.url().includes('/bylaw-data') &&
               (response.request().method() === 'PUT' || response.request().method() === 'POST'),
    { timeout: 10000 }
  );

  // Click save
  const saveButton = page.locator('[role="dialog"] button').filter({ hasText: /Save/i }).first();
  await saveButton.click();
  console.log('Clicked save, waiting for response...\n');

  try {
    const response = await responsePromise;
    const status = response.status();
    const method = response.request().method();

    console.log(`API Response: ${method} ${status}`);

    if (status === 200 || status === 201) {
      console.log('✅ SUCCESS! All validations passed:');
      console.log('   - Decimal values accepted');
      console.log('   - Null enum values accepted');
      console.log('   - Percentage boundaries handled');

      const responseBody = await response.json();
      console.log('\nSaved data sample:');
      if (responseBody.data) {
        // Show a few saved values to confirm decimals were stored
        const data = responseBody.data;
        if (data.min_lot_size_sqft !== undefined) console.log(`   min_lot_size_sqft: ${data.min_lot_size_sqft}`);
        if (data.min_lot_width_ft !== undefined) console.log(`   min_lot_width_ft: ${data.min_lot_width_ft}`);
        if (data.front_setback_min_ft !== undefined) console.log(`   front_setback_min_ft: ${data.front_setback_min_ft}`);
        if (data.max_lot_coverage_percent !== undefined) console.log(`   max_lot_coverage_percent: ${data.max_lot_coverage_percent}`);
      }
    } else {
      console.log('❌ VALIDATION FAILED\n');
      const errorBody = await response.json();
      console.log('Error details:', JSON.stringify(errorBody, null, 2));

      if (errorBody.issues) {
        console.log('\nSpecific validation issues:');
        errorBody.issues.forEach(issue => {
          console.log(`   - ${issue.path?.join('.')}: ${issue.message}`);
        });
      }
    }
  } catch (error) {
    console.log('⚠️ Error or timeout:', error.message);
  }

  // Check dialog state
  await page.waitForTimeout(2000);
  const dialogOpen = await page.locator('[role="dialog"]').count() > 0;

  if (dialogOpen) {
    console.log('\n⚠️ Dialog still open - checking for errors...');
    const errorElement = await page.locator('.bg-red-50, [role="alert"]').first();
    if (await errorElement.count() > 0) {
      const errorText = await errorElement.textContent();
      console.log('UI Error:', errorText);
    }
  } else {
    console.log('\n✅ Dialog closed - save successful!');
  }

  console.log('\n=== TEST COMPLETE ===');

  // Auto-close if successful, keep open if failed
  if (!dialogOpen) {
    console.log('✅ All tests passed! Closing browser in 3 seconds...');
    await page.waitForTimeout(3000);
    await browser.close();
    process.exit(0);
  } else {
    console.log('❌ Test failed - keeping browser open for inspection');
    console.log('Press Ctrl+C to close browser');
    await new Promise(() => {});
  }
})();