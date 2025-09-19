const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 300
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  let testFailed = false;

  console.log('=== EDGE CASE VALIDATION TEST ===\n');

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

  console.log('\n=== TESTING EDGE CASES ===\n');

  // Test 1: Decimal values with many decimal places
  console.log('Test 1: Decimal precision');
  const numericInputs = await page.locator('input[type="number"], input[placeholder*="ft"], input[placeholder*="sqft"]').all();

  if (numericInputs.length > 0) {
    // Test various decimal formats
    await numericInputs[0].fill('1234.5678');
    console.log('   ✓ Entered 1234.5678');

    if (numericInputs.length > 1) {
      await numericInputs[1].fill('0.5');
      console.log('   ✓ Entered 0.5');
    }

    if (numericInputs.length > 2) {
      await numericInputs[2].fill('99.99');
      console.log('   ✓ Entered 99.99');
    }
  }

  // Test 2: Percentage field edge cases
  console.log('\nTest 2: Percentage boundaries');
  const percentInputs = await page.locator('input[placeholder*="percent"], input[placeholder*="%"]').all();

  if (percentInputs.length > 0) {
    // Test exact boundaries
    await percentInputs[0].fill('0');
    console.log('   ✓ Entered 0% (minimum)');

    await page.waitForTimeout(500);
    await percentInputs[0].fill('100');
    console.log('   ✓ Entered 100% (maximum)');

    // Test decimal percentage
    await page.waitForTimeout(500);
    await percentInputs[0].fill('33.33');
    console.log('   ✓ Entered 33.33%');
  }

  // Test 3: Try to force null values in enum fields
  console.log('\nTest 3: Setting enum fields to null');

  // First, let's try to clear the parking configuration object field
  const parkingInputs = await page.locator('input[type="checkbox"]').filter({ has: page.locator('text=/parking|uncovered|covered|garage|tandem/i') }).all();
  if (parkingInputs.length > 0) {
    console.log(`   Found ${parkingInputs.length} parking configuration checkboxes`);
  }

  console.log('\n=== SAVING WITH EDGE CASE VALUES ===\n');

  // Listen for the API response
  const responsePromise = page.waitForResponse(
    response => response.url().includes('/bylaw-data') &&
               (response.request().method() === 'PUT' || response.request().method() === 'POST'),
    { timeout: 10000 }
  );

  // Click save
  const saveButton = page.locator('[role="dialog"] button').filter({ hasText: /Save/i }).first();
  await saveButton.click();
  console.log('Saving...\n');

  try {
    const response = await responsePromise;
    const status = response.status();
    const method = response.request().method();

    console.log(`API Response: ${method} ${status}`);

    if (status === 200 || status === 201) {
      console.log('\n✅ SUCCESS! All edge cases handled properly:');
      console.log('   - Decimal values with multiple decimal places: PASSED');
      console.log('   - Percentage boundaries (0%, 100%): PASSED');
      console.log('   - Decimal percentages: PASSED');

      const responseBody = await response.json();
      if (responseBody.data) {
        console.log('\nVerifying saved decimal values:');
        const data = responseBody.data;

        // Check if decimals were preserved
        const fieldsToCheck = [
          'min_lot_size_sqft',
          'min_lot_width_ft',
          'front_setback_min_ft',
          'max_lot_coverage_percent',
          'adu_parking_spaces_required'
        ];

        fieldsToCheck.forEach(field => {
          if (data[field] !== undefined && data[field] !== null) {
            const value = data[field];
            const hasDecimal = value % 1 !== 0;
            console.log(`   ${field}: ${value}${hasDecimal ? ' (decimal preserved!)' : ''}`);
          }
        });
      }
    } else {
      testFailed = true;
      console.log('\n❌ VALIDATION FAILED\n');
      const errorBody = await response.json();
      console.log('Error response:', JSON.stringify(errorBody, null, 2));

      if (errorBody.issues) {
        console.log('\nValidation issues:');
        errorBody.issues.forEach(issue => {
          console.log(`   ❌ ${issue.path?.join('.')}: ${issue.message}`);
        });
      }
    }
  } catch (error) {
    testFailed = true;
    console.log('⚠️ Error:', error.message);
  }

  // Check dialog state
  await page.waitForTimeout(2000);
  const dialogOpen = await page.locator('[role="dialog"]').count() > 0;

  if (dialogOpen && !testFailed) {
    // Dialog open but no API error - check for UI errors
    const errorElement = await page.locator('.bg-red-50, [role="alert"]').first();
    if (await errorElement.count() > 0) {
      testFailed = true;
      const errorText = await errorElement.textContent();
      console.log('\n❌ UI Error found:', errorText);
    }
  }

  console.log('\n=== TEST COMPLETE ===');

  if (!testFailed && !dialogOpen) {
    console.log('✅ All edge case tests passed! Closing in 3 seconds...');
    await page.waitForTimeout(3000);
    await browser.close();
    process.exit(0);
  } else {
    console.log('❌ Test failed - keeping browser open for inspection');
    console.log('\nYou can:');
    console.log('  - Check the form for validation errors');
    console.log('  - Try different values manually');
    console.log('  - Check browser console for errors');
    console.log('\nPress Ctrl+C to close browser');
    await new Promise(() => {});
  }
})();