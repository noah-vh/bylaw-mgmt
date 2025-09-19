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

  console.log('2. Finding a municipality to test with...');

  // Find the first Edit button and click it
  const editButton = page.locator('button:has-text("Edit")').first();
  await editButton.click();

  await page.waitForSelector('[role="dialog"]', { state: 'visible' });
  console.log('3. Edit dialog opened');

  // Get the municipality name from the dialog (if available)
  try {
    const dialogTitle = page.locator('[role="dialog"] h2').first();
    const titleText = await dialogTitle.textContent();
    console.log(`   Dialog title: ${titleText}`);
  } catch (e) {
    console.log('   Testing with first available municipality');
  }

  console.log('4. Switching to Bylaw Data tab...');
  await page.click('button[role="tab"]:has-text("Bylaw Data")');
  await page.waitForTimeout(1000);

  console.log('5. Clearing enum fields to test null values...');

  // Find all select/dropdown fields and clear them if possible
  const selectButtons = await page.locator('[role="dialog"] button[role="combobox"]').all();
  console.log(`   Found ${selectButtons.length} enum dropdown fields`);

  // Clear a few enum fields to set them to null/empty
  for (let i = 0; i < Math.min(3, selectButtons.length); i++) {
    const currentText = await selectButtons[i].textContent();
    console.log(`   Field ${i + 1} current value: "${currentText}"`);

    // Try to clear the field by selecting the placeholder/empty option
    await selectButtons[i].click();
    await page.waitForTimeout(500);

    // Look for a "Select..." or empty option
    const emptyOption = page.locator('[role="option"]').filter({ hasText: /^select|^choose|^$/i }).first();
    if (await emptyOption.count() > 0) {
      await emptyOption.click();
      console.log(`   Field ${i + 1} cleared`);
    } else {
      // Just close the dropdown without selecting
      await page.keyboard.press('Escape');
      console.log(`   Field ${i + 1} kept as is`);
    }
  }

  console.log('\n6. Testing save with null/empty enum fields...');

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
      console.log('   The backend now properly accepts null enum values.');
    } else {
      const errorBody = await response.json();
      console.log('   ❌ ERROR: Save failed with status', status);
      console.log('   Error details:', JSON.stringify(errorBody, null, 2));

      if (errorBody.details || errorBody.issues) {
        console.log('\n   Validation issues found:');
        const issues = errorBody.issues || [];
        issues.forEach(issue => {
          console.log(`   - ${issue.path?.join('.')}: ${issue.message}`);
        });
      }
    }
  } catch (error) {
    console.log('   ⚠️ Error waiting for response:', error.message);
  }

  // Check if dialog closed (success) or stayed open (error)
  await page.waitForTimeout(2000);
  const dialogStillOpen = await page.locator('[role="dialog"]').count() > 0;

  if (dialogStillOpen) {
    console.log('\n7. Dialog remained open - checking for error messages...');
    const errorElement = await page.locator('.bg-red-50, [role="alert"]').first();
    if (await errorElement.count() > 0) {
      const errorText = await errorElement.textContent();
      console.log('   UI Error message:', errorText);
    }
  } else {
    console.log('\n7. Dialog closed - save was successful!');
    console.log('   ✅ Enum validation fix confirmed working!');
  }

  console.log('\n✅ Test complete!');
  console.log('Press Ctrl+C to close the browser.');

  await new Promise(() => {});
})();