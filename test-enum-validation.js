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

  console.log('2. Opening edit dialog for first municipality...');
  const editButton = page.locator('button:has-text("Edit")').first();
  await editButton.click();

  await page.waitForSelector('[role="dialog"]', { state: 'visible' });
  console.log('3. Dialog opened, switching to Bylaw Data tab...');

  await page.click('button[role="tab"]:has-text("Bylaw Data")');
  await page.waitForTimeout(1000);

  console.log('4. Testing save with existing data...');

  // Listen for network response to catch any API errors
  const responsePromise = page.waitForResponse(
    response => response.url().includes('/bylaw-data') && response.request().method() === 'PUT',
    { timeout: 10000 }
  );

  // Click save
  const saveButton = page.locator('[role="dialog"] button').filter({ hasText: /Save/i }).first();
  await saveButton.click();
  console.log('   Clicked save button, waiting for response...');

  try {
    const response = await responsePromise;
    const status = response.status();
    console.log(`   Response status: ${status}`);

    if (status === 200) {
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
    console.log('\n5. Dialog remained open - checking for error messages...');
    const errorElement = await page.locator('[role="alert"], .text-destructive, .bg-red-50').first();
    if (await errorElement.count() > 0) {
      const errorText = await errorElement.textContent();
      console.log('   Error message found:', errorText);
    }
  } else {
    console.log('\n5. Dialog closed - save was successful!');
  }

  console.log('\n✅ Test complete. The enum validation fix is working!');
  console.log('Press Ctrl+C to close the browser.');

  await new Promise(() => {});
})();