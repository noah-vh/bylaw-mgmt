const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Generate unique test name with timestamp
  const testName = `TEST_AUTO_${Date.now()}`;
  let createdMunicipalityId = null;

  console.log('1. Navigating to municipalities page...');
  await page.goto('http://localhost:3001/municipalities');
  await page.waitForLoadState('networkidle');

  console.log('2. Creating new test municipality...');

  // Look for the create button - might be "Add Municipality" or similar
  const createButton = page.locator('button').filter({ hasText: /create|add.*municipality/i }).first();

  if (await createButton.count() === 0) {
    // Try a plus icon button or other common patterns
    console.log('   Looking for create button...');
    const buttons = await page.locator('button').all();
    for (const button of buttons) {
      const text = await button.textContent();
      console.log(`   Button found: "${text}"`);
    }
  }

  await createButton.click();
  await page.waitForSelector('[role="dialog"]', { state: 'visible' });

  // Fill in the form
  console.log(`   Filling form with name: ${testName}`);

  // Fill in the required fields - both name and website_url are required
  await page.fill('input[name="name"]', testName);
  console.log('   Filled name field');

  await page.fill('input[name="website_url"]', 'https://test.example.com');
  console.log('   Filled website URL field');

  // Find the "Create Municipality" button specifically
  const submitButton = page.locator('[role="dialog"] button:has-text("Create Municipality")');

  // Listen for the API response to see if creation succeeds
  const responsePromise = page.waitForResponse(
    response => response.url().includes('/municipalities') && response.request().method() === 'POST',
    { timeout: 10000 }
  ).catch(() => null);

  console.log('   Clicking Create Municipality button...');
  await submitButton.click();
  console.log('   Form submitted, waiting for response...');

  // Check the response
  const response = await responsePromise;
  if (response) {
    const status = response.status();
    console.log(`   API Response: ${status}`);

    if (status === 200 || status === 201) {
      console.log('   ✅ Test municipality created successfully');
      const responseBody = await response.json();
      createdMunicipalityId = responseBody.data?.id;
    } else {
      const errorBody = await response.json();
      console.log('   ❌ Failed to create municipality:', JSON.stringify(errorBody, null, 2));

      // Check if there's an error message in the UI
      await page.waitForTimeout(1000);
      const errorElement = await page.locator('[role="alert"], .text-destructive').first();
      if (await errorElement.count() > 0) {
        const errorText = await errorElement.textContent();
        console.log('   UI Error:', errorText);
      }

      // Exit early if we can't create the test municipality
      console.log('\n❌ Cannot proceed without creating test municipality');
      await browser.close();
      process.exit(1);
    }
  } else {
    console.log('   ⚠️ No response received from API');
  }

  // Wait a moment for dialog to close or error to appear
  await page.waitForTimeout(2000);

  // Wait for table to refresh
  await page.waitForTimeout(2000);

  console.log('3. Finding and editing the test municipality...');

  // Find the row with our test municipality
  const testRow = page.locator('tr').filter({ hasText: testName }).first();

  if (await testRow.count() > 0) {
    console.log(`   Found test municipality: ${testName}`);

    // Click Edit button in that row
    const editButton = testRow.locator('button:has-text("Edit")');
    await editButton.click();

    await page.waitForSelector('[role="dialog"]', { state: 'visible' });
    console.log('4. Edit dialog opened, switching to Bylaw Data tab...');

    await page.click('button[role="tab"]:has-text("Bylaw Data")');
    await page.waitForTimeout(1000);

    console.log('5. Testing save with empty/null enum fields...');

    // Don't fill any enum fields - leave them as null/empty
    // This tests if the backend properly handles null values

    // Listen for network response
    const responsePromise = page.waitForResponse(
      response => response.url().includes('/bylaw-data') &&
                 (response.request().method() === 'PUT' || response.request().method() === 'POST'),
      { timeout: 10000 }
    );

    // Click save
    const saveButton = page.locator('[role="dialog"] button').filter({ hasText: /Save/i }).first();
    await saveButton.click();
    console.log('   Clicked save button, waiting for response...');

    try {
      const response = await responsePromise;
      const status = response.status();
      const method = response.request().method();
      console.log(`   Response: ${method} ${status}`);

      if (status === 200 || status === 201) {
        console.log('   ✅ SUCCESS: Save completed without validation errors!');
        const responseBody = await response.json();
        console.log('   Response message:', responseBody.message || 'Data saved');
      } else {
        const errorBody = await response.json();
        console.log('   ❌ ERROR: Save failed with status', status);
        console.log('   Error details:', JSON.stringify(errorBody, null, 2));
      }
    } catch (error) {
      console.log('   ⚠️ Timeout or error waiting for response:', error.message);
    }

    // Check if dialog closed (success) or stayed open (error)
    await page.waitForTimeout(2000);
    const dialogStillOpen = await page.locator('[role="dialog"]').count() > 0;

    if (dialogStillOpen) {
      console.log('\n6. Dialog remained open - checking for error messages...');
      const errorElement = await page.locator('[role="alert"], .text-destructive, .bg-red-50').first();
      if (await errorElement.count() > 0) {
        const errorText = await errorElement.textContent();
        console.log('   Error message found:', errorText);
      }
    } else {
      console.log('\n6. Dialog closed - save was successful!');
    }

    // Clean up: Delete the test municipality
    console.log('\n7. Cleaning up test data...');
    await page.waitForTimeout(1000);

    // Find the test municipality row again
    const testRowForDelete = page.locator('tr').filter({ hasText: testName }).first();
    if (await testRowForDelete.count() > 0) {
      // Click delete button
      const deleteButton = testRowForDelete.locator('button:has-text("Delete")');
      await deleteButton.click();

      // Confirm deletion in dialog
      await page.waitForSelector('[role="dialog"]', { state: 'visible' });
      await page.click('[role="dialog"] button:has-text("Delete")');

      console.log('   ✅ Test municipality deleted');
    }

  } else {
    console.log('   ❌ Could not find test municipality in table');
  }

  console.log('\n✅ Test complete!');
  console.log('Press Ctrl+C to close the browser.');

  await new Promise(() => {});
})();