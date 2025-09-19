const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 300
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('=== TESTING ENUM VALUE MISMATCH ===\n');

  console.log('1. Navigating to municipalities page...');
  await page.goto('http://localhost:3001/municipalities');
  await page.waitForLoadState('networkidle');

  console.log('2. Opening TEST_1758310110696 municipality...');

  // Look for our specific test municipality
  const testRow = page.locator('tr').filter({ hasText: 'TEST_1758310110696' }).first();

  if (await testRow.count() > 0) {
    console.log('   Found TEST_1758310110696');
    const editButton = testRow.locator('button:has-text("Edit")');
    await editButton.click();
  } else {
    console.log('   TEST_1758310110696 not found, creating a new one...');

    // Create a new test municipality
    await page.click('button:has-text("Add Municipality")');
    await page.waitForSelector('[role="dialog"]', { state: 'visible' });

    const testName = `TEST_${Date.now()}`;
    await page.fill('input[name="name"]', testName);
    await page.fill('input[name="website_url"]', 'https://test.example.com');
    await page.click('[role="dialog"] button:has-text("Create Municipality")');

    await page.waitForTimeout(2000);

    // Now open it for editing
    const newTestRow = page.locator('tr').filter({ hasText: testName }).first();
    const editButton = newTestRow.locator('button:has-text("Edit")');
    await editButton.click();
  }

  await page.waitForSelector('[role="dialog"]', { state: 'visible' });

  console.log('3. Switching to Bylaw Data tab...');
  await page.click('button[role="tab"]:has-text("Bylaw Data")');
  await page.waitForTimeout(1000);

  console.log('\n4. Filling in data like your client did...\n');

  // Fill in the bylaw number
  await page.fill('input[placeholder*="ordinance"]', '60-94');
  console.log('   Filled Bylaw Number: 60-94');

  // Fill numeric fields as shown in screenshot
  const numericFields = [
    { selector: 'input[placeholder*="Minimum lot size"]', value: '2907' },
    { selector: 'input[placeholder*="Minimum lot width"]', value: '28.5276' },
    { selector: 'input[placeholder*="lot depth"]', value: '98.4252' },
    { selector: 'input[placeholder*="Front setback"]', value: '20' },
    { selector: 'input[placeholder*="Rear setback"]', value: '19.685' },
    { selector: 'input[placeholder*="Side setback"]', value: '6.56' },
    { selector: 'input[placeholder*="Maximum height"]', value: '29.5276' }
  ];

  for (const field of numericFields) {
    try {
      const input = page.locator(field.selector).first();
      if (await input.count() > 0) {
        await input.fill(field.value);
        console.log(`   Filled ${field.selector}: ${field.value}`);
      }
    } catch (e) {
      // Continue if field not found
    }
  }

  console.log('\n5. Checking dropdown values before save...\n');

  // Check all dropdown fields to see what values they contain
  const selectButtons = await page.locator('[role="dialog"] button[role="combobox"]').all();

  for (let i = 0; i < selectButtons.length; i++) {
    const currentText = await selectButtons[i].textContent();
    console.log(`Dropdown ${i + 1}: Current value = "${currentText}"`);

    // Click to open dropdown and see available options
    await selectButtons[i].click();
    await page.waitForTimeout(300);

    // Get all options
    const options = await page.locator('[role="option"]').all();
    console.log(`   Available options:`);

    for (let j = 0; j < Math.min(5, options.length); j++) {
      const optionText = await options[j].textContent();
      const optionValue = await options[j].getAttribute('data-value') || optionText;
      console.log(`     - "${optionText}" (value: ${optionValue})`);
    }

    // Close dropdown
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    console.log('');
  }

  console.log('5. Attempting to save to capture the actual request...');

  // Listen for the actual request to see what's being sent
  const requestPromise = page.waitForRequest(
    request => request.url().includes('/bylaw-data') &&
              (request.method() === 'PUT' || request.method() === 'POST'),
    { timeout: 10000 }
  ).catch(() => null);

  // Listen for response
  const responsePromise = page.waitForResponse(
    response => response.url().includes('/bylaw-data') &&
               (response.request().method() === 'PUT' || response.request().method() === 'POST'),
    { timeout: 10000 }
  ).catch(() => null);

  // Click save
  const saveButton = page.locator('[role="dialog"] button').filter({ hasText: /Save/i }).first();
  await saveButton.click();

  const request = await requestPromise;
  if (request) {
    const requestData = request.postDataJSON();
    console.log('\n📤 Request body sent to API:');

    // Check specific enum fields
    const enumFields = [
      'permit_type',
      'owner_occupancy_required',
      'architectural_compatibility',
      'entrance_requirements',
      'utility_connections',
      'septic_sewer_requirements',
      'attached_adu_height_rule',
      'attached_adu_setback_rule',
      'adu_coverage_counting'
    ];

    enumFields.forEach(field => {
      if (requestData[field] !== undefined) {
        console.log(`   ${field}: "${requestData[field]}"`);
      }
    });
  }

  const response = await responsePromise;
  if (response) {
    const status = response.status();
    console.log(`\n📥 Response status: ${status}`);

    if (status !== 200 && status !== 201) {
      const errorBody = await response.json();
      console.log('\n❌ Validation error details:');
      if (errorBody.issues) {
        errorBody.issues.forEach(issue => {
          console.log(`   ${issue.path}: ${issue.message}`);
        });
      }
    }
  }

  // Check for UI error
  await page.waitForTimeout(1000);
  const errorAlert = await page.locator('[role="alert"], .bg-red-50').first();
  if (await errorAlert.count() > 0) {
    const errorText = await errorAlert.textContent();
    console.log('\n❌ UI Error detected:');

    // Parse the error to find mismatches
    const mismatches = errorText.match(/Expected '([^']+)'[^,]+, received '([^']+)'/g);
    if (mismatches) {
      console.log('\nEnum value mismatches found:');
      mismatches.forEach(match => {
        console.log(`   ${match}`);
      });
    }
  }

  console.log('\n=== DIAGNOSIS COMPLETE ===');
  console.log('\nThe frontend Select components are sending different values than expected!');
  console.log('Need to check the Select option values in the frontend code.');

  console.log('\nPress Ctrl+C to close browser');
  await new Promise(() => {});
})();