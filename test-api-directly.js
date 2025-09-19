// Test the API directly to see what's happening
const fetch = require('node-fetch');

async function testAPI() {
  const baseUrl = 'http://localhost:3001';
  const municipalityId = 81; // The TEST municipality we created

  console.log('Testing API directly with null enum values...\n');

  // First, let's POST to create initial bylaw data
  const bylawData = {
    bylaw_ordinance_number: '60-94',
    min_lot_size_sqft: 2907,

    // These are the problematic enum fields - sending as null
    permit_type: null,
    owner_occupancy_required: null,
    attached_adu_height_rule: null,
    attached_adu_setback_rule: null,
    adu_coverage_counting: null,
    parking_configuration_allowed: null,
    architectural_compatibility: null,
    entrance_requirements: null,
    utility_connections: null,
    septic_sewer_requirements: null
  };

  console.log('Sending POST request with null enum values...');
  console.log('Body:', JSON.stringify(bylawData, null, 2));

  try {
    const response = await fetch(`${baseUrl}/api/municipalities/${municipalityId}/bylaw-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bylawData)
    });

    const status = response.status;
    const data = await response.json();

    console.log('\nResponse status:', status);

    if (status === 200 || status === 201) {
      console.log('✅ SUCCESS! Null values accepted');
      console.log('Response:', data.message);
    } else if (status === 409) {
      console.log('Bylaw data already exists, trying PUT instead...\n');

      // Try PUT instead
      const putResponse = await fetch(`${baseUrl}/api/municipalities/${municipalityId}/bylaw-data`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bylawData)
      });

      const putStatus = putResponse.status;
      const putData = await putResponse.json();

      console.log('PUT Response status:', putStatus);

      if (putStatus === 200) {
        console.log('✅ SUCCESS! Null values accepted via PUT');
      } else {
        console.log('❌ ERROR:', putData);

        if (putData.issues) {
          console.log('\nValidation issues:');
          putData.issues.forEach(issue => {
            console.log(`  - ${issue.path}: ${issue.message}`);
          });
        }
      }
    } else {
      console.log('❌ ERROR:', data);

      if (data.issues) {
        console.log('\nValidation issues:');
        data.issues.forEach(issue => {
          console.log(`  - ${issue.path}: ${issue.message}`);
        });
      }
    }
  } catch (error) {
    console.error('Request failed:', error);
  }
}

testAPI();