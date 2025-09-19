const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500,
    devtools: true  // Open devtools to see console errors
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Log console messages from the browser
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('Browser Console Error:', msg.text());
    }
  });

  // Log any page errors
  page.on('pageerror', err => {
    console.log('Page Error:', err.message);
  });

  console.log('1. Navigating to municipalities page...');
  await page.goto('http://localhost:3001/municipalities');
  await page.waitForLoadState('networkidle');

  console.log('2. Opening create dialog...');
  const createButton = page.locator('button').filter({ hasText: /Add Municipality/i }).first();

  if (await createButton.count() === 0) {
    console.log('   ❌ Could not find "Add Municipality" button');
    await browser.close();
    return;
  }

  await createButton.click();
  await page.waitForSelector('[role="dialog"]', { state: 'visible' });
  console.log('   ✓ Dialog opened');

  // Generate test data
  const testName = `TEST_${Date.now()}`;
  const testUrl = `https://test${Date.now()}.example.com`;

  console.log('3. Filling form:');
  console.log(`   Name: ${testName}`);
  console.log(`   URL: ${testUrl}`);

  // Fill the form
  await page.fill('input[name="name"]', testName);
  await page.fill('input[name="website_url"]', testUrl);

  // Listen for the actual request to see what's being sent
  const requestPromise = page.waitForRequest(
    request => request.url().includes('/municipalities') && request.method() === 'POST',
    { timeout: 10000 }
  );

  // Listen for the response
  const responsePromise = page.waitForResponse(
    response => response.url().includes('/municipalities') && response.request().method() === 'POST',
    { timeout: 10000 }
  );

  console.log('\n4. Submitting form...');
  const submitButton = page.locator('[role="dialog"] button:has-text("Create Municipality")');
  await submitButton.click();

  try {
    // Check what was sent
    const request = await requestPromise;
    const requestData = request.postDataJSON();
    console.log('\n📤 Request sent to API:');
    console.log(JSON.stringify(requestData, null, 2));

    // Check the response
    const response = await responsePromise;
    const status = response.status();
    console.log(`\n📥 Response status: ${status}`);

    const responseBody = await response.json();

    if (status === 200 || status === 201) {
      console.log('✅ Municipality created successfully!');
      console.log('Response:', JSON.stringify(responseBody, null, 2));
    } else {
      console.log('❌ Creation failed!');
      console.log('Error response:', JSON.stringify(responseBody, null, 2));

      // Check for specific error types
      if (responseBody.error) {
        console.log('\n🔍 Error Analysis:');

        if (responseBody.error.includes('duplicate') || responseBody.error.includes('already exists')) {
          console.log('   → Duplicate name issue');
        } else if (responseBody.error.includes('validation')) {
          console.log('   → Validation issue');
          if (responseBody.details) {
            console.log('   Details:', responseBody.details);
          }
        } else if (responseBody.error.includes('permission') || responseBody.error.includes('RLS')) {
          console.log('   → Database permission issue (Row Level Security)');
        } else {
          console.log('   → Generic server error');
        }
      }
    }

    // Check for UI error messages
    await page.waitForTimeout(1000);
    const errorAlert = await page.locator('[role="alert"], .text-destructive, .text-red-500').first();
    if (await errorAlert.count() > 0) {
      const uiError = await errorAlert.textContent();
      console.log('\n🖥️ UI Error Message:', uiError);
    }

  } catch (error) {
    console.log('⚠️ Test error:', error.message);
  }

  // Check if we need to clean up
  const dialogClosed = await page.locator('[role="dialog"]').count() === 0;

  if (dialogClosed) {
    console.log('\n5. Cleaning up test data...');

    // Find and delete the test municipality
    const testRow = page.locator('tr').filter({ hasText: testName }).first();

    if (await testRow.count() > 0) {
      const deleteButton = testRow.locator('button:has-text("Delete")');
      await deleteButton.click();

      // Confirm deletion
      await page.waitForSelector('[role="dialog"]', { state: 'visible' });
      await page.click('[role="dialog"] button:has-text("Delete")');
      console.log('   ✓ Test municipality deleted');
    }
  }

  console.log('\n=== DIAGNOSIS COMPLETE ===');
  console.log('\nPossible issues to check:');
  console.log('1. Database permissions (RLS policies)');
  console.log('2. Missing required fields in database');
  console.log('3. Supabase project configuration');
  console.log('4. API route error handling');

  console.log('\nPress Ctrl+C to close browser');
  await new Promise(() => {});
})();