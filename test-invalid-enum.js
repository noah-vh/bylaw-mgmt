// Test what happens when we send completely invalid enum values
const fetch = require('node-fetch');

async function testInvalidEnums() {
  const baseUrl = 'http://localhost:3001';
  const municipalityId = 81; // A test municipality

  console.log('Testing API with INVALID enum values...\n');

  const invalidData = {
    bylaw_ordinance_number: 'TEST-INVALID',

    // These are completely invalid values
    permit_type: 'purple_unicorn',
    owner_occupancy_required: 'maybe_sometimes',
    architectural_compatibility: 'who_knows',
    entrance_requirements: 'through_the_chimney',
    utility_connections: 'steal_from_neighbors',
    septic_sewer_requirements: 'dig_a_hole'
  };

  console.log('Sending PUT request with invalid enum values:');
  console.log(JSON.stringify(invalidData, null, 2));

  try {
    const response = await fetch(`${baseUrl}/api/municipalities/${municipalityId}/bylaw-data`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(invalidData)
    });

    const status = response.status;
    const data = await response.json();

    console.log('\nResponse status:', status);

    if (status === 200) {
      console.log('⚠️ UNEXPECTED: Invalid values were accepted!');
      console.log('This is a problem - invalid enums should be rejected');
    } else {
      console.log('✅ GOOD: Invalid values were rejected');
      console.log('\nError message:', data.error);

      if (data.details) {
        console.log('Details:', data.details);
      }

      if (data.issues) {
        console.log('\nValidation errors for each field:');
        data.issues.forEach(issue => {
          console.log(`  - ${issue.path}: ${issue.message}`);
        });
      }
    }
  } catch (error) {
    console.error('Request failed:', error);
  }
}

testInvalidEnums();