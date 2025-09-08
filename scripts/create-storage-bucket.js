require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createBucket() {
  try {
    // List existing buckets
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('Error listing buckets:', listError);
      return;
    }
    
    console.log('Existing buckets:', buckets.map(b => b.name));
    
    // Check if documents bucket exists
    const documentsBucket = buckets.find(b => b.name === 'documents');
    
    if (!documentsBucket) {
      console.log('Creating documents bucket...');
      
      const { data, error } = await supabase.storage.createBucket('documents', {
        public: true,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: ['application/pdf']
      });
      
      if (error) {
        console.error('Error creating bucket:', error);
      } else {
        console.log('Bucket created successfully:', data);
      }
    } else {
      console.log('Documents bucket already exists');
    }
    
  } catch (error) {
    console.error('Fatal error:', error);
  }
}

createBucket();