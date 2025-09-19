// Test creating municipality directly via Supabase to bypass API
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testDirectCreate() {
  console.log('Testing direct municipality creation via Supabase...\n');

  const testData = {
    name: `TEST_DIRECT_${Date.now()}`,
    website_url: `https://test${Date.now()}.example.com`,
    status: 'pending'
  };

  console.log('Attempting to create:', testData);

  try {
    // Try to create directly
    const { data, error } = await supabase
      .from('municipalities')
      .insert(testData)
      .select()
      .single();

    if (error) {
      console.log('\n❌ Direct creation failed!');
      console.log('Error code:', error.code);
      console.log('Error message:', error.message);
      console.log('Error details:', error.details);
      console.log('Error hint:', error.hint);

      if (error.code === '42501') {
        console.log('\n🔒 This is a Row Level Security (RLS) issue!');
        console.log('The municipalities table has RLS enabled but no policies allow INSERT.');
        console.log('\nPossible solutions:');
        console.log('1. Add an RLS policy for INSERT operations');
        console.log('2. Use a service role key instead of anon key');
        console.log('3. Temporarily disable RLS (not recommended for production)');
      }
    } else {
      console.log('\n✅ Direct creation succeeded!');
      console.log('Created municipality:', data);

      // Clean up
      console.log('\nCleaning up test data...');
      const { error: deleteError } = await supabase
        .from('municipalities')
        .delete()
        .eq('id', data.id);

      if (!deleteError) {
        console.log('✓ Test data cleaned up');
      }
    }
  } catch (err) {
    console.log('\n⚠️ Unexpected error:', err.message);
  }

  // Also test if we can read municipalities
  console.log('\n--- Testing READ access ---');
  const { data: municipalities, error: readError } = await supabase
    .from('municipalities')
    .select('id, name')
    .limit(3);

  if (readError) {
    console.log('❌ Cannot read municipalities:', readError.message);
  } else {
    console.log(`✅ Can read municipalities (found ${municipalities.length})`);
  }
}

testDirectCreate();